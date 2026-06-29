import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class ProfessorsPaginationDto {
  @ApiPropertyOptional({ example: "1" })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ example: "20" })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ example: "true" })
  @IsOptional()
  @IsString()
  active?: string;

  @ApiPropertyOptional({ example: "Matemáticas" })
  @IsOptional()
  @IsString()
  specialty?: string;
}
