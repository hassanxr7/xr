import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { sha256Hex } from "../common/crypto.util";

export interface AuthenticatedOwner {
  id: string;
  email: string;
  timezone: string;
  theme: string;
}

declare module "express" {
  interface Request {
    owner?: AuthenticatedOwner;
    sessionId?: string;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.cookies?.sid;
    if (!raw) throw new UnauthorizedException("Not signed in.");

    const tokenHash = sha256Hex(raw);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { owner: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired or revoked.");
    }

    // Fire-and-forget heartbeat; never blocks the request on this write.
    this.prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    req.owner = {
      id: session.owner.id,
      email: session.owner.email,
      timezone: session.owner.timezone,
      theme: session.owner.theme,
    };
    req.sessionId = session.id;
    return true;
  }
}
