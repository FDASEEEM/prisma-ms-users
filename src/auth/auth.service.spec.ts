import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { CognitoService } from "../infrastructure/cognito/cognito.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../infrastructure/audit/audit.service";
import { UnauthorizedException } from "@nestjs/common";

describe("AuthService", () => {
  let service: AuthService;

  const cognitoService = {
    signJwt: jest.fn(),
    verifyToken: jest.fn(),
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    getGoogleAuthUrl: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getUser: jest.fn(),
  };

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    linkSupabaseUser: jest.fn(),
  };

  const auditService = {
    registrarEvento: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CognitoService, useValue: cognitoService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("creates a profile and returns tokens", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      cognitoService.hashPassword.mockResolvedValue("hashed-pw");
      usersService.createProfile.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });
      cognitoService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.register(
        {
          email: "test@test.com",
          password: "secret123",
          rut: "12.345.678-9",
          nombreCompleto: "Test User",
        } as any,
        "127.0.0.1",
      );

      expect(result.access_token).toBe("jwt-token");
      expect(result.user.id).toBe("profile-1");
      expect(cognitoService.hashPassword).toHaveBeenCalledWith("secret123");
    });

    it("throws ConflictException when email already exists", async () => {
      usersService.findByEmail.mockResolvedValue({ id: "existing" });

      await expect(
        service.register(
          {
            email: "test@test.com",
            password: "secret123",
            nombreCompleto: "Test",
          } as any,
          "127.0.0.1",
        ),
      ).rejects.toThrow("El email ya está registrado.");
    });
  });

  describe("login", () => {
    it("returns tokens when credentials are valid", async () => {
      const profile = { id: "profile-1", email: "test@test.com" };
      usersService.findByEmail.mockResolvedValue(profile);
      cognitoService.verifyPassword.mockResolvedValue(true);
      cognitoService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.login(
        { email: "test@test.com", password: "secret123" },
        "127.0.0.1",
      );

      expect(result.access_token).toBe("jwt-token");
      expect(result.user.id).toBe("profile-1");
    });

    it("throws UnauthorizedException for invalid credentials", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login(
          { email: "test@test.com", password: "wrong" },
          "127.0.0.1",
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("returns new tokens for a valid refresh token", async () => {
      cognitoService.verifyToken.mockResolvedValue({
        sub: "profile-1",
        type: "refresh",
      });
      usersService.findById.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });
      cognitoService.signJwt.mockResolvedValue("new-jwt");

      const result = await service.refresh(
        { refreshToken: "valid-refresh" },
        "127.0.0.1",
      );

      expect(result.access_token).toBe("new-jwt");
    });
  });
});
