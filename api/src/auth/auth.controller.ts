import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { SessionAuthGuard } from "./session-auth.guard";
import { CurrentOwner } from "./current-owner.decorator";
import type { AuthenticatedOwner } from "./session-auth.guard";
import { loginRateLimit } from "../common/rate-limit.util";

const SESSION_COOKIE = "sid";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Throttle({ default: { limit: loginRateLimit(), ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, {
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
    });

    res.cookie(SESSION_COOKIE, result.rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });

    return { owner: result.owner };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.sessionId!, req.owner!.id);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async me(@CurrentOwner() owner: AuthenticatedOwner) {
    return { owner };
  }

  @Patch("me")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async updateSettings(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() dto: UpdateSettingsDto,
  ) {
    const updated = await this.auth.updateSettings(owner.id, dto);
    return {
      owner: {
        id: updated.id,
        email: updated.email,
        timezone: updated.timezone,
        theme: updated.theme,
        notificationSound: updated.notificationSound,
        retentionDays: updated.retentionDays,
      },
    };
  }

  @Post("change-password")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(
      req.owner!.id,
      req.sessionId!,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
