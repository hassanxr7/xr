import { Injectable } from "@nestjs/common";
import { EventEmitter } from "events";

export interface OwnerEvent {
  type:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "device.updated";
  payload: unknown;
  cursor?: string;
}

// Single-process in-memory pub/sub, scoped per owner id. This is sufficient for
// the single-VPS / single-Nest-instance deployment target described in the spec;
// it intentionally does not support horizontal scaling across multiple API
// instances (that would need a shared bus such as Postgres LISTEN/NOTIFY or Redis).
// Because the database is the authoritative source, a missed or dropped event
// never permanently hides data: clients reconcile via GET /api/messages/sync.
@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(ownerId: string, event: OwnerEvent): void {
    this.emitter.emit(ownerId, event);
  }

  subscribe(ownerId: string, listener: (event: OwnerEvent) => void): () => void {
    this.emitter.on(ownerId, listener);
    return () => this.emitter.off(ownerId, listener);
  }
}
