import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { SupabaseService } from "../../infrastructure/supabase/supabase.service";

describe("SupabaseAuthGuard", () => {
  const supabaseService = {
    getUser: jest.fn(),
  } as unknown as SupabaseService;

  const guard = new SupabaseAuthGuard(supabaseService);

  const createMockContext = (authorization?: string): ExecutionContext => {
    const request = {
      headers: { authorization },
      user: undefined as unknown,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects when Authorization header is missing", async () => {
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when Authorization header is empty string", async () => {
    const context = createMockContext("");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when Authorization scheme is not Bearer", async () => {
    const context = createMockContext("Basic abc123");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when scheme is bearer but token is missing", async () => {
    const context = createMockContext("Bearer");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when scheme is Bearer with empty token", async () => {
    const context = createMockContext("Bearer ");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts valid Bearer token and assigns user to request", async () => {
    const mockUser = { id: "supabase-1", email: "docente@correo.com" };
    (supabaseService.getUser as jest.Mock).mockResolvedValue(mockUser);

    const context = createMockContext("Bearer valid-access-token");
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(supabaseService.getUser).toHaveBeenCalledWith("valid-access-token");
  });

  it("throws when SupabaseService.getUser throws UnauthorizedException", async () => {
    (supabaseService.getUser as jest.Mock).mockRejectedValue(
      new UnauthorizedException("Invalid token"),
    );

    const context = createMockContext("Bearer invalid-token");

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts case-insensitive Bearer scheme", async () => {
    const mockUser = { id: "supabase-1" };
    (supabaseService.getUser as jest.Mock).mockResolvedValue(mockUser);

    const context = createMockContext("bearer valid-access-token");
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});