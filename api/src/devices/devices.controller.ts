import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { DevicesService } from "./devices.service";
import { CreatePairingCodeDto } from "./dto/create-pairing-code.dto";
import { RedeemPairingCodeDto } from "./dto/redeem-pairing-code.dto";
import { RenameDeviceDto } from "./dto/rename-device.dto";
import { UpdateSimSlotDto } from "./dto/update-sim-slot.dto";
import { DeviceStatusReportDto } from "./dto/device-status-report.dto";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentOwner } from "../auth/current-owner.decorator";
import type { AuthenticatedOwner } from "../auth/session-auth.guard";
import { DeviceAuthGuard } from "./device-auth.guard";
import { CurrentDevice } from "./current-device.decorator";
import type { AuthenticatedDevice } from "./device-auth.guard";
import { pairRateLimit } from "../common/rate-limit.util";

@ApiTags("devices")
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post("pairing-codes")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async createPairingCode(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() dto: CreatePairingCodeDto,
    @Req() req: Request,
  ) {
    const serverUrl = `${req.protocol}://${req.get("host") ?? ""}`;
    return this.devices.createPairingCode(owner.id, dto.deviceName, serverUrl);
  }

  // Unauthenticated: the pairing code itself is the credential at this step.
  // Rate-limited to resist brute-force guessing of the short code.
  @Post("pair")
  @Throttle({ default: { limit: pairRateLimit(), ttl: 60_000 } })
  async pair(@Body() dto: RedeemPairingCodeDto) {
    return this.devices.redeemPairingCode(dto.code, {
      model: dto.model,
      androidVersion: dto.androidVersion,
      appVersion: dto.appVersion,
    });
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async list(@CurrentOwner() owner: AuthenticatedOwner) {
    return { devices: await this.devices.listDevices(owner.id) };
  }

  @Get("me")
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth("device-token")
  async me(@CurrentDevice() device: AuthenticatedDevice) {
    return { id: device.id, name: device.name };
  }

  @Patch(":id")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async rename(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param("id") id: string,
    @Body() dto: RenameDeviceDto,
  ) {
    return this.devices.renameDevice(owner.id, id, dto.name);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async revoke(@CurrentOwner() owner: AuthenticatedOwner, @Param("id") id: string) {
    await this.devices.revokeDevice(owner.id, id);
  }

  @Post(":id/rotate-credential")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async rotate(@CurrentOwner() owner: AuthenticatedOwner, @Param("id") id: string) {
    return this.devices.rotateCredential(owner.id, id);
  }

  @Put(":id/sim-slots/:slotIndex")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async upsertSimSlot(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param("id") id: string,
    @Param("slotIndex") slotIndex: string,
    @Body() dto: UpdateSimSlotDto,
  ) {
    return this.devices.upsertSimSlot(owner.id, id, Number(slotIndex), dto);
  }

  @Post("me/status")
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth("device-token")
  async reportStatus(
    @CurrentDevice() device: AuthenticatedDevice,
    @Body() dto: DeviceStatusReportDto,
  ) {
    return this.devices.reportStatus(device.id, dto);
  }
}
