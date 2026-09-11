import { Controller, MessageEvent, Sse, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentOwner } from "../auth/current-owner.decorator";
import type { AuthenticatedOwner } from "../auth/session-auth.guard";
import { EventBusService } from "./event-bus.service";

const HEARTBEAT_MS = 20_000;

@ApiTags("events")
@Controller("events")
export class EventsController {
  constructor(private readonly bus: EventBusService) {}

  // Authenticated live feed for the dashboard. This is a convenience push
  // channel only: the database is authoritative and GET /messages/sync is the
  // source of truth clients must reconcile against on connect/reconnect.
  @Sse()
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  stream(@CurrentOwner() owner: AuthenticatedOwner): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ type: "connected", data: { ok: true } });

      const unsubscribe = this.bus.subscribe(owner.id, (event) => {
        subscriber.next({ type: event.type, data: event.payload as object });
      });

      const heartbeat = setInterval(() => {
        subscriber.next({ type: "heartbeat", data: { at: new Date().toISOString() } });
      }, HEARTBEAT_MS);

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    });
  }
}
