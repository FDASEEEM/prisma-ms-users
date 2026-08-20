import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { AdminModule } from "./admin/admin.module";
import { ColegiosModule } from "./colegios/colegios.module";
import { AuditModule } from "./infrastructure/audit/audit.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { CognitoModule } from "./infrastructure/cognito/cognito.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    CognitoModule,
    UsersModule,
    AuthModule,
    AdminModule,
    ColegiosModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
