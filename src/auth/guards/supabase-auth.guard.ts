import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { SupabaseService } from "../../infrastructure/supabase/supabase.service";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException("Authorization header is required.");
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("Invalid Authorization header.");
    }

    request.user = await this.supabaseService.getUser(token);
    return true;
  }
}
