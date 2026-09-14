import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Audit metadata must never contain SMS bodies, passwords, pairing secrets, or tokens.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    ownerId?: string;
    deviceId?: string;
    type: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        ownerId: entry.ownerId,
        deviceId: entry.deviceId,
        type: entry.type,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
