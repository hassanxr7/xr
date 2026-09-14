import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class CreatePairingCodeDto {
  @ApiProperty({ example: "Home Phone" })
  @IsString()
  @Length(1, 60)
  deviceName!: string;
}
