import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class DevicePermissionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  receiveSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class DeviceStatusReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  queueSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DevicePermissionsDto)
  permissions?: DevicePermissionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  syncPaused?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  importInProgress?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  importProgress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  importTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  androidVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;
}
