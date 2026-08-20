import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { CognitoService } from "../../infrastructure/cognito/cognito.service";
import { UsersService } from "../../users/users.service";

@Injectable()
export class SuperAdminRoleGuard implements CanActivate {
  constructor(
    private readonly cognitoService: CognitoService,
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

    const payload = await this.cognitoService.verifyToken(token);

    const profile = await this.usersService.findBySupabaseUserId(payload.sub as string);

    if (profile.role !== "SUPERADMIN") {
      throw new UnauthorizedException("SuperAdmin role required.");
    }

    request.superAdminUser = profile;
    return true;
  }
}
