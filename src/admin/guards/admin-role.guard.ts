import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { CognitoService } from "../../infrastructure/cognito/cognito.service";
import { UsersService } from "../../users/users.service";

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(
    private readonly cognitoService: CognitoService,
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

    const payload = await this.cognitoService.verifyToken(token);

    const profile = await this.usersService.findByCognitoSub(payload.sub as string);

    if (profile.role !== "ADMIN" && profile.role !== "SUPERADMIN") {
      throw new ForbiddenException("Admin role required.");
    }

    request.adminUser = profile;
    return true;
  }
}
