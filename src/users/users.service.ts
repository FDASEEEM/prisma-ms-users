import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { CreateUserProfileDto } from "./dto/create-user-profile.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";

type UsuarioPerfil = {
  id: string;
  supabaseUserId: string;
  email: string;
  rut: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  specialty?: string | null;
  position?: string | null;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createProfile(dto: CreateUserProfileDto): Promise<UsuarioPerfil> {
    return (this.prismaService as any).usuario.create({
      data: {
        supabaseUserId: dto.supabaseUserId,
        email: dto.email,
        rut: dto.rut,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        specialty: dto.specialty,
        position: dto.position,
        active: dto.active ?? true,
      },
    });
  }

  async findBySupabaseUserId(supabaseUserId: string): Promise<UsuarioPerfil> {
    const user = await (this.prismaService as any).usuario.findUnique({
      where: { supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException("User profile not found.");
    }

    return user;
  }

  async updateProfile(
    supabaseUserId: string,
    dto: UpdateUserProfileDto,
  ): Promise<UsuarioPerfil> {
    try {
      return await (this.prismaService as any).usuario.update({
        where: { supabaseUserId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          specialty: dto.specialty,
          position: dto.position,
          active: dto.active,
        },
      });
    } catch (error: unknown) {
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
