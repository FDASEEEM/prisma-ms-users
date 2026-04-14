import { ConfigService } from "@nestjs/config";

const signInWithPassword = jest.fn();
const refreshSession = jest.fn();
const signOut = jest.fn();
const getUser = jest.fn();
const createUser = jest.fn();
const deleteUser = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        createUser,
        deleteUser,
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
    getOrThrow: jest.fn((key: string) => {
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

  it("maps login sessions", async () => {
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

  it("registers and then signs in", async () => {
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

  it("refreshes sessions", async () => {
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

  it("logs out using a scoped client", async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(service.logout("access-token")).resolves.toBeUndefined();
  });

  it("gets the authenticated user", async () => {
    getUser.mockResolvedValue({
      error: null,
      data: { user: { id: "supabase-1", email: "docente@correo.com" } },
    });

    await expect(service.getUser("access-token")).resolves.toEqual({
      id: "supabase-1",
      email: "docente@correo.com",
    });
  });
});
