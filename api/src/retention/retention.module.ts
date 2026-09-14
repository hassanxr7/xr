import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RetentionService } from "./retention.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [ScheduleModule.forRoot(), AuditModule],
  providers: [RetentionService],
})
export class RetentionModule {}
