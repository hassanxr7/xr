import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, Max } from "class-validator";

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: ["light", "dark", "system"] })
  @IsOptional()
  @IsIn(["light", "dark", "system"])
  theme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationSound?: boolean;

  @ApiPropertyOptional({
    description: "Days to retain messages, or null to keep forever.",
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays?: number | null;
}
