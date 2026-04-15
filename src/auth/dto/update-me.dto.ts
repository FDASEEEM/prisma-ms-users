import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateMeDto {
  @ApiPropertyOptional({ example: "Juan Carlos Pérez" })
  @IsOptional()
  @IsString()
  nombreCompleto?: string;

  @ApiPropertyOptional({ example: "Liceo San Martín" })
  @IsOptional()
  @IsString()
  establecimiento?: string;

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
