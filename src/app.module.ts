import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { SupabaseModule } from "./infrastructure/supabase/supabase.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SupabaseModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
