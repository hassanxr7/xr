import { Injectable, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventBusService } from "../events/event-bus.service";
import { decodeCursor, encodeCursor } from "./cursor.util";
import { csvRow } from "./csv.util";
import type { IngestMessageDto } from "./dto/ingest-messages.dto";
import type { QueryMessagesDto, SyncMessagesDto, UpdateMessageDto } from "./dto/query-messages.dto";

interface IngestContext {
  deviceId: string;
  ownerId: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bus: EventBusService,
  ) {}

  async ingest(ctx: IngestContext, messages: IngestMessageDto[]) {
    const results: Array<{ clientUuid: string; status: "created" | "duplicate" | "error"; serverId?: string; error?: string }> = [];
    let createdAny = false;

    for (const msg of messages) {
      try {
        const result = await this.ingestOne(ctx, msg);
        results.push(result);
        if (result.status === "created") createdAny = true;
      } catch (err) {
        results.push({
          clientUuid: msg.clientUuid,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    await this.prisma.device.update({
      where: { id: ctx.deviceId },
      data: { lastContactAt: new Date(), ...(createdAny ? { lastSyncAt: new Date() } : {}) },
    });

    return { results };
  }

  private async ingestOne(ctx: IngestContext, msg: IngestMessageDto) {
    let simSlotId: string | null = null;
    let simLabelSnapshot: string | null = null;

    if (msg.simSlotIndex !== undefined) {
      const slot = await this.prisma.simSlot.findUnique({
        where: { deviceId_slotIndex: { deviceId: ctx.deviceId, slotIndex: msg.simSlotIndex } },
      });
      simSlotId = slot?.id ?? null;
      simLabelSnapshot = slot?.label ?? "Unknown";
    }

    try {
      const created = await this.prisma.message.create({
        data: {
          ownerId: ctx.ownerId,
          deviceId: ctx.deviceId,
          clientUuid: msg.clientUuid,
          simSlotId,
          simSlotIndexRaw: msg.simSlotIndex ?? null,
          simLabelSnapshot,
          sender: msg.sender,
          body: msg.body,
          senderTimestamp: msg.senderTimestamp ? new Date(msg.senderTimestamp) : null,
          observedAt: new Date(msg.observedAt),
          sourceCategory: msg.sourceCategory,
          sourceProviderId: msg.sourceProviderId ?? null,
          partCount: msg.partCount ?? 1,
        },
      });

      this.bus.publish(ctx.ownerId, {
        type: "message.created",
        payload: this.toMessageView(created),
        cursor: encodeCursor(created.receivedAt, created.id),
      });

      return { clientUuid: msg.clientUuid, status: "created" as const, serverId: created.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.prisma.message.findUnique({
          where: { device_client_uuid: { deviceId: ctx.deviceId, clientUuid: msg.clientUuid } },
        });
        return { clientUuid: msg.clientUuid, status: "duplicate" as const, serverId: existing?.id };
      }
      throw err;
    }
  }

  async list(ownerId: string, query: QueryMessagesDto) {
    const limit = query.limit ?? 50;
    const where = this.buildWhere(ownerId, query);

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = new Date(cursor.receivedAt);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { receivedAt: { lt: cursorDate } },
            { receivedAt: cursorDate, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { simSlot: true },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].receivedAt, page[page.length - 1].id)
        : null;

    return {
      messages: page.map((m) => this.toMessageView(m)),
      nextCursor,
    };
  }

  // Ascending reconciliation feed used after an SSE reconnect: "give me
  // everything that changed since cursor X", independent of the inbox's
  // descending browse pagination.
  async sync(ownerId: string, query: SyncMessagesDto) {
    const limit = query.limit ?? 100;
    const where: Prisma.MessageWhereInput = { ownerId, deletedAt: null };

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = new Date(cursor.receivedAt);
      where.OR = [
        { receivedAt: { gt: cursorDate } },
        { receivedAt: cursorDate, id: { gt: cursor.id } },
      ];
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: limit,
      include: { simSlot: true },
    });

    const nextCursor =
      rows.length > 0
        ? encodeCursor(rows[rows.length - 1].receivedAt, rows[rows.length - 1].id)
        : query.cursor ?? null;

    return { messages: rows.map((m) => this.toMessageView(m)), nextCursor };
  }

  async getById(ownerId: string, id: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: { simSlot: true, device: { select: { name: true } } },
    });
    if (!message) throw new NotFoundException("Message not found.");
    return { ...this.toMessageView(message), deviceName: message.device.name };
  }

  async update(ownerId: string, id: string, dto: UpdateMessageDto) {
    const existing = await this.prisma.message.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (!existing) throw new NotFoundException("Message not found.");

    const updated = await this.prisma.message.update({
      where: { id },
      data: {
        isRead: dto.isRead ?? undefined,
        isArchived: dto.isArchived ?? undefined,
      },
      include: { simSlot: true },
    });

    this.bus.publish(ownerId, {
      type: "message.updated",
      payload: this.toMessageView(updated),
      cursor: encodeCursor(updated.receivedAt, updated.id),
    });

    return this.toMessageView(updated);
  }

  // Soft delete: removes the message from every dashboard view and export
  // immediately. It does not touch the phone's own SMS app or its local
  // upload queue. If the owner later re-runs a historical import over the
  // same date range on the same device, that specific SMS can be recreated
  // (deliberately: deletion removes the server copy, not the source text
  // message on the phone) -- ordinary retry/resume of already-acknowledged
  // uploads never resurrects it, because the device only retries messages it
  // has not yet received a "created" or "duplicate" acknowledgement for.
  async delete(ownerId: string, id: string) {
    const existing = await this.prisma.message.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (!existing) throw new NotFoundException("Message not found.");

    await this.prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ownerId, type: "message.deleted", metadata: { messageId: id } });
    this.bus.publish(ownerId, { type: "message.deleted", payload: { id } });
  }

  async exportCsv(ownerId: string, query: QueryMessagesDto, res: Response) {
    await this.audit.record({ ownerId, type: "message.exported", metadata: { filters: query } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="smsbridge-export-${Date.now()}.csv"`);
    res.write(
      csvRow([
        "id",
        "device",
        "sim_label",
        "sender",
        "body",
        "sender_timestamp",
        "observed_at",
        "received_at",
        "source_category",
        "is_read",
        "is_archived",
      ]),
    );

    const where = this.buildWhere(ownerId, query);
    const PAGE_SIZE = 1000;
    const HARD_CAP = 200_000;
    let cursor: { receivedAt: Date; id: string } | null = null;
    let exported = 0;

    for (;;) {
      const pageWhere: Prisma.MessageWhereInput = cursor
        ? {
            ...where,
            AND: [
              ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
              {
                OR: [
                  { receivedAt: { lt: cursor.receivedAt } },
                  { receivedAt: cursor.receivedAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : where;

      const rows = await this.prisma.message.findMany({
        where: pageWhere,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE,
        include: { device: { select: { name: true } } },
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        res.write(
          csvRow([
            row.id,
            row.device.name,
            row.simLabelSnapshot ?? "",
            row.sender,
            row.body,
            row.senderTimestamp?.toISOString() ?? "",
            row.observedAt.toISOString(),
            row.receivedAt.toISOString(),
            row.sourceCategory,
            String(row.isRead),
            String(row.isArchived),
          ]),
        );
      }

      exported += rows.length;
      cursor = { receivedAt: rows[rows.length - 1].receivedAt, id: rows[rows.length - 1].id };
      if (rows.length < PAGE_SIZE || exported >= HARD_CAP) break;
    }

    res.end();
  }

  private buildWhere(ownerId: string, query: QueryMessagesDto): Prisma.MessageWhereInput {
    const where: Prisma.MessageWhereInput = { ownerId, deletedAt: null };
    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.simSlotId) where.simSlotId = query.simSlotId;
    if (query.isRead !== undefined) where.isRead = query.isRead === "true";
    if (query.isArchived !== undefined) where.isArchived = query.isArchived === "true";
    if (query.dateFrom || query.dateTo) {
      where.receivedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { sender: { contains: query.q, mode: "insensitive" } },
        { body: { contains: query.q, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private toMessageView(m: {
    id: string;
    deviceId: string;
    clientUuid: string;
    simSlotId: string | null;
    simSlotIndexRaw: number | null;
    simLabelSnapshot: string | null;
    sender: string;
    body: string;
    senderTimestamp: Date | null;
    observedAt: Date;
    receivedAt: Date;
    sourceCategory: string;
    partCount: number;
    isRead: boolean;
    isArchived: boolean;
  }) {
    return {
      id: m.id,
      deviceId: m.deviceId,
      clientUuid: m.clientUuid,
      simSlotId: m.simSlotId,
      simSlotIndex: m.simSlotIndexRaw,
      simLabel: m.simLabelSnapshot,
      sender: m.sender,
      body: m.body,
      senderTimestamp: m.senderTimestamp,
      observedAt: m.observedAt,
      receivedAt: m.receivedAt,
      sourceCategory: m.sourceCategory,
      partCount: m.partCount,
      isRead: m.isRead,
      isArchived: m.isArchived,
    };
  }
}
