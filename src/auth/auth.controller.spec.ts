import { Request } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

describe("AuthController", () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
    updateMe: jest.fn(),
  } as any;

  const controller = new AuthController(authService);

  const mockRequest = (ip: string, user?: { id: string; email?: string }): Request =>
    ({ ip, user } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("passes ip and payload to AuthService.register", async () => {
      authService.register.mockResolvedValue({ access_token: "access" });
      const req = mockRequest("192.168.1.1");
      const dto = { email: "docente@correo.com", password: "Password123!", rut: "12.345.678-9", nombreCompleto: "Juan" };

      await controller.register(req, dto);

      expect(authService.register).toHaveBeenCalledWith(dto, "192.168.1.1");
    });
  });

  describe("login", () => {
    it("passes ip and payload to AuthService.login", async () => {
      authService.login.mockResolvedValue({ access_token: "access" });
      const req = mockRequest("10.0.0.1");
      const dto = { email: "docente@correo.com", password: "Password123!" };

      await controller.login(req, dto);

      expect(authService.login).toHaveBeenCalledWith(dto, "10.0.0.1");
    });
  });

  describe("refresh", () => {
    it("passes ip and payload to AuthService.refresh", async () => {
      authService.refresh.mockResolvedValue({ access_token: "new-access" });
      const req = mockRequest("172.16.0.1");
      const dto = { refreshToken: "refresh-token" };

      await controller.refresh(req, dto);

      expect(authService.refresh).toHaveBeenCalledWith(dto, "172.16.0.1");
    });
  });

  describe("logout", () => {
    it("passes authorization header and ip to AuthService.logout", async () => {
      authService.logout.mockResolvedValue({ message: "Sesión cerrada correctamente" });
      const req = mockRequest("192.168.1.1", { id: "supabase-1" });

      await controller.logout(req, "Bearer access-token-xyz");

      expect(authService.logout).toHaveBeenCalledWith("Bearer access-token-xyz", "192.168.1.1");
    });
  });

  describe("me", () => {
    it("passes request with user to AuthService.me", async () => {
      authService.me.mockResolvedValue({ id: "perfil-1" });
      const req = mockRequest("192.168.1.1", { id: "supabase-1", email: "docente@correo.com" });

      await controller.me(req);

      expect(authService.me).toHaveBeenCalledWith(req);
    });
  });

  describe("updateMe", () => {
    it("passes request with user, dto and ip to AuthService.updateMe", async () => {
      authService.updateMe.mockResolvedValue({ id: "perfil-1" });
      const req = mockRequest("192.168.1.1", { id: "supabase-1" });
      const dto = { nombreCompleto: "Juan Pérez" };

      await controller.updateMe(req, dto);

      expect(authService.updateMe).toHaveBeenCalledWith(req, dto, "192.168.1.1");
    });
  });
});