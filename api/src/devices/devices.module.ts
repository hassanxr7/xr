import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { DeviceAuthGuard } from "./device-auth.guard";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceAuthGuard],
  exports: [DeviceAuthGuard, DevicesService],
})
export class DevicesModule {}
