import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventBusService } from "../events/event-bus.service";
import {
  generateOpaqueToken,
  generatePairingCode,
  sha256Hex,
} from "../common/crypto.util";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bus: EventBusService,
  ) {}

  async createPairingCode(ownerId: string, deviceName: string, serverUrl: string) {
    const code = generatePairingCode(8);
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    const pairingCode = await this.prisma.pairingCode.create({
      data: {
        ownerId,
        deviceName,
        codeHash: sha256Hex(code),
        expiresAt,
      },
    });

    const qrPayload = JSON.stringify({ serverUrl, code });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

    await this.audit.record({
      ownerId,
      type: "pairing.created",
      metadata: { pairingCodeId: pairingCode.id, deviceName },
    });

    return {
      pairingCodeId: pairingCode.id,
      code,
      qrPayload,
      qrDataUrl,
      expiresAt,
    };
  }

  // Atomic single-use redemption: the conditional UPDATE below only succeeds
  // for the first caller to hit a PENDING, unexpired code; concurrent or
  // repeat attempts see updateCount === 0 and are rejected as invalid.
  async redeemPairingCode(
    code: string,
    deviceMeta: { model?: string; androidVersion?: string; appVersion?: string },
  ) {
    const codeHash = sha256Hex(code.toUpperCase().trim());
    const pairingCode = await this.prisma.pairingCode.findUnique({ where: { codeHash } });

    if (!pairingCode) {
      throw new BadRequestException({ code: "invalid_code", message: "Invalid pairing code." });
    }

    if (pairingCode.status !== "PENDING" || pairingCode.expiresAt < new Date()) {
      throw new BadRequestException({
        code: "expired_or_used",
        message: "This pairing code has expired or already been used.",
      });
    }

    const secret = generateOpaqueToken();
    const { device, credential } = await this.prisma.$transaction(async (tx) => {
      // The conditional UPDATE (status: PENDING) is the atomic compare-and-set:
      // under concurrent redemption attempts for the same code, exactly one
      // transaction's updateMany sees count === 1 and commits; the other sees
      // count === 0, throws, and the whole transaction (including its device
      // row) rolls back automatically.
      const consumeResult = await tx.pairingCode.updateMany({
        where: { id: pairingCode.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "CONSUMED", consumedAt: new Date() },
      });
      if (consumeResult.count === 0) {
        throw new BadRequestException({
          code: "expired_or_used",
          message: "This pairing code has expired or already been used.",
        });
      }

      const device = await tx.device.create({
        data: {
          ownerId: pairingCode.ownerId,
          name: pairingCode.deviceName,
          model: deviceMeta.model,
          androidVersion: deviceMeta.androidVersion,
          appVersion: deviceMeta.appVersion,
        },
      });
      await tx.pairingCode.update({
        where: { id: pairingCode.id },
        data: { consumedByDeviceId: device.id },
      });
      const credential = await tx.deviceCredential.create({
        data: { deviceId: device.id, tokenHash: sha256Hex(secret) },
      });
      return { device, credential };
    });

    await this.audit.record({
      ownerId: pairingCode.ownerId,
      deviceId: device.id,
      type: "pairing.consumed",
      metadata: { pairingCodeId: pairingCode.id },
    });

    this.bus.publish(pairingCode.ownerId, {
      type: "device.updated",
      payload: { id: device.id, name: device.name, status: "ACTIVE", justPaired: true },
    });

    return {
      deviceId: device.id,
      deviceToken: `${credential.id}.${secret}`,
      deviceName: device.name,
    };
  }

  async listDevices(ownerId: string) {
    const devices = await this.prisma.device.findMany({
      where: { ownerId },
      include: { simSlots: true },
      orderBy: { createdAt: "desc" },
    });
    return devices.map((d) => this.toDeviceView(d));
  }

  async getDeviceOrThrow(ownerId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, ownerId },
      include: { simSlots: true },
    });
    if (!device) throw new NotFoundException("Device not found.");
    return device;
  }

  async renameDevice(ownerId: string, deviceId: string, name: string) {
    await this.getDeviceOrThrow(ownerId, deviceId);
    const updated = await this.prisma.device.update({ where: { id: deviceId }, data: { name } });
    this.bus.publish(ownerId, { type: "device.updated", payload: { id: deviceId, name } });
    return this.toDeviceView({ ...updated, simSlots: [] });
  }

  async revokeDevice(ownerId: string, deviceId: string) {
    await this.getDeviceOrThrow(ownerId, deviceId);
    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: deviceId },
        data: { status: "REVOKED", revokedAt: new Date() },
      }),
      this.prisma.deviceCredential.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({ ownerId, deviceId, type: "device.revoked" });
    this.bus.publish(ownerId, { type: "device.updated", payload: { id: deviceId, status: "REVOKED" } });
  }

  async rotateCredential(ownerId: string, deviceId: string) {
    const device = await this.getDeviceOrThrow(ownerId, deviceId);
    if (device.status !== "ACTIVE") {
      throw new BadRequestException("Cannot rotate credentials for a revoked device.");
    }
    const secret = generateOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.deviceCredential.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.deviceCredential.create({
        data: { deviceId, tokenHash: sha256Hex(secret) },
      }),
    ]);
    const fresh = await this.prisma.deviceCredential.findFirst({
      where: { deviceId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await this.audit.record({ ownerId, deviceId, type: "device.credential_rotated" });
    return { deviceToken: `${fresh!.id}.${secret}` };
  }

  async upsertSimSlot(
    ownerId: string,
    deviceId: string,
    slotIndex: number,
    data: { label?: string; phoneNumber?: string },
  ) {
    await this.getDeviceOrThrow(ownerId, deviceId);
    const slot = await this.prisma.simSlot.upsert({
      where: { deviceId_slotIndex: { deviceId, slotIndex } },
      create: {
        deviceId,
        slotIndex,
        label: data.label,
        phoneNumber: data.phoneNumber,
        isManual: true,
      },
      update: { label: data.label, phoneNumber: data.phoneNumber, isManual: true },
    });
    return slot;
  }

  async reportStatus(
    deviceId: string,
    report: {
      queueSize?: number;
      permissions?: { receiveSms?: boolean; readSms?: boolean; notificationsEnabled?: boolean };
      batteryPercent?: number;
      syncPaused?: boolean;
      importInProgress?: boolean;
      importProgress?: number;
      importTotal?: number;
      model?: string;
      androidVersion?: string;
      appVersion?: string;
    },
  ) {
    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastContactAt: new Date(),
        lastQueueSize: report.queueSize,
        lastPermissionsJson: report.permissions ? JSON.stringify(report.permissions) : undefined,
        lastBatteryPercent: report.batteryPercent,
        lastSyncPaused: report.syncPaused ?? undefined,
        lastImportInProgress: report.importInProgress ?? undefined,
        lastImportProgress: report.importProgress,
        lastImportTotal: report.importTotal,
        model: report.model ?? undefined,
        androidVersion: report.androidVersion ?? undefined,
        appVersion: report.appVersion ?? undefined,
      },
    });
    this.bus.publish(updated.ownerId, {
      type: "device.updated",
      payload: this.toDeviceView({ ...updated, simSlots: [] }),
    });
    return { ok: true };
  }

  private toDeviceView(device: {
    id: string;
    name: string;
    model: string | null;
    androidVersion: string | null;
    appVersion: string | null;
    status: string;
    createdAt: Date;
    lastContactAt: Date | null;
    lastSyncAt: Date | null;
    lastQueueSize: number | null;
    lastPermissionsJson: string | null;
    lastBatteryPercent: number | null;
    lastSyncPaused: boolean;
    lastImportInProgress: boolean;
    lastImportProgress: number | null;
    lastImportTotal: number | null;
    simSlots?: Array<{
      id: string;
      slotIndex: number;
      subscriptionId: string | null;
      label: string | null;
      phoneNumber: string | null;
      isManual: boolean;
    }>;
  }) {
    return {
      id: device.id,
      name: device.name,
      model: device.model,
      androidVersion: device.androidVersion,
      appVersion: device.appVersion,
      status: device.status,
      createdAt: device.createdAt,
      lastContactAt: device.lastContactAt,
      lastSyncAt: device.lastSyncAt,
      lastQueueSize: device.lastQueueSize,
      permissions: device.lastPermissionsJson ? JSON.parse(device.lastPermissionsJson) : null,
      batteryPercent: device.lastBatteryPercent,
      syncPaused: device.lastSyncPaused,
      importInProgress: device.lastImportInProgress,
      importProgress: device.lastImportProgress,
      importTotal: device.lastImportTotal,
      simSlots: device.simSlots ?? [],
    };
  }
}
