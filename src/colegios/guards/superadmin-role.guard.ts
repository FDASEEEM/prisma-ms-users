import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { SupabaseService } from "../../infrastructure/supabase/supabase.service";
import { UsersService } from "../../users/users.service";

@Injectable()
export class SuperAdminRoleGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { superAdminUser?: unknown }>();
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

    if (profile.role !== "SUPERADMIN") {
      throw new UnauthorizedException("SuperAdmin role required.");
    }

    request.superAdminUser = profile;
    return true;
  }
}
