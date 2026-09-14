import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { generateOpaqueToken, sha256Hex } from "../common/crypto.util";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const owner = await this.prisma.owner.findUnique({ where: { email } });
    // Constant-shape failure: hash a dummy value when the account doesn't
    // exist, so login timing doesn't reveal whether the email is registered.
    const hash = owner?.passwordHash ?? (await argon2.hash("invalid-placeholder"));
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!owner || !valid) {
      await this.audit.record({
        type: "auth.login_failed",
        metadata: { email },
        ipAddress: context.ipAddress,
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    const rawToken = generateOpaqueToken();
    const session = await this.prisma.session.create({
      data: {
        ownerId: owner.id,
        tokenHash: sha256Hex(rawToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
    });

    await this.audit.record({
      ownerId: owner.id,
      type: "auth.login_succeeded",
      ipAddress: context.ipAddress,
    });

    return {
      rawToken,
      expiresAt: session.expiresAt,
      owner: {
        id: owner.id,
        email: owner.email,
        timezone: owner.timezone,
        theme: owner.theme,
        notificationSound: owner.notificationSound,
        retentionDays: owner.retentionDays,
      },
    };
  }

  async logout(sessionId: string, ownerId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({ ownerId, type: "auth.logout" });
  }

  async changePassword(
    ownerId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const owner = await this.prisma.owner.findUniqueOrThrow({ where: { id: ownerId } });
    const valid = await argon2.verify(owner.passwordHash, currentPassword).catch(() => false);
    if (!valid) throw new UnauthorizedException("Current password is incorrect.");

    const newHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.owner.update({
        where: { id: ownerId },
        data: { passwordHash: newHash, passwordChangedAt: new Date() },
      }),
      // Revoke every other session; only the session making this change stays valid.
      this.prisma.session.updateMany({
        where: { ownerId, revokedAt: null, id: { not: currentSessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({ ownerId, type: "auth.password_changed" });
  }

  async updateSettings(
    ownerId: string,
    data: {
      timezone?: string;
      theme?: string;
      notificationSound?: boolean;
      retentionDays?: number | null;
    },
  ) {
    return this.prisma.owner.update({ where: { id: ownerId }, data });
  }
}
