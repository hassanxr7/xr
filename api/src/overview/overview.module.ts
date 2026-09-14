import { Module } from "@nestjs/common";
import { OverviewController } from "./overview.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [OverviewController],
})
export class OverviewModule {}
