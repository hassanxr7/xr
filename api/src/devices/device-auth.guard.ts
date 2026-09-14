import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { sha256Hex } from "../common/crypto.util";

export interface AuthenticatedDevice {
  id: string;
  ownerId: string;
  name: string;
}

declare module "express" {
  interface Request {
    device?: AuthenticatedDevice;
  }
}

// Device identity comes ONLY from the bearer token. A device can never assert
// which owner or device it is via a request body/path parameter.
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing device credentials.");
    }
    const token = header.slice("Bearer ".length).trim();
    const [credentialId, secret] = token.split(".", 2);
    if (!credentialId || !secret) {
      throw new UnauthorizedException("Malformed device token.");
    }

    const credential = await this.prisma.deviceCredential.findUnique({
      where: { id: credentialId },
      include: { device: true },
    });

    if (!credential || credential.revokedAt) {
      throw new UnauthorizedException({
        code: "credential_revoked",
        message: "Device credential is invalid or revoked.",
      });
    }
    if (credential.tokenHash !== sha256Hex(secret)) {
      throw new UnauthorizedException("Invalid device token.");
    }
    if (credential.device.status !== "ACTIVE") {
      throw new UnauthorizedException({
        code: "device_revoked",
        message: "This device has been revoked by the owner.",
      });
    }

    req.device = {
      id: credential.device.id,
      ownerId: credential.device.ownerId,
      name: credential.device.name,
    };
    return true;
  }
}
