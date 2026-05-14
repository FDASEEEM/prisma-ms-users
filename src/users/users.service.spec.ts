import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prismaService = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    logUsuario: {
      create: jest.fn(),
    },
  } as any;

  const auditService = {
    registrarEvento: jest.fn(),
  } as any;

  const service = new UsersService(prismaService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProfile", () => {
    it("maps all DTO fields including active true", async () => {
      prismaService.user.create.mockResolvedValue({ id: "1" });

      const result = await service.createProfile({
        supabaseUserId: "supabase-1",
        email: "docente@correo.com",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
        establecimiento: "Liceo San Martín",
        phone: "+56911111111",
        specialty: "Matemáticas",
        position: "Titular",
        active: true,
      });

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          supabaseUserId: "supabase-1",
          email: "docente@correo.com",
          rut: "12.345.678-9",
          nombreCompleto: "Juan Pérez",
          establecimiento: "Liceo San Martín",
          phone: "+56911111111",
          specialty: "Matemáticas",
          position: "Titular",
          active: true,
        },
      });
      expect(result).toEqual({ id: "1" });
    });

    it("uses default value true for active when not provided", async () => {
      prismaService.user.create.mockResolvedValue({ id: "1" });

      await service.createProfile({
        supabaseUserId: "supabase-1",
        email: "docente@correo.com",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
      });

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          supabaseUserId: "supabase-1",
          email: "docente@correo.com",
          rut: "12.345.678-9",
          nombreCompleto: "Juan Pérez",
          active: true,
        },
      });
    });
  });

  describe("findBySupabaseUserId", () => {
    it("returns profile when found", async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: "1" });

      await expect(service.findBySupabaseUserId("supabase-1")).resolves.toEqual({
        id: "1",
      });
    });

    it("throws NotFoundException when profile does not exist", async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.findBySupabaseUserId("missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("findByEmail", () => {
    it("returns profile when found", async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: "1", email: "docente@correo.com" });

      await expect(service.findByEmail("docente@correo.com")).resolves.toEqual({
        id: "1",
        email: "docente@correo.com",
      });
    });

    it("returns null when profile does not exist", async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findByEmail("missing@correo.com")).resolves.toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("updates profile and logs success audit", async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: "1" });
      prismaService.user.update.mockResolvedValue({ id: "1" });

      const result = await service.updateProfile(
        "supabase-1",
        { nombreCompleto: "Juan Carlos Pérez", active: false },
        "127.0.0.1",
      );

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { supabaseUserId: "supabase-1" },
        data: {
          nombreCompleto: "Juan Carlos Pérez",
          active: false,
        },
      });
      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "profile_update",
        userId: "1",
        resultado: "success",
        ipOrigen: "127.0.0.1",
        mensaje: "Actualización de perfil ejecutada correctamente.",
      });
      expect(result).toEqual({ id: "1" });
    });

    it("throws NotFoundException when current user not found", async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile("missing", { nombreCompleto: "Juan" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException on Prisma P2025 error", async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: "1" });

      const error = new Error("Record not found") as Error & { code?: string };
      Object.setPrototypeOf(
        error,
        Prisma.PrismaClientKnownRequestError.prototype,
      );
      error.code = "P2025";
      prismaService.user.update.mockRejectedValue(error);

      await expect(
        service.updateProfile("missing", { nombreCompleto: "Juan" }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "profile_update",
        userId: "1",
        resultado: "failure",
        ipOrigen: undefined,
        mensaje: "Record not found",
      });
    });

    it("throws generic error and logs failure audit", async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: "1" });
      const error = new Error("Database connection lost");
      prismaService.user.update.mockRejectedValue(error);

      await expect(
        service.updateProfile("supabase-1", { nombreCompleto: "Juan" }),
      ).rejects.toThrow("Database connection lost");

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "profile_update",
        userId: "1",
        resultado: "failure",
        ipOrigen: undefined,
        mensaje: "Database connection lost",
      });
    });
  });
});