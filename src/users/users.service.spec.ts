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
  } as any;

  const service = new UsersService(prismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a profile mapping the Spanish fields", async () => {
    prismaService.user.create.mockResolvedValue({ id: "1" });

    const result = await service.createProfile({
      supabaseUserId: "supabase-1",
      email: "docente@correo.com",
      rut: "12.345.678-9",
      firstName: "Juan",
      lastName: "Pérez",
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
        firstName: "Juan",
        lastName: "Pérez",
        phone: "+56911111111",
        specialty: "Matemáticas",
        position: "Titular",
        active: true,
      },
    });
    expect(result).toEqual({ id: "1" });
  });

  it("returns the profile by Supabase user id", async () => {
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

  it("updates the editable profile fields", async () => {
    prismaService.user.update.mockResolvedValue({ id: "1" });

    const result = await service.updateProfile("supabase-1", {
      firstName: "Juan Carlos",
      active: false,
    });

    expect(prismaService.user.update).toHaveBeenCalledWith({
      where: { supabaseUserId: "supabase-1" },
      data: {
        firstName: "Juan Carlos",
        lastName: undefined,
        phone: undefined,
        specialty: undefined,
        position: undefined,
        active: false,
      },
    });
    expect(result).toEqual({ id: "1" });
  });

  it("converts Prisma P2025 into NotFoundException", async () => {
    const error = new Error("Record not found") as Error & { code?: string };
    Object.setPrototypeOf(
      error,
      Prisma.PrismaClientKnownRequestError.prototype,
    );
    error.code = "P2025";
    prismaService.user.update.mockRejectedValue(error);

    await expect(
      service.updateProfile("missing", { firstName: "Juan" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
