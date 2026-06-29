import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { SupabaseService } from "../infrastructure/supabase/supabase.service";
import { AuditService } from "../infrastructure/audit/audit.service";
import { CreateColegioDto } from "./dto/create-colegio.dto";
import { UpdateColegioDto } from "./dto/update-colegio.dto";

@Injectable()
export class ColegiosService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateColegioDto, superAdminUserId?: string, ipOrigen?: string) {
    const existingEmail = await this.prismaService.colegio.findUnique({ where: { email: dto.email } });
    if (existingEmail) {
      throw new ConflictException("Ya existe un colegio con ese email.");
    }

    const existingRut = await this.prismaService.colegio.findUnique({ where: { rut: dto.rut } });
    if (existingRut) {
      throw new ConflictException("Ya existe un colegio con ese RUT.");
    }

    const existingAdminEmail = await this.prismaService.user.findUnique({ where: { email: dto.adminEmail } });
    if (existingAdminEmail) {
      throw new ConflictException("Ya existe un usuario con ese email de admin.");
    }

    let supabaseUserId: string | null = null;
    try {
      const supabaseResult = await this.supabaseService.createUserWithPasswordAndMetadata(
        dto.adminEmail,
        dto.adminPassword,
        { role: "ADMIN", nombreCompleto: dto.adminNombre },
      );
      if (!supabaseResult?.id) {
        throw new Error("Error creando usuario admin en Supabase");
      }
      supabaseUserId = supabaseResult.id;
    } catch (error) {
      await this.auditService.registrarEvento({
        tipoEvento: "colegio_create",
        userId: superAdminUserId ?? null,
        ipOrigen,
        resultado: "failure",
        mensaje: `Error creando colegio '${dto.nombre}': ${error instanceof Error ? error.message : "Error desconocido"}`,
      });
      throw new ConflictException(
        `Error creando el usuario admin: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }

    try {
      const colegio = await this.prismaService.colegio.create({
        data: {
          nombre: dto.nombre,
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
          rut: dto.rut,
          plan: dto.plan ?? "basic",
          fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : new Date(),
          fechaTermino: dto.fechaTermino ? new Date(dto.fechaTermino) : null,
          activo: dto.activo ?? true,
        },
      });

      const adminUser = await this.prismaService.user.create({
        data: {
          supabaseUserId,
          email: dto.adminEmail,
          rut: `${Date.now().toString().slice(-8).replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3")}-0`,
          nombreCompleto: dto.adminNombre,
          role: "ADMIN",
          colegioId: colegio.id,
          active: true,
        },
      });

      // El usuario admin se creo en Supabase antes de existir el colegio;
      // ahora propagamos el tenant a app_metadata (lo leen perfil-alumno/docs).
      await this.supabaseService.updateUserAppMetadata(supabaseUserId, {
        role: "ADMIN",
        colegioId: colegio.id,
      });

      await this.auditService.registrarEvento({
        tipoEvento: "colegio_create",
        userId: superAdminUserId ?? null,
        ipOrigen,
        resultado: "success",
        mensaje: `Colegio '${colegio.nombre}' (RUT: ${colegio.rut}) creado con admin '${dto.adminNombre}' (${dto.adminEmail}). Plan: ${colegio.plan}.`,
      });

