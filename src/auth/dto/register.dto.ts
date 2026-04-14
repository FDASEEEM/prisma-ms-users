import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "docente@correo.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Password123!" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "12.345.678-9" })
  @IsString()
  rut!: string;

  @ApiProperty({ example: "Juan" })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: "Pérez" })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: "+56912345678" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "Matemáticas" })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: "Titular" })
  @IsOptional()
  @IsString()
  position?: string;
}
