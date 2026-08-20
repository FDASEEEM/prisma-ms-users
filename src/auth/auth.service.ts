import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { AuditService } from "../infrastructure/audit/audit.service";
import {
  CognitoService,
  CognitoSessionResult,
} from "../infrastructure/cognito/cognito.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { UpdateMeDto } from "./dto/update-me.dto";

type AuthenticatedRequest = {
  user?: {
    id: string;
    email?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly cognitoService: CognitoService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto, ipOrigen?: string) {
    try {
      const existingUser = await this.usersService.findByEmail(dto.email);
      if (existingUser) {
        throw new ConflictException("El email ya está registrado.");
      }

      const cognitoResult = await this.cognitoService.createUserWithPasswordAndMetadata(
        dto.email,
        dto.password,
        {
          nombreCompleto: dto.nombreCompleto,
        },
        {
          role: "TEACHER",
          colegioId: dto.colegioId ?? "",
        },
      );

      if (!cognitoResult?.id) {
        throw new Error("Error creating user in Cognito");
      }

      const profile = await this.usersService.createProfile({
        supabaseUserId: cognitoResult.id,
        email: dto.email,
        rut: dto.rut,
        nombreCompleto: dto.nombreCompleto,
        establecimiento: dto.establecimiento,
        phone: dto.phone,
        specialty: dto.specialty,
        position: dto.position,
        active: true,
        role: "TEACHER",
        colegioId: dto.colegioId,
      } as any);

      await this.auditService.registrarEvento({
        tipoEvento: "register",
        userId: profile.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Registro de docente completado correctamente.",
      });

      return {
        access_token: "", // Front gets tokens from Cognito Hosted UI redirect
        refresh_token: "",
        token_type: "bearer",
        expires_in: 900,
        user: profile,
      };
    } catch (error) {
      await this.auditService.registrarEvento({
        tipoEvento: "register",
        userId: null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado en el registro.",
      });

      throw error;
    }
  }

  async login(dto: LoginDto, ipOrigen?: string) {
    try {
      const session = await this.cognitoService.login(dto.email, dto.password);

      const profile = await this.usersService.findBySupabaseUserId(session.user.id);

      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: profile.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Inicio de sesión exitoso.",
      });

      return {
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        token_type: session.tokenType,
        expires_in: session.expiresIn,
        user: profile,
      };
    } catch (error) {
      const user = await this.usersService.findByEmail(dto.email).catch(() => null);

      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: user?.id ?? null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado en el inicio de sesión.",
      });

      throw error;
    }
  }

  async refresh(dto: RefreshTokenDto, ipOrigen?: string) {
    try {
      const session = await this.cognitoService.refresh(dto.refreshToken);

      const profile = await this.usersService.findBySupabaseUserId(session.user.id);

      await this.auditService.registrarEvento({
        tipoEvento: "refresh",
        userId: profile.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Refresco de token ejecutado correctamente.",
      });

      return {
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        token_type: session.tokenType,
        expires_in: session.expiresIn,
        user: profile,
      };
    } catch (error) {
      await this.auditService.registrarEvento({
        tipoEvento: "refresh",
        userId: null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al refrescar la sesión.",
      });

      throw error;
    }
  }

  async getGoogleAuthUrl(redirectTo?: string) {
    if (!redirectTo || redirectTo.length === 0) {
      throw new BadRequestException("redirectTo is required.");
    }

    return this.cognitoService.getGoogleAuthUrl(redirectTo);
  }

  async exchangeGoogleCode(code: string, state: string, ipOrigen?: string) {
    try {
      const session = await this.cognitoService.exchangeGoogleCode(code, state);
      const profile = await this.provisionGoogleUser(session.user);

      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: profile.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Inicio de sesión con Google exitoso.",
      });

      return {
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        token_type: session.tokenType,
        expires_in: session.expiresIn,
        user: profile,
      };
    } catch (error) {
      await this.auditService.registrarEvento({
        tipoEvento: "login",
        userId: null,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al iniciar sesión con Google.",
      });

      throw error;
    }
  }

  async logout(authorization?: string, ipOrigen?: string) {
    const accessToken = this.getBearerToken(authorization);

    try {
      await this.cognitoService.logout(accessToken);

      const cognitoUser = await this.cognitoService.getUser(accessToken);
      const user = await this.usersService.findBySupabaseUserId(cognitoUser.id);

      await this.auditService.registrarEvento({
        tipoEvento: "logout",
        userId: user.id,
        ipOrigen,
        resultado: "success",
        mensaje: "Cierre de sesión ejecutado correctamente.",
      });

      return { message: "Sesión cerrada correctamente" };
    } catch (error) {
      const userId = await (async () => {
        try {
          const accessToken = this.getBearerToken(authorization);
          const cognitoUser = await this.cognitoService.getUser(accessToken);
          const user = await this.usersService.findBySupabaseUserId(cognitoUser.id);
          return user.id;
        } catch {
          return null;
        }
      })();

      await this.auditService.registrarEvento({
        tipoEvento: "logout",
        userId,
        ipOrigen,
        resultado: "failure",
        mensaje:
          error instanceof Error
            ? error.message
            : "Error inesperado al cerrar sesión.",
      });

      throw error;
    }
  }

  async me(request: AuthenticatedRequest) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.findById(userId);
  }

  async updateMe(
    request: AuthenticatedRequest,
    dto: UpdateMeDto,
    ipOrigen?: string,
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.updateProfile(userId, dto, ipOrigen);
  }

  private async provisionGoogleUser(googleUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
  }): Promise<User> {
    const email = googleUser.email ?? "";

    const existing = await this.usersService
      .findBySupabaseUserId(googleUser.id)
      .catch((error) => {
        if (error instanceof NotFoundException) {
          return null;
        }
        throw error;
      });

    if (existing) {
      return existing;
    }

    const byEmail = await this.usersService.findByEmail(email);

    if (byEmail) {
      return this.usersService.linkSupabaseUser(byEmail.id, googleUser.id);
    }

    const nombreCompleto =
      (googleUser.user_metadata?.full_name as string) ??
      (googleUser.user_metadata?.name as string) ??
      email;

    return this.usersService.createProfile({
      supabaseUserId: googleUser.id,
      email,
      nombreCompleto,
      role: "TEACHER",
      active: true,
    });
  }

  private getBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new BadRequestException("Authorization header is required.");
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new BadRequestException("Invalid Authorization header.");
    }

    return token;
  }
}
