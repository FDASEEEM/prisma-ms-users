import { ConfigService } from "@nestjs/config";
import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";

const signInWithPassword = jest.fn();
const refreshSession = jest.fn();
const signOut = jest.fn();
const getUser = jest.fn();
const createUser = jest.fn();
const deleteUser = jest.fn();
const updateUserById = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        createUser,
        deleteUser,
        updateUserById,
      },
      signInWithPassword,
      refreshSession,
      signOut,
      getUser,
    },
  })),
}));

import { SupabaseService } from "./supabase.service";

describe("SupabaseService", () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const service = new SupabaseService(configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("creates user and signs in successfully", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });
      signInWithPassword.mockResolvedValue({
        error: null,
        data: {
          session: {
            access_token: "access",
            refresh_token: "refresh",
            token_type: "bearer",
            expires_in: 3600,
          },
          user: { id: "supabase-1", email: "docente@correo.com" },
        },
      });

      await expect(
        service.register("docente@correo.com", "Password123!"),
      ).resolves.toEqual({
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1", email: "docente@correo.com" },
      });
    });

    it("throws InternalServerErrorException when createUser fails", async () => {
      createUser.mockResolvedValue({
        error: { message: "Email already exists" },
        data: null,
      });

      await expect(
        service.register("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("throws InternalServerErrorException when createUser returns no user", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: null },
      });

      await expect(
        service.register("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("rolls back by deleting user when login fails after user creation", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });
      signInWithPassword.mockResolvedValue({
        error: { message: "Invalid credentials" },
        data: { session: null, user: null },
      });
      deleteUser.mockResolvedValue({ error: null });

      await expect(
        service.register("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(deleteUser).toHaveBeenCalledWith("supabase-1");
    });

    it("throws when login fails with no session after user creation", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });
      signInWithPassword.mockResolvedValue({
        error: null,
        data: { session: null, user: null },
      });
      deleteUser.mockResolvedValue({ error: null });

      await expect(
        service.register("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(deleteUser).toHaveBeenCalledWith("supabase-1");
    });
  });

  describe("login", () => {
    it("returns session on valid credentials", async () => {
      signInWithPassword.mockResolvedValue({
        error: null,
        data: {
          session: {
            access_token: "access",
            refresh_token: "refresh",
            token_type: "bearer",
            expires_in: 3600,
          },
          user: { id: "supabase-1", email: "docente@correo.com" },
        },
      });

      await expect(
        service.login("docente@correo.com", "Password123!"),
      ).resolves.toEqual({
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1", email: "docente@correo.com" },
      });
    });

    it("throws UnauthorizedException when session is null", async () => {
      signInWithPassword.mockResolvedValue({
        error: null,
        data: { session: null, user: { id: "supabase-1" } },
      });

      await expect(
        service.login("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is null", async () => {
      signInWithPassword.mockResolvedValue({
        error: null,
        data: {
          session: { access_token: "access", refresh_token: "refresh", token_type: "bearer", expires_in: 3600 },
          user: null,
        },
      });

      await expect(
        service.login("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("throws UnauthorizedException on error with message", async () => {
      signInWithPassword.mockResolvedValue({
        error: { message: "Invalid login credentials" },
        data: null,
      });

      await expect(
        service.login("docente@correo.com", "Password123!"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("returns new session on valid refresh token", async () => {
      refreshSession.mockResolvedValue({
        error: null,
        data: {
          session: {
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "bearer",
            expires_in: 3600,
          },
          user: { id: "supabase-1", email: "docente@correo.com" },
        },
      });

      await expect(service.refresh("refresh-token")).resolves.toEqual({
        accessToken: "new-access",
        refreshToken: "new-refresh",
        tokenType: "bearer",
        expiresIn: 3600,
        user: { id: "supabase-1", email: "docente@correo.com" },
      });
    });

    it("throws UnauthorizedException when session is null", async () => {
      refreshSession.mockResolvedValue({
        error: null,
        data: { session: null, user: { id: "supabase-1" } },
      });

      await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when user is null", async () => {
      refreshSession.mockResolvedValue({
        error: null,
        data: {
          session: { access_token: "access", refresh_token: "refresh", token_type: "bearer", expires_in: 3600 },
          user: null,
        },
      });

      await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException on error", async () => {
      refreshSession.mockResolvedValue({
        error: { message: "Invalid refresh token" },
        data: null,
      });

      await expect(service.refresh("bad-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("logout", () => {
    it("succeeds with no error from Supabase", async () => {
      signOut.mockResolvedValue({ error: null });

      await expect(service.logout("access-token")).resolves.toBeUndefined();
    });

    it("throws InternalServerErrorException when Supabase returns error", async () => {
      signOut.mockResolvedValue({ error: { message: "Token expired" } });

      await expect(service.logout("access-token")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("getUser", () => {
    it("returns user on valid access token", async () => {
      getUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1", email: "docente@correo.com" } },
      });

      await expect(service.getUser("access-token")).resolves.toEqual({
        id: "supabase-1",
        email: "docente@correo.com",
      });
    });

    it("throws UnauthorizedException when user is null", async () => {
      getUser.mockResolvedValue({
        error: null,
        data: { user: null },
      });

      await expect(service.getUser("access-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException on error", async () => {
      getUser.mockResolvedValue({
        error: { message: "Invalid access token" },
        data: null,
      });

      await expect(service.getUser("bad-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("deleteUser", () => {
    it("succeeds with no error", async () => {
      deleteUser.mockResolvedValue({ error: null });

      await expect(service.deleteUser("supabase-1")).resolves.toBeUndefined();
    });

    it("throws InternalServerErrorException on error", async () => {
      deleteUser.mockResolvedValue({ error: { message: "User not found" } });

      await expect(service.deleteUser("supabase-1")).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("createUserWithPasswordAndMetadata", () => {
    it("forwards app_metadata to Supabase createUser", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });

      await service.createUserWithPasswordAndMetadata(
        "admin@correo.com",
        "Password123!",
        { role: "ADMIN", nombreCompleto: "Admin" },
        { role: "ADMIN", colegioId: "colegio-uuid" },
      );

      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "admin@correo.com",
          user_metadata: { role: "ADMIN", nombreCompleto: "Admin" },
          app_metadata: { role: "ADMIN", colegioId: "colegio-uuid" },
        }),
      );
    });

    it("omits app_metadata when not provided", async () => {
      createUser.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });

      await service.createUserWithPasswordAndMetadata(
        "admin@correo.com",
        "Password123!",
      );

      expect(createUser).toHaveBeenCalledWith(
        expect.not.objectContaining({ app_metadata: expect.anything() }),
      );
    });
  });

  describe("updateUserAppMetadata", () => {
    it("calls updateUserById with the app_metadata", async () => {
      updateUserById.mockResolvedValue({
        error: null,
        data: { user: { id: "supabase-1" } },
      });

      await service.updateUserAppMetadata("supabase-1", {
        role: "TEACHER",
        colegioId: "colegio-uuid",
      });

      expect(updateUserById).toHaveBeenCalledWith("supabase-1", {
        app_metadata: { role: "TEACHER", colegioId: "colegio-uuid" },
      });
    });

    it("throws InternalServerErrorException on error", async () => {
      updateUserById.mockResolvedValue({
        error: { message: "User not found" },
        data: { user: null },
      });

      await expect(
        service.updateUserAppMetadata("supabase-1", { colegioId: "x" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("getRequiredConfig", () => {
    it("throws Error when SUPABASE_URL is missing", () => {
      const config = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            SUPABASE_ANON_KEY: "anon-key",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          };
          return values[key];
        }),
      } as unknown as ConfigService;

      const svc = new SupabaseService(config);
      expect(() => (svc as any).getRequiredConfig()).toThrow(
        "Supabase environment variables are required for auth operations.",
      );
    });

    it("throws Error when SUPABASE_ANON_KEY is missing", () => {
      const config = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
          };
          return values[key];
        }),
      } as unknown as ConfigService;

      const svc = new SupabaseService(config);
      expect(() => (svc as any).getRequiredConfig()).toThrow(
        "Supabase environment variables are required for auth operations.",
      );
    });

    it("throws Error when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
      const config = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_ANON_KEY: "anon-key",
          };
          return values[key];
        }),
      } as unknown as ConfigService;

      const svc = new SupabaseService(config);
      expect(() => (svc as any).getRequiredConfig()).toThrow(
        "Supabase environment variables are required for auth operations.",
      );
    });
  });
});