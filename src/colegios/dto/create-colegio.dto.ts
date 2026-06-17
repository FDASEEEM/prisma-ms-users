import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateColegioDto {
  @ApiProperty({ example: "Colegio San Ignacio" })
  @IsString()
  @MinLength(3)
  nombre!: string;

  @ApiProperty({ example: "Av. Libertador Bernardo O'Higgins 1234" })
  @IsString()
  @MinLength(5)
  direccion!: string;

  @ApiPropertyOptional({ example: "+56223456789" })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ example: "contacto@colegiosanignacio.cl" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "76.543.210-K" })
  @IsString()
  @MinLength(7)
  rut!: string;

  @ApiPropertyOptional({ example: "premium", enum: ["basic", "standard", "premium"] })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: "2026-06-15T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({ example: "2027-06-15T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  fechaTermino?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiProperty({ example: "admin@colegiosanignacio.cl" })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ example: "Password123!" })
  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @ApiProperty({ example: "Juan Pérez Admin" })
  @IsString()
  @MinLength(3)
  adminNombre!: string;
}
