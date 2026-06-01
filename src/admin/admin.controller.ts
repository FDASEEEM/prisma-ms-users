import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { AdminRoleGuard } from "./guards/admin-role.guard";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(AdminRoleGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get("users/stats")
  @ApiOperation({ summary: "Estadísticas de usuarios para el panel admin" })
  async usersStats() {
    const [totalUsers, activeUsers, admins, teachers] = await Promise.all([
      this.prismaService.user.count(),
      this.prismaService.user.count({ where: { active: true } }),
      this.prismaService.user.count({ where: { role: "ADMIN" } }),
      this.prismaService.user.count({ where: { role: "TEACHER" } }),
    ]);

    return { totalUsers, activeUsers, admins, teachers };
  }

  @Get("users")
  @ApiOperation({ summary: "Listar todos los usuarios" })
  async listUsers() {
    return this.prismaService.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        active: true,
        createdAt: true,
      },
    });
  }

  @Post("users")
  @ApiOperation({ summary: "Crear usuario para profesor" })
  async createUser(@Body() body: { email: string; nombreCompleto: string; role?: "ADMIN" | "TEACHER" }) {
    const existing = await this.prismaService.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return { ok: true, user: existing, message: "User already exists" };
    }

    const user = await this.prismaService.user.create({
      data: {
        email: body.email,
        supabaseUserId: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        rut: `${Date.now().toString().slice(-8).replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3")}-0`,
        nombreCompleto: body.nombreCompleto,
        role: body.role ?? "TEACHER",
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
      },
    });

    return { ok: true, user };
  }

  @Patch("users/:id/role")
  @ApiOperation({ summary: "Cambiar rol de un usuario" })
  async updateUserRole(@Param("id") id: string, @Body() body: { role: "ADMIN" | "TEACHER" }) {
    const user = await this.prismaService.user.update({
      where: { id },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
      },
    });
    return { ok: true, user };
  }
}