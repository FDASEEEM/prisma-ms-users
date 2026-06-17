import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { SupabaseService } from "../infrastructure/supabase/supabase.service";
import { AdminRoleGuard } from "./guards/admin-role.guard";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(AdminRoleGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get("users/stats")
  @ApiOperation({ summary: "Estadísticas de usuarios para el panel admin" })
  async usersStats() {
    const [totalUsers, activeUsers, superadmins, admins, teachers] = await Promise.all([
      this.prismaService.user.count(),
      this.prismaService.user.count({ where: { active: true } }),
      this.prismaService.user.count({ where: { role: "SUPERADMIN" } }),
      this.prismaService.user.count({ where: { role: "ADMIN" } }),
      this.prismaService.user.count({ where: { role: "TEACHER" } }),
    ]);

    return { totalUsers, activeUsers, superadmins, admins, teachers };
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
        colegioId: true,
        createdAt: true,
      },
    });
  }

  @Post("users")
  @ApiOperation({ summary: "Crear usuario completo (profesor/admin)" })
  async createUser(@Body() body: { email: string; nombreCompleto: string; password: string; role?: "SUPERADMIN" | "ADMIN" | "TEACHER"; rut?: string; colegioId?: string }, @Req() request: Request & { adminUser?: any }) {
    const existing = await this.prismaService.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return { ok: false, message: "El email ya está registrado" };
    }

    const colegioId = body.colegioId || request.adminUser?.colegioId;

    if (colegioId) {
      const colegio = await this.prismaService.colegio.findUnique({ where: { id: colegioId } });
      if (!colegio) {
        return { ok: false, message: "El colegio especificado no existe" };
      }
    }

    const supabaseResult = await this.supabaseService.createUserWithPasswordAndMetadata(
      body.email,
      body.password,
      { role: body.role ?? "TEACHER", nombreCompleto: body.nombreCompleto },
    );
    if (!supabaseResult?.id) {
      return { ok: false, message: "Error creando usuario en Supabase" };
    }

    const user = await this.prismaService.user.create({
      data: {
        email: body.email,
        supabaseUserId: supabaseResult.id,
        rut: body.rut || `${Date.now().toString().slice(-8).replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3")}-0`,
        nombreCompleto: body.nombreCompleto,
        role: body.role ?? "TEACHER",
        colegioId: colegioId,
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        colegioId: true,
      },
    });

    return { ok: true, user };
  }

  @Patch("users/:id/role")
  @ApiOperation({ summary: "Cambiar rol de un usuario" })
  async updateUserRole(@Param("id") id: string, @Body() body: { role: "SUPERADMIN" | "ADMIN" | "TEACHER"; colegioId?: string }) {
    const user = await this.prismaService.user.update({
      where: { id },
      data: {
        role: body.role,
        ...(body.colegioId !== undefined ? { colegioId: body.colegioId } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        nombreCompleto: true,
        colegioId: true,
      },
    });
    return { ok: true, user };
  }
}