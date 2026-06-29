import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateColegioDto {
  @ApiPropertyOptional({ example: "Colegio San Ignacio" })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: "Av. Libertador Bernardo O'Higgins 1234" })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional({ example: "+56223456789" })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: "premium" })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: "2027-06-15T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  fechaTermino?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
