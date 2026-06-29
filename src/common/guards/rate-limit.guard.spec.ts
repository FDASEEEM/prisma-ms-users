import { ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitGuard, RATE_LIMIT_KEY } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RateLimitGuard(reflector);
  });

  afterEach(() => {
    guard.cleanup();
  });

  const createMockContext = (colegioId?: string, ip?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          superAdminUser: colegioId ? { colegioId } : undefined,
          ip: ip || "127.0.0.1",
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  it("should allow request when no rate limit is configured", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it("should allow first request within limit", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 5,
      windowMs: 60000,
    });
    const context = createMockContext("colegio-1", "192.168.1.1");

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it("should allow multiple requests within limit", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 3,
      windowMs: 60000,
    });
    const context = createMockContext("colegio-1", "192.168.1.2");

    expect(await guard.canActivate(context)).toBe(true);
    expect(await guard.canActivate(context)).toBe(true);
    expect(await guard.canActivate(context)).toBe(true);
  });

  it("should block request when limit is exceeded", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 2,
      windowMs: 60000,
    });
    const context = createMockContext("colegio-1", "192.168.1.3");

    await guard.canActivate(context);
    await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it("should track requests per colegio and IP combination", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 1,
      windowMs: 60000,
    });

    const context1 = createMockContext("colegio-1", "192.168.1.4");
    const context2 = createMockContext("colegio-2", "192.168.1.4");

    expect(await guard.canActivate(context1)).toBe(true);
    expect(await guard.canActivate(context2)).toBe(true);

    await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(context2)).rejects.toThrow(HttpException);
  });

  it("should reset counter after window expires", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 1,
      windowMs: 100,
    });
    const context = createMockContext("colegio-1", "192.168.1.5");

    await guard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(await guard.canActivate(context)).toBe(true);
  });

  it("should cleanup expired entries", async () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue({
      limit: 1,
      windowMs: 100,
    });
    const context = createMockContext("colegio-1", "192.168.1.6");

    await guard.canActivate(context);
    await new Promise((resolve) => setTimeout(resolve, 150));

    guard.cleanup();

    expect(await guard.canActivate(context)).toBe(true);
  });
});
