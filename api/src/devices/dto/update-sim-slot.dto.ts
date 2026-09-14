import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class UpdateSimSlotDto {
  @ApiPropertyOptional({ example: "Office SIM" })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  label?: string;

  @ApiPropertyOptional({ example: "+252611234567" })
  @IsOptional()
  @IsString()
  @Length(0, 32)
  phoneNumber?: string;
}
