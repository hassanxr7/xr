import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentOwner } from "../auth/current-owner.decorator";
import type { AuthenticatedOwner } from "../auth/session-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const STALE_CONTACT_MS = 20 * 60 * 1000; // no contact in 20 min -> flag as a sync warning

@ApiTags("overview")
@Controller("overview")
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async overview(@CurrentOwner() owner: AuthenticatedOwner) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalMessages, todayMessages, unreadMessages, devices, recent] = await Promise.all([
      this.prisma.message.count({ where: { ownerId: owner.id, deletedAt: null } }),
      this.prisma.message.count({
        where: { ownerId: owner.id, deletedAt: null, receivedAt: { gte: startOfToday } },
      }),
      this.prisma.message.count({
        where: { ownerId: owner.id, deletedAt: null, isRead: false },
      }),
      this.prisma.device.findMany({ where: { ownerId: owner.id } }),
      this.prisma.message.findMany({
        where: { ownerId: owner.id, deletedAt: null },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 10,
        include: { device: { select: { name: true } } },
      }),
    ]);

    const now = Date.now();
    const activeDevices = devices.filter((d) => d.status === "ACTIVE");
    const syncWarnings = activeDevices
      .filter((d) => {
        const paused = d.lastSyncPaused;
        const stale = !d.lastContactAt || now - d.lastContactAt.getTime() > STALE_CONTACT_MS;
        return paused || stale;
      })
      .map((d) => ({
        deviceId: d.id,
        name: d.name,
        reason: d.lastSyncPaused ? "paused" : "no_recent_contact",
        lastContactAt: d.lastContactAt,
      }));

    return {
      totalMessages,
      todayMessages,
      unreadMessages,
      pairedDeviceCount: activeDevices.length,
      recentMessages: recent.map((m) => ({
        id: m.id,
        deviceName: m.device.name,
        sender: m.sender,
        preview: m.body.slice(0, 140),
        receivedAt: m.receivedAt,
        isRead: m.isRead,
      })),
      syncWarnings,
    };
  }
}
