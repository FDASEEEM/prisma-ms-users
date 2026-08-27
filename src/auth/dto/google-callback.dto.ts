import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class GoogleCallbackDto {
  @ApiProperty({ example: "authorization-code-from-google" })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: "pkce-state-value" })
  @IsString()
  @MinLength(1)
  state!: string;

  @ApiPropertyOptional({
    example: "pkce-state-value",
    description:
      "El state que el stack emitió y guardó (cookie/sesión). Si se provee, se compara en tiempo constante contra `state` para impedir login CSRF.",
  })
  @IsOptional()
  @IsString()
  expectedState?: string;
}