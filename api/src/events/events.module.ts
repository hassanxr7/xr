import { Module } from "@nestjs/common";
import { EventBusService } from "./event-bus.service";
import { EventsController } from "./events.controller";

@Module({
  providers: [EventBusService],
  controllers: [EventsController],
  exports: [EventBusService],
})
export class EventsModule {}
