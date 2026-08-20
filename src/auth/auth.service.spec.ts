import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { CognitoService } from "../infrastructure/cognito/cognito.service";
import { UsersService } from "../users/users.service";
import { AuditService } from "../infrastructure/audit/audit.service";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

describe("AuthService", () => {
  let service: AuthService;

  const cognitoService = {
    createUserWithPasswordAndMetadata: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    getGoogleAuthUrl: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    logout: jest.fn(),
    getUser: jest.fn(),
  };

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    findBySupabaseUserId: jest.fn(),
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
    it("creates the Cognito user and the profile, returns empty tokens (Hosted UI)", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      cognitoService.createUserWithPasswordAndMetadata.mockResolvedValue({
        id: "cognito-1",
      });
      usersService.createProfile.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });

      const result = await service.register(
        {
          email: "test@test.com",
          password: "secret123",
          rut: "12.345.678-9",
          nombreCompleto: "Test User",
          colegioId: "colegio-1",
        } as any,
        "127.0.0.1",
      );

      expect(cognitoService.createUserWithPasswordAndMetadata).toHaveBeenCalledWith(
        "test@test.com",
        "secret123",
        { nombreCompleto: "Test User" },
        { role: "TEACHER", colegioId: "colegio-1" },
      );
      expect(usersService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseUserId: "cognito-1",
          email: "test@test.com",
          role: "TEACHER",
        }),
      );
      expect(result.access_token).toBe("");
      expect(result.refresh_token).toBe("");
      expect(result.user.id).toBe("profile-1");
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
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("returns tokens when credentials are valid", async () => {
      cognitoService.login.mockResolvedValue({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "cognito-1", email: "test@test.com" },
      });
      usersService.findBySupabaseUserId.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });

      const result = await service.login(
        { email: "test@test.com", password: "secret123" },
        "127.0.0.1",
      );

      expect(result.access_token).toBe("access-1");
      expect(result.refresh_token).toBe("refresh-1");
      expect(result.user.id).toBe("profile-1");
    });

    it("throws UnauthorizedException for invalid credentials", async () => {
      cognitoService.login.mockRejectedValue(new UnauthorizedException());
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
      cognitoService.refresh.mockResolvedValue({
        accessToken: "access-2",
        refreshToken: "refresh-2",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "cognito-1" },
      });
      usersService.findBySupabaseUserId.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });

      const result = await service.refresh(
        { refreshToken: "valid-refresh" },
        "127.0.0.1",
      );

      expect(result.access_token).toBe("access-2");
      expect(cognitoService.refresh).toHaveBeenCalledWith("valid-refresh");
    });
  });

  describe("getGoogleAuthUrl", () => {
    it("requires a redirectTo", async () => {
      await expect(
        service.getGoogleAuthUrl(undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it("delegates to CognitoService", async () => {
      cognitoService.getGoogleAuthUrl.mockResolvedValue({
        url: "https://domain/oauth2/authorize?...",
        state: "state-1",
      });

      const result = await service.getGoogleAuthUrl(
        "http://localhost:3010/api/auth/google/callback",
      );

      expect(result.url).toContain("oauth2/authorize");
      expect(cognitoService.getGoogleAuthUrl).toHaveBeenCalledWith(
        "http://localhost:3010/api/auth/google/callback",
      );
    });
  });

  describe("exchangeGoogleCode", () => {
    it("returns a session and provisions a new TEACHER profile", async () => {
      cognitoService.exchangeGoogleCode.mockResolvedValue({
        accessToken: "access-g",
        refreshToken: "refresh-g",
        tokenType: "bearer",
        expiresIn: 3600,
        user: {
          id: "google-1",
          email: "google@test.com",
          user_metadata: { full_name: "Google User" },
        },
      });
      usersService.findBySupabaseUserId.mockRejectedValue(new NotFoundException());
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createProfile.mockResolvedValue({
        id: "profile-g",
        email: "google@test.com",
        role: "TEACHER",
      });

      const result = await service.exchangeGoogleCode("code-1", "state-1", "ip");

      expect(result.access_token).toBe("access-g");
      expect(usersService.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseUserId: "google-1",
          email: "google@test.com",
          role: "TEACHER",
          nombreCompleto: "Google User",
        }),
      );
    });

    it("links an existing profile by email when there is no supabase user", async () => {
      cognitoService.exchangeGoogleCode.mockResolvedValue({
        accessToken: "access-g",
        refreshToken: "refresh-g",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "google-1", email: "existing@test.com" },
      });
      usersService.findBySupabaseUserId.mockRejectedValue(new NotFoundException());
      usersService.findByEmail.mockResolvedValue({ id: "profile-existing" });
      usersService.linkSupabaseUser.mockResolvedValue({
        id: "profile-existing",
        email: "existing@test.com",
      });

      const result = await service.exchangeGoogleCode("code-1", "state-1", "ip");

      expect(result.user.id).toBe("profile-existing");
      expect(usersService.linkSupabaseUser).toHaveBeenCalledWith(
        "profile-existing",
        "google-1",
      );
    });
  });

  describe("me", () => {
    it("returns the profile from the authenticated user id (token sub = supabaseUserId)", async () => {
      usersService.findBySupabaseUserId.mockResolvedValue({
        id: "profile-1",
        email: "test@test.com",
      });

      const result = await service.me({ user: { id: "profile-1" } });

      expect(usersService.findBySupabaseUserId).toHaveBeenCalledWith("profile-1");
      expect(result.id).toBe("profile-1");
    });
  });
});
