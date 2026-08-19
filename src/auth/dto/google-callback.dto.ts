import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class GoogleCallbackDto {
  @ApiProperty({ example: "authorization-code-from-supabase" })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: "pkce-state-value" })
  @IsString()
  @MinLength(1)
  state!: string;
}