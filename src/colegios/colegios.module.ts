import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ColegiosController } from "./colegios.controller";
import { ColegiosService } from "./colegios.service";
import { SuperAdminRoleGuard } from "./guards/superadmin-role.guard";

@Module({
  imports: [UsersModule],
  controllers: [ColegiosController],
  providers: [ColegiosService, SuperAdminRoleGuard],
  exports: [ColegiosService],
})
export class ColegiosModule {}
