import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const supabaseService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    deleteUser: jest.fn(),
    getUser: jest.fn(),
    getGoogleAuthUrl: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    updateUserAppMetadata: jest.fn(),
  } as any;

  const usersService = {
    createProfile: jest.fn(),
    findBySupabaseUserId: jest.fn(),
    findByEmail: jest.fn(),
    updateProfile: jest.fn(),
    linkSupabaseUser: jest.fn(),
  } as any;

  const auditService = {
    registrarEvento: jest.fn(),
  } as any;

  const service = new AuthService(supabaseService, usersService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    const dto = {
      email: "docente@correo.com",
      password: "Password123!",
      rut: "12.345.678-9",
      nombreCompleto: "Juan Pérez",
      establecimiento: "Liceo San Martín",
    };

    it("registers successfully with audit success", async () => {
      supabaseService.register.mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1", email: "docente@correo.com" },
      });
      usersService.createProfile.mockResolvedValue({ id: "perfil-1" });

      await expect(service.register(dto, "127.0.0.1")).resolves.toEqual({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "perfil-1" },
      });

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "register",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "success",
        mensaje: "Registro de docente completado correctamente.",
      });

      expect(usersService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseUserId: "supabase-1",
          email: "docente@correo.com",
          rut: "12.345.678-9",
          nombreCompleto: "Juan Pérez",
          active: true,
          role: "TEACHER",
        }),
      );
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

      await expect(service.register(dto, "127.0.0.1")).rejects.toThrow("DB error");

      expect(supabaseService.deleteUser).toHaveBeenCalledWith("supabase-1");
    });

    it("rolls back and audits failure when Supabase register throws", async () => {
      supabaseService.register.mockRejectedValue(new Error("Supabase error"));

      await expect(service.register(dto, "127.0.0.1")).rejects.toThrow("Supabase error");

      expect(supabaseService.deleteUser).not.toHaveBeenCalled();
      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "register",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Supabase error",
      });
    });

    it("audits failure with fallback message when error is not an Error instance", async () => {
      supabaseService.register.mockRejectedValue("string error" as any);

      await expect(service.register(dto, "127.0.0.1")).rejects.toBeTruthy();

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "register",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Error inesperado en el registro.",
      });
    });
  });

  describe("login", () => {
    const dto = { email: "docente@correo.com", password: "Password123!" };

    it("logs in successfully with audit success", async () => {
      supabaseService.login.mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1" },
      });
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(service.login(dto, "127.0.0.1")).resolves.toEqual({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "perfil-1" },
      });

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "login",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "success",
        mensaje: "Inicio de sesión exitoso.",
      });
    });

    it("audits failure when profile not found in database after Supabase login", async () => {
      supabaseService.login.mockResolvedValue({
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1" },
      });
      usersService.findBySupabaseUserId.mockRejectedValue(
        new NotFoundException("User profile not found."),
      );
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto, "127.0.0.1")).rejects.toBeInstanceOf(NotFoundException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "login",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "User profile not found.",
      });
    });

    it("audits failure when Supabase login throws", async () => {
      supabaseService.login.mockRejectedValue(new UnauthorizedException("Invalid credentials"));
      usersService.findByEmail.mockResolvedValue({ id: "perfil-1" });

      await expect(service.login(dto, "127.0.0.1")).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "login",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Invalid credentials",
      });
    });

    it("audits failure with fallback message when login error is not an Error instance", async () => {
      supabaseService.login.mockRejectedValue("string error" as any);
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto, "127.0.0.1")).rejects.toBeTruthy();

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "login",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Error inesperado en el inicio de sesión.",
      });
    });
  });

  describe("refresh", () => {
    const dto = { refreshToken: "refresh-token" };

    it("refreshes successfully with audit success", async () => {
      supabaseService.refresh.mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1" },
      });
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(service.refresh(dto, "127.0.0.1")).resolves.toEqual({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "perfil-1" },
      });

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "refresh",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "success",
        mensaje: "Refresco de token ejecutado correctamente.",
      });
    });

    it("audits failure when refresh throws", async () => {
      supabaseService.refresh.mockRejectedValue(new UnauthorizedException("Invalid refresh token"));

      await expect(service.refresh(dto, "127.0.0.1")).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "refresh",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Invalid refresh token",
      });
    });

    it("audits failure with fallback message when refresh error is not an Error instance", async () => {
      supabaseService.refresh.mockRejectedValue("string error" as any);

      await expect(service.refresh(dto, "127.0.0.1")).rejects.toBeTruthy();

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "refresh",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Error inesperado al refrescar la sesión.",
      });
    });
  });

  describe("getGoogleAuthUrl", () => {
    it("throws BadRequestException when redirectTo is missing", async () => {
      await expect(service.getGoogleAuthUrl()).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.getGoogleAuthUrl("")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("delegates to supabaseService with the redirectTo", async () => {
      supabaseService.getGoogleAuthUrl.mockResolvedValue({
        url: "https://google.com/auth",
        state: "pkce-state",
      });

      const result = await service.getGoogleAuthUrl(
        "http://localhost:3010/api/auth/google/callback",
      );

      expect(supabaseService.getGoogleAuthUrl).toHaveBeenCalledWith(
        "http://localhost:3010/api/auth/google/callback",
      );
      expect(result).toEqual({
        url: "https://google.com/auth",
        state: "pkce-state",
      });
    });
  });

  describe("exchangeGoogleCode", () => {
    const session = {
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      user: {
        id: "google-1",
        email: "g@test.cl",
        user_metadata: { full_name: "Google User" },
      },
    };

    it("provisions a new profile for a first-time Google user", async () => {
      supabaseService.exchangeGoogleCode.mockResolvedValue(session);
      usersService.findBySupabaseUserId.mockRejectedValue(
        new NotFoundException("User profile not found."),
      );
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createProfile.mockResolvedValue({ id: "perfil-1" });
      supabaseService.updateUserAppMetadata.mockResolvedValue(undefined);

      await expect(
        service.exchangeGoogleCode("code", "state", "127.0.0.1"),
      ).resolves.toEqual({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "perfil-1" },
      });

      expect(usersService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseUserId: "google-1",
          email: "g@test.cl",
          nombreCompleto: "Google User",
          role: "TEACHER",
        }),
      );
      expect(supabaseService.updateUserAppMetadata).toHaveBeenCalledWith(
        "google-1",
        { role: "TEACHER", colegioId: null },
      );
      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: "login",
          resultado: "success",
        }),
      );
    });

    it("reuses the profile when the supabase user already exists", async () => {
      supabaseService.exchangeGoogleCode.mockResolvedValue(session);
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(
        service.exchangeGoogleCode("code", "state"),
      ).resolves.toEqual(expect.objectContaining({ user: { id: "perfil-1" } }));

      expect(usersService.createProfile).not.toHaveBeenCalled();
    });

    it("links an existing profile by email when the supabase user is new", async () => {
      supabaseService.exchangeGoogleCode.mockResolvedValue(session);
      usersService.findBySupabaseUserId.mockRejectedValue(
        new NotFoundException("User profile not found."),
      );
      usersService.findByEmail.mockResolvedValue({ id: "perfil-1" });
      usersService.linkSupabaseUser.mockResolvedValue({ id: "perfil-1" });

      await service.exchangeGoogleCode("code", "state");

      expect(usersService.linkSupabaseUser).toHaveBeenCalledWith(
        "perfil-1",
        "google-1",
      );
    });

    it("audits failure when the exchange throws", async () => {
      supabaseService.exchangeGoogleCode.mockRejectedValue(
        new UnauthorizedException("Invalid code"),
      );

      await expect(
        service.exchangeGoogleCode("code", "state"),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: "login",
          resultado: "failure",
          mensaje: "Invalid code",
        }),
      );
    });
  });

  describe("logout", () => {
    it("throws BadRequestException when authorization header is missing", async () => {
      await expect(service.logout()).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.logout(undefined, "127.0.0.1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws BadRequestException when authorization scheme is not bearer", async () => {
      await expect(service.logout("Basic abc123", "127.0.0.1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws BadRequestException when token is missing", async () => {
      await expect(service.logout("Bearer", "127.0.0.1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("logs out successfully when all conditions are met", async () => {
      supabaseService.getUser.mockResolvedValue({ id: "supabase-1" });
      supabaseService.logout.mockResolvedValue(undefined);
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(service.logout("Bearer access-token", "127.0.0.1")).resolves.toEqual({
        message: "Sesión cerrada correctamente",
      });

      expect(supabaseService.logout).toHaveBeenCalledWith("access-token");
      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "logout",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "success",
        mensaje: "Cierre de sesión ejecutado correctamente.",
      });
    });

    it("audits failure when logout throws and falls back to null userId", async () => {
      supabaseService.getUser.mockResolvedValue({ id: "supabase-1" });
      supabaseService.logout.mockRejectedValue(new Error("Logout failed"));
      usersService.findBySupabaseUserId.mockRejectedValue(new Error("User not found"));

      await expect(service.logout("Bearer access-token", "127.0.0.1")).rejects.toThrow("Logout failed");

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "logout",
        userId: null,
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Logout failed",
      });
    });

    it("audits failure when logout throws and userId is resolved in fallback", async () => {
      supabaseService.getUser
        .mockResolvedValueOnce({ id: "supabase-1" })
        .mockResolvedValueOnce({ id: "supabase-1" });
      supabaseService.logout.mockRejectedValue(new Error("Logout failed"));
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(service.logout("Bearer access-token", "127.0.0.1")).rejects.toThrow("Logout failed");

      expect(auditService.registrarEvento).toHaveBeenCalledWith({
        tipoEvento: "logout",
        userId: "perfil-1",
        ipOrigen: "127.0.0.1",
        resultado: "failure",
        mensaje: "Logout failed",
      });
    });
  });

  describe("me", () => {
    it("returns profile when authenticated user is present", async () => {
      usersService.findBySupabaseUserId.mockResolvedValue({ id: "perfil-1" });

      await expect(
        service.me({ user: { id: "supabase-1" } } as any),
      ).resolves.toEqual({ id: "perfil-1" });
    });

    it("throws BadRequestException when authenticated user is absent", async () => {
      await expect(service.me({ user: undefined } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.me({} as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("updateMe", () => {
    it("updates profile when authenticated user is present", async () => {
      usersService.updateProfile.mockResolvedValue({ id: "perfil-1" });

      await expect(
        service.updateMe(
          { user: { id: "supabase-1" } } as any,
          { nombreCompleto: "Juan Pérez" },
          "127.0.0.1",
        ),
      ).resolves.toEqual({ id: "perfil-1" });

      expect(usersService.updateProfile).toHaveBeenCalledWith(
        "supabase-1",
        { nombreCompleto: "Juan Pérez" },
        "127.0.0.1",
      );
    });

    it("throws BadRequestException when authenticated user is absent", async () => {
      await expect(
        service.updateMe({ user: undefined } as any, { nombreCompleto: "Juan" }, "127.0.0.1"),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateMe({} as any, { nombreCompleto: "Juan" }, "127.0.0.1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});