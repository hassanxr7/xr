import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// No automatic deletion happens unless the owner explicitly sets a
// retentionDays value (default is null = keep forever). When set, messages
// older than that window are soft-deleted the same way a manual delete
// works: removed from every dashboard view/export, but the phone's own SMS
// app and local upload queue are untouched, and the row can still be
// recreated by a later historical import over the same range (see
// MessagesService.delete for the full explanation of that tradeoff).
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async enforceRetention(): Promise<void> {
    const owners = await this.prisma.owner.findMany({
      where: { retentionDays: { not: null } },
      select: { id: true, retentionDays: true },
    });

    for (const owner of owners) {
      const cutoff = new Date(Date.now() - owner.retentionDays! * 24 * 60 * 60 * 1000);
      const result = await this.prisma.message.updateMany({
        where: { ownerId: owner.id, deletedAt: null, receivedAt: { lt: cutoff } },
        data: { deletedAt: new Date() },
      });
      if (result.count > 0) {
        this.logger.log(`Retention: soft-deleted ${result.count} message(s) for owner ${owner.id}`);
        await this.audit.record({
          ownerId: owner.id,
          type: "message.retention_purged",
          metadata: { count: result.count, retentionDays: owner.retentionDays, cutoff: cutoff.toISOString() },
        });
      }
    }
  }
}
