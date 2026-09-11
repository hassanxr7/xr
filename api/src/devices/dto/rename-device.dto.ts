import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class RenameDeviceDto {
  @ApiProperty({ example: "Office SIM" })
  @IsString()
  @Length(1, 60)
  name!: string;
}
