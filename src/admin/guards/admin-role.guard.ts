import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { SupabaseService } from "../../infrastructure/supabase/supabase.service";
import { UsersService } from "../../users/users.service";

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { adminUser?: unknown }>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException("Authorization header is required.");
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("Invalid Authorization header.");
    }

    const supabaseUser = await this.supabaseService.getUser(token);
    const profile = await this.usersService.findBySupabaseUserId(supabaseUser.id);

    if (profile.role !== "ADMIN") {
      throw new UnauthorizedException("Admin role required.");
    }

    request.adminUser = profile;
    return true;
  }
}