      return {
        colegio,
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          nombreCompleto: adminUser.nombreCompleto,
          role: adminUser.role,
        },
      };
    } catch (error) {
      if (supabaseUserId) {
        await this.supabaseService.deleteUser(supabaseUserId);
      }
      await this.auditService.registrarEvento({
        tipoEvento: "colegio_create",
        userId: superAdminUserId ?? null,
        ipOrigen,
        resultado: "failure",
        mensaje: `Error creando colegio '${dto.nombre}': ${error instanceof Error ? error.message : "Error desconocido"}`,
      });
      throw error;
    }
  }

  async findAll(query?: { page?: string; limit?: string; activo?: string; plan?: string }) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ColegioWhereInput = {};
    if (query?.activo !== undefined) {
      where.activo = query.activo === "true" || query.activo === "1";
    }
    if (query?.plan) {
      where.plan = query.plan;
    }

    const [total, colegios] = await Promise.all([
      this.prismaService.colegio.count({ where }),
      this.prismaService.colegio.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: { users: true },
          },
        },
      }),
    ]);

    const dataWithAdminCounts = await Promise.all(
      colegios.map(async (colegio) => {
        const adminCount = await this.prismaService.user.count({
          where: { colegioId: colegio.id, role: "ADMIN" },
        });
        const activeAdminCount = await this.prismaService.user.count({
          where: { colegioId: colegio.id, role: "ADMIN", active: true },
        });
        return {
          ...colegio,
          _count: {
            ...colegio._count,
            admins: adminCount,
            activeAdmins: activeAdminCount,
          },
        };
      }),
    );

    return {
      data: dataWithAdminCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const colegio = await this.prismaService.colegio.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!colegio) {
      throw new NotFoundException(`Colegio con ID ${id} no encontrado.`);
    }

    const adminCount = await this.prismaService.user.count({
      where: { colegioId: id, role: "ADMIN" },
    });
    const activeAdminCount = await this.prismaService.user.count({
      where: { colegioId: id, role: "ADMIN", active: true },
    });

    return {
      ...colegio,
      _count: {
        ...colegio._count,
        admins: adminCount,
        activeAdmins: activeAdminCount,
      },
    };
  }

  async update(id: string, dto: UpdateColegioDto, superAdminUserId?: string, ipOrigen?: string) {
    const colegio = await this.findOne(id);

    const updated = await this.prismaService.colegio.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        direccion: dto.direccion,
        telefono: dto.telefono,
        plan: dto.plan,
        fechaTermino: dto.fechaTermino ? new Date(dto.fechaTermino) : undefined,
        activo: dto.activo,
      },
    });

    const cambios: string[] = [];
    if (dto.nombre && dto.nombre !== colegio.nombre) cambios.push(`nombre: '${colegio.nombre}' → '${dto.nombre}'`);
    if (dto.plan && dto.plan !== colegio.plan) cambios.push(`plan: '${colegio.plan}' → '${dto.plan}'`);
    if (dto.activo !== undefined && dto.activo !== colegio.activo) cambios.push(`activo: ${colegio.activo} → ${dto.activo}`);

    await this.auditService.registrarEvento({
      tipoEvento: "colegio_update",
      userId: superAdminUserId ?? null,
      ipOrigen,
      resultado: "success",
      mensaje: `Colegio '${updated.nombre}' (ID: ${id}) actualizado. Cambios: ${cambios.length > 0 ? cambios.join(", ") : "sin cambios"}.`,
    });

    return updated;
  }

  async deactivate(id: string, superAdminUserId?: string, ipOrigen?: string) {
    const colegio = await this.findOne(id);

    const updated = await this.prismaService.colegio.update({
      where: { id },
      data: { activo: false },
    });

    await this.auditService.registrarEvento({
      tipoEvento: "colegio_deactivate",
      userId: superAdminUserId ?? null,
      ipOrigen,
      resultado: "success",
      mensaje: `Colegio '${colegio.nombre}' (ID: ${id}, RUT: ${colegio.rut}) desactivado por SUPERADMIN.`,
    });

    return updated;
  }

  async getStats(id: string) {
    await this.findOne(id);

    const [totalUsers, activeUsers, admins, teachers, superadmins] = await Promise.all([
      this.prismaService.user.count({ where: { colegioId: id } }),
      this.prismaService.user.count({ where: { colegioId: id, active: true } }),
      this.prismaService.user.count({ where: { colegioId: id, role: "ADMIN" } }),
      this.prismaService.user.count({ where: { colegioId: id, role: "TEACHER" } }),
      this.prismaService.user.count({ where: { colegioId: id, role: "SUPERADMIN" } }),
    ]);

    return { totalUsers, activeUsers, admins, teachers, superadmins };
  }

  async getProfessors(id: string, query?: { page?: string; limit?: string; active?: string; specialty?: string }) {
    await this.findOne(id);

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = { colegioId: id, role: "TEACHER" };
    if (query?.active !== undefined) {
      where.active = query.active === "true" || query.active === "1";
    }
    if (query?.specialty) {
      where.specialty = { contains: query.specialty, mode: "insensitive" };
    }

    const [total, professors] = await Promise.all([
      this.prismaService.user.count({ where }),
      this.prismaService.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          nombreCompleto: true,
          specialty: true,
          position: true,
          active: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: professors,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdmins(id: string) {
    await this.findOne(id);

    const admins = await this.prismaService.user.findMany({
      where: { colegioId: id, role: "ADMIN" },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        rut: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      data: admins,
      total: admins.length,
    };
  }
}
