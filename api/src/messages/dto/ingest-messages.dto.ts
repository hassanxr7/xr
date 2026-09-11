import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from "class-validator";

export const SOURCE_CATEGORIES = ["LIVE", "HISTORICAL_IMPORT", "RECOVERY"] as const;

export class IngestMessageDto {
  @ApiProperty({ description: "Client-generated UUID, stable across retries." })
  @IsUUID()
  clientUuid!: string;

  @ApiProperty({ description: "Sender exactly as received (number, short code, or alphanumeric id)." })
  @IsString()
  @Length(1, 128)
  sender!: string;

  @ApiProperty()
  @IsString()
  @Length(0, 20000)
  body!: string;

  @ApiPropertyOptional({ description: "Carrier/OS-reported timestamp, if available." })
  @IsOptional()
  @IsDateString()
  senderTimestamp?: string;

  @ApiProperty({ description: "Time the phone captured the message." })
  @IsDateString()
  observedAt!: string;

  @ApiProperty({ enum: SOURCE_CATEGORIES })
  @IsIn(SOURCE_CATEGORIES)
  sourceCategory!: (typeof SOURCE_CATEGORIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  simSlotIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 64)
  simSubscriptionId?: string;

  @ApiPropertyOptional({ description: "Android Telephony provider row id, informational only." })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  sourceProviderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  partCount?: number;
}

export class IngestMessagesDto {
  @ApiProperty({ type: [IngestMessageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IngestMessageDto)
  messages!: IngestMessageDto[];
}
