import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ example: "Juan Carlos" })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: "Pérez" })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: "+56998765432" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "Lenguaje" })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: "Jefe de departamento" })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
