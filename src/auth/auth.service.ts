import { BadRequestException, Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
import {
  SupabaseSessionResult,
  SupabaseService,
} from "../infrastructure/supabase/supabase.service";
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
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto) {
    const session = await this.supabaseService.register(
      dto.email,
      dto.password,
    );

    try {
      const profile = await this.usersService.createProfile({
        supabaseUserId: session.user.id,
        email: dto.email,
        rut: dto.rut,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        specialty: dto.specialty,
        position: dto.position,
        active: true,
      });

      return this.mapSession(session, profile);
    } catch (error) {
      await this.supabaseService.deleteUser(session.user.id);
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const session = await this.supabaseService.login(dto.email, dto.password);
    return this.mapSession(session);
  }

  async refresh(dto: RefreshTokenDto) {
    const session = await this.supabaseService.refresh(dto.refreshToken);
    return this.mapSession(session);
  }

  async logout(authorization?: string) {
    const accessToken = this.getBearerToken(authorization);
    await this.supabaseService.logout(accessToken);

    return { message: "Sesión cerrada correctamente" };
  }

  async me(request: AuthenticatedRequest) {
    const supabaseUserId = request.user?.id;

    if (!supabaseUserId) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.findBySupabaseUserId(supabaseUserId);
  }

  async updateMe(request: AuthenticatedRequest, dto: UpdateMeDto) {
    const supabaseUserId = request.user?.id;

    if (!supabaseUserId) {
      throw new BadRequestException("Authenticated user not found.");
    }

    return this.usersService.updateProfile(supabaseUserId, dto);
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

  private mapSession(session: SupabaseSessionResult, profile?: User) {
    return {
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      token_type: session.tokenType,
      expires_in: session.expiresIn,
      user: profile ?? session.user,
    };
  }
}
