import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly requestCounts = new Map<string, { count: number; resetTime: number }>();

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitConfig = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rateLimitConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const colegioId = request.superAdminUser?.colegioId || request.adminUser?.colegioId || "global";
    const key = `${colegioId}:${request.ip || "unknown"}`;

    const now = Date.now();
    const current = this.requestCounts.get(key);

    if (!current || now > current.resetTime) {
      this.requestCounts.set(key, {
        count: 1,
        resetTime: now + rateLimitConfig.windowMs,
      });
      return true;
    }

    if (current.count >= rateLimitConfig.limit) {
      const retryAfter = Math.ceil((current.resetTime - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Demasiadas peticiones. Intente nuevamente más tarde.",
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count++;
    return true;
  }

  // Método para limpiar el mapa periódicamente (opcional)
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.requestCounts.entries()) {
      if (now > value.resetTime) {
        this.requestCounts.delete(key);
      }
    }
  }
}
