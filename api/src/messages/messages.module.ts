import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";
import { DevicesModule } from "../devices/devices.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuditModule, EventsModule, DevicesModule, AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
