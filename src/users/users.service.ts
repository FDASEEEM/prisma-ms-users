import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { AuditService } from "../infrastructure/audit/audit.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { CreateUserProfileDto } from "./dto/create-user-profile.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createProfile(dto: CreateUserProfileDto): Promise<User> {
    return this.prismaService.user.create({
      data: {
        supabaseUserId: dto.supabaseUserId,
        email: dto.email,
        rut: dto.rut,
        nombreCompleto: dto.nombreCompleto,
        establecimiento: dto.establecimiento,
        phone: dto.phone,
        specialty: dto.specialty,
        position: dto.position,
        active: dto.active ?? true,
        role: dto.role ?? "TEACHER",
        colegioId: dto.colegioId,
      } as any,
    });
  }

  async findBySupabaseUserId(supabaseUserId: string): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: { supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException("User profile not found.");
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: { email },
    });
  }

  async updateProfile(
    supabaseUserId: string,
    dto: UpdateUserProfileDto,
    ipOrigen?: string,
  ): Promise<User> {
    const currentUser = await this.prismaService.user.findUnique({
      where: { supabaseUserId },
    });

    if (!currentUser) {
      throw new NotFoundException("User profile not found.");
    }

    try {
      const updatedUser = await this.prismaService.user.update({
        where: { supabaseUserId },
        data: {
          nombreCompleto: dto.nombreCompleto,
          establecimiento: dto.establecimiento,
          phone: dto.phone,
          specialty: dto.specialty,
          position: dto.position,
          active: dto.active,
        } as any,
      });

      await this.auditService.registrarEvento({
        tipoEvento: "profile_update",
        userId: currentUser.id,
        resultado: "success",
        ipOrigen,
        mensaje: "Actualización de perfil ejecutada correctamente.",
      });

      return updatedUser;
    } catch (error: unknown) {
      await this.auditService.registrarEvento({
        tipoEvento: "profile_update",
        userId: currentUser.id,
        resultado: "failure",
        ipOrigen,
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al actualizar el perfil.",
      });

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException("User profile not found.");
      }

      throw error instanceof Error
        ? error
        : new Error("Unexpected error updating user profile.");
    }
  }
}
