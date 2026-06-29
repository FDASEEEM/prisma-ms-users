import { AuditService } from "./audit.service";

describe("AuditService", () => {
  const prismaService = {
    logUsuario: {
      create: jest.fn(),
    },
  } as any;

  const service = new AuditService(prismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("registrarEvento", () => {
    it("calls prismaService.logUsuario.create with correct data", async () => {
      prismaService.logUsuario.create.mockResolvedValue({ id: "log-1" });

      await service.registrarEvento({
        tipoEvento: "register",
        userId: "user-1",
        ipOrigen: "127.0.0.1",
        resultado: "success",
        mensaje: "Registro completado.",
      });

      expect(prismaService.logUsuario.create).toHaveBeenCalledWith({
        data: {
          tipoEvento: "register",
          userId: "user-1",
          ipOrigen: "127.0.0.1",
          resultado: "success",
          mensaje: "Registro completado.",
        },
      });
    });

    it("converts undefined userId to null", async () => {
      prismaService.logUsuario.create.mockResolvedValue({ id: "log-1" });

      await service.registrarEvento({
        tipoEvento: "login",
        userId: undefined,
        ipOrigen: undefined,
        resultado: "failure",
        mensaje: "Login failed.",
      });

      expect(prismaService.logUsuario.create).toHaveBeenCalledWith({
        data: {
          tipoEvento: "login",
          userId: null,
          ipOrigen: null,
          resultado: "failure",
          mensaje: "Login failed.",
        },
      });
    });

    it("silently swallows errors and does not throw", async () => {
      prismaService.logUsuario.create.mockRejectedValue(new Error("DB error"));

      await expect(
        service.registrarEvento({
          tipoEvento: "logout",
          userId: "user-1",
          ipOrigen: "127.0.0.1",
          resultado: "failure",
          mensaje: "Logout failed.",
        }),
      ).resolves.toBeUndefined();
    });
  });
});