import { BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const supabaseService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    deleteUser: jest.fn(),
    getUser: jest.fn(),
  } as any;

  const usersService = {
    createProfile: jest.fn(),
    findBySupabaseUserId: jest.fn(),
    findByEmail: jest.fn(),
    updateProfile: jest.fn(),
  } as any;

  const auditService = {
    registrarEvento: jest.fn(),
  } as any;

  const service = new AuthService(supabaseService, usersService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers and persists the profile", async () => {
    supabaseService.register.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      user: { id: "supabase-1", email: "docente@correo.com" },
    });
    usersService.createProfile.mockResolvedValue({ id: "perfil-1" });

    await expect(
      service.register(
        {
          email: "docente@correo.com",
          password: "Password123!",
          rut: "12.345.678-9",
          nombreCompleto: "Juan Pérez",
          establecimiento: "Liceo San Martín",
        },
        "127.0.0.1",
      ),
    ).resolves.toEqual({
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: { id: "perfil-1" },
    });
  });

  it("rolls back Supabase user when profile persistence fails", async () => {
    supabaseService.register.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      user: { id: "supabase-1", email: "docente@correo.com" },
    });
    usersService.createProfile.mockRejectedValue(new Error("DB error"));

    await expect(
      service.register(
        {
          email: "docente@correo.com",
          password: "Password123!",
          rut: "12.345.678-9",
          nombreCompleto: "Juan Pérez",
          establecimiento: "Liceo San Martín",
        },
        "127.0.0.1",
      ),
    ).rejects.toThrow("DB error");

    expect(supabaseService.deleteUser).toHaveBeenCalledWith("supabase-1");
  });

  it("logs in and returns the mapped session", async () => {
    supabaseService.login.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      user: { id: "supabase-1", email: "docente@correo.com" },
    });
    usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

    await expect(
      service.login(
        { email: "docente@correo.com", password: "Password123!" },
        "127.0.0.1",
      ),
    ).resolves.toEqual({
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: { id: "perfil-1" },
    });
  });

  it("requires bearer token for logout", async () => {
    await expect(service.logout()).rejects.toBeInstanceOf(BadRequestException);
  });

  it("forwards the bearer token to Supabase logout", async () => {
    supabaseService.getUser.mockResolvedValue({ id: "supabase-1" });
    supabaseService.logout.mockResolvedValue(undefined);
    usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

    await expect(
      service.logout("Bearer access-token", "127.0.0.1"),
    ).resolves.toEqual({
      message: "Sesión cerrada correctamente",
    });

    expect(supabaseService.logout).toHaveBeenCalledWith("access-token");
  });

  it("reads the profile for the authenticated user", async () => {
    usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

    await expect(service.me({ user: { id: "supabase-1" } })).resolves.toEqual({
      id: "perfil-1",
    });
  });

  it("updates the profile for the authenticated user", async () => {
    usersService.updateProfile.mockResolvedValue({ id: "perfil-1" });

    await expect(
      service.updateMe(
        { user: { id: "supabase-1" } },
        { nombreCompleto: "Juan Pérez" },
        "127.0.0.1",
      ),
    ).resolves.toEqual({ id: "perfil-1" });
  });
});
