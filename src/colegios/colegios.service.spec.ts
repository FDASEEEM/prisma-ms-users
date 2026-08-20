import { Test, TestingModule } from "@nestjs/testing";
import { ColegiosService } from "./colegios.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { CognitoService } from "../infrastructure/cognito/cognito.service";
import { AuditService } from "../infrastructure/audit/audit.service";
import { ConflictException } from "@nestjs/common";

describe("ColegiosService", () => {
  let service: ColegiosService;

  const prismaService = {
    colegio: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const cognitoService = {
    createUserWithPasswordAndMetadata: jest.fn(),
    deleteUser: jest.fn(),
    updateUserAppMetadata: jest.fn(),
    verifyToken: jest.fn(),
  };

  const auditService = {
    registrarEvento: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ColegiosService,
        { provide: PrismaService, useValue: prismaService },
        { provide: CognitoService, useValue: cognitoService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(ColegiosService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("creates a colegio and admin user via Cognito", async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      cognitoService.createUserWithPasswordAndMetadata.mockResolvedValue({ id: "cognito-sub-1" });
      prismaService.user.create.mockResolvedValue({
        id: "admin-1",
        email: "admin@test.com",
      });
      prismaService.colegio.create.mockResolvedValue({
        id: "colegio-1",
        nombre: "Test School",
        rut: "12.345.678-9",
        plan: "basic",
      });
      cognitoService.updateUserAppMetadata.mockResolvedValue(undefined);

      const result = await service.create(
        {
          nombre: "Test School",
          email: "school@test.com",
          rut: "12.345.678-9",
          adminEmail: "admin@test.com",
          adminPassword: "password123",
          adminNombre: "Admin User",
        } as any,
        "superadmin-1",
        "127.0.0.1",
      );

      expect(result.colegio.nombre).toBe("Test School");
      expect(cognitoService.createUserWithPasswordAndMetadata).toHaveBeenCalledWith(
        "admin@test.com",
        "password123",
        { nombreCompleto: "Admin User" },
        { role: "ADMIN", colegioId: "" },
      );
    });

    it("throws ConflictException when email already exists", async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.create(
          {
            nombre: "Test",
            email: "school@test.com",
            rut: "12.345.678-9",
            adminEmail: "admin@test.com",
            adminPassword: "password123",
            adminNombre: "Admin",
          } as any,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("audits failure when Cognito user creation fails", async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      cognitoService.createUserWithPasswordAndMetadata.mockRejectedValue(new Error("Cognito error"));

      await expect(
        service.create(
          {
            nombre: "Test School",
            email: "school@test.com",
            rut: "12.345.678-9",
            adminEmail: "admin@test.com",
            adminPassword: "password123",
            adminNombre: "Admin",
          } as any,
          "superadmin-1",
          "127.0.0.1",
        ),
      ).rejects.toThrow(ConflictException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({ resultado: "failure" }),
      );
    });

    it("rolls back Cognito user when Postgres creation fails", async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      cognitoService.createUserWithPasswordAndMetadata.mockResolvedValue({ id: "cognito-sub-1" });
      prismaService.user.create.mockRejectedValue(new Error("DB error"));

      await expect(
        service.create(
          {
            nombre: "Test School",
            email: "school@test.com",
            rut: "12.345.678-9",
            adminEmail: "admin@test.com",
            adminPassword: "password123",
            adminNombre: "Admin",
          } as any,
          "superadmin-1",
          "127.0.0.1",
        ),
      ).rejects.toThrow();

      expect(cognitoService.deleteUser).toHaveBeenCalledWith("cognito-sub-1");
    });
  });
});
