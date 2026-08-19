import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class GoogleUrlDto {
  @ApiProperty({
    example: "http://localhost:3010/api/auth/google/callback",
    description:
      "URL del callback del BFF a la que Supabase redirige con el code de Google.",
  })
  @IsString()
  @MinLength(1)
  redirectTo!: string;
}