import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class PaginationDto {
  @ApiPropertyOptional({ example: "1" })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ example: "20" })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ example: "activo" })
  @IsOptional()
  @IsString()
  activo?: string;

  @ApiPropertyOptional({ example: "basic" })
  @IsOptional()
  @IsString()
  plan?: string;
}
