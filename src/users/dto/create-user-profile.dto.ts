import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { USER_ROLES, type UserRole } from "../user-role";

export class CreateUserProfileDto {
  @ApiProperty({ example: "supabase-user-id" })
  @IsString()
  supabaseUserId!: string;

  @ApiProperty({ example: "docente@correo.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "12.345.678-9" })
  @IsString()
  @MinLength(7)
  rut!: string;

  @ApiProperty({ example: "Juan Pérez" })
  @IsString()
  nombreCompleto!: string;

  @ApiPropertyOptional({ example: "Liceo San Martín" })
  @IsOptional()
  @IsString()
  establecimiento?: string;

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: USER_ROLES, example: "TEACHER" })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;
}
