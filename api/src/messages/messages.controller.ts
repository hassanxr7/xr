import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { MessagesService } from "./messages.service";
import { IngestMessagesDto } from "./dto/ingest-messages.dto";
import { QueryMessagesDto, SyncMessagesDto, UpdateMessageDto } from "./dto/query-messages.dto";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentOwner } from "../auth/current-owner.decorator";
import type { AuthenticatedOwner } from "../auth/session-auth.guard";
import { DeviceAuthGuard } from "../devices/device-auth.guard";
import { CurrentDevice } from "../devices/current-device.decorator";
import type { AuthenticatedDevice } from "../devices/device-auth.guard";

@ApiTags("messages")
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // Batch ingestion from a paired Android device. Idempotent: retrying the
  // same clientUuid after a lost response returns "duplicate" with the
  // original serverId instead of creating a second row.
  @Post("devices/me/messages")
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth("device-token")
  async ingest(@CurrentDevice() device: AuthenticatedDevice, @Body() dto: IngestMessagesDto) {
    return this.messages.ingest({ deviceId: device.id, ownerId: device.ownerId }, dto.messages);
  }

  @Get("messages")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async list(@CurrentOwner() owner: AuthenticatedOwner, @Query() query: QueryMessagesDto) {
    return this.messages.list(owner.id, query);
  }

  @Get("messages/sync")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async sync(@CurrentOwner() owner: AuthenticatedOwner, @Query() query: SyncMessagesDto) {
    return this.messages.sync(owner.id, query);
  }

  @Get("messages/export")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async export(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Query() query: QueryMessagesDto,
    @Res() res: Response,
  ) {
    await this.messages.exportCsv(owner.id, query, res);
  }

  @Get("messages/:id")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async getById(@CurrentOwner() owner: AuthenticatedOwner, @Param("id") id: string) {
    return this.messages.getById(owner.id, id);
  }

  @Patch("messages/:id")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async update(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Param("id") id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.update(owner.id, id, dto);
  }

  @Delete("messages/:id")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async delete(@CurrentOwner() owner: AuthenticatedOwner, @Param("id") id: string) {
    await this.messages.delete(owner.id, id);
  }
}
