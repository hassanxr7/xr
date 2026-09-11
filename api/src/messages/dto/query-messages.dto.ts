import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsBooleanString,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

export class QueryMessagesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  simSlotId?: string;

  @ApiPropertyOptional({ description: "Search sender or message body." })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  isRead?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  isArchived?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: "Opaque keyset cursor from the previous page." })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: ["receivedAt", "sender"] })
  @IsOptional()
  @IsIn(["receivedAt", "sender"])
  sort?: "receivedAt" | "sender";
}

export class SyncMessagesDto {
  @ApiPropertyOptional({ description: "Opaque cursor; omit to fetch the most recent page." })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class UpdateMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
