import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface SupabaseSessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

@Injectable()
export class SupabaseService {
  private adminClient?: SupabaseClient;
  private publicClient?: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  async register(
    email: string,
    password: string,
  ): Promise<SupabaseSessionResult> {
    const { adminClient, publicClient } = this.getClients();

    const createdUser = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createdUser.error || !createdUser.data.user) {
      throw new InternalServerErrorException(
        createdUser.error?.message ?? "Could not create Supabase user.",
      );
    }

    const login = await publicClient.auth.signInWithPassword({
      email,
      password,
    });

    if (login.error || !login.data.session || !login.data.user) {
      await this.deleteUser(createdUser.data.user.id);
      throw new InternalServerErrorException(
        login.error?.message ?? "Could not create login session.",
      );
    }

    return this.mapSession(
      login.data.session.access_token,
      login.data.session.refresh_token,
      login.data.session.token_type,
      login.data.session.expires_in,
      login.data.user,
    );
  }

  async login(email: string, password: string): Promise<SupabaseSessionResult> {
    const { publicClient } = this.getClients();
    const result = await publicClient.auth.signInWithPassword({
      email,
      password,
    });

    if (result.error || !result.data.session || !result.data.user) {
      throw new UnauthorizedException(
        result.error?.message ?? "Invalid credentials.",
      );
    }

    return this.mapSession(
      result.data.session.access_token,
      result.data.session.refresh_token,
      result.data.session.token_type,
      result.data.session.expires_in,
      result.data.user,
    );
  }

  async refresh(refreshToken: string): Promise<SupabaseSessionResult> {
    const { publicClient } = this.getClients();
    const result = await publicClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (result.error || !result.data.session || !result.data.user) {
      throw new UnauthorizedException(
        result.error?.message ?? "Invalid refresh token.",
      );
    }

    return this.mapSession(
      result.data.session.access_token,
      result.data.session.refresh_token,
      result.data.session.token_type,
      result.data.session.expires_in,
      result.data.user,
    );
  }

  async logout(accessToken: string): Promise<void> {
    const { supabaseUrl, anonKey } = this.getRequiredConfig();

    const scopedClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const result = await scopedClient.auth.signOut({ scope: "global" });

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }
  }

  async getUser(accessToken: string): Promise<User> {
    const { publicClient } = this.getClients();
    const result = await publicClient.auth.getUser(accessToken);

    if (result.error || !result.data.user) {
      throw new UnauthorizedException(
        result.error?.message ?? "Invalid access token.",
      );
    }

    return result.data.user;
  }

  async deleteUser(userId: string): Promise<void> {
    const { adminClient } = this.getClients();
    const result = await adminClient.auth.admin.deleteUser(userId);

    if (result.error) {
      throw new InternalServerErrorException(result.error.message);
    }
  }

  async createUserWithPassword(
    email: string,
    password: string,
  ): Promise<{ id: string }> {
    const { adminClient } = this.getClients();

    const createdUser = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createdUser.error || !createdUser.data.user) {
      throw new InternalServerErrorException(
        createdUser.error?.message ?? "Could not create Supabase user.",
      );
    }

    return { id: createdUser.data.user.id };
  }

  private mapSession(
    accessToken: string,
    refreshToken: string,
    tokenType: string,
    expiresIn: number,
    user: User,
  ): SupabaseSessionResult {
    return {
      accessToken,
      refreshToken,
      tokenType,
      expiresIn,
      user,
    };
  }

  private getClients(): {
    adminClient: SupabaseClient;
    publicClient: SupabaseClient;
  } {
    if (!this.publicClient || !this.adminClient) {
      const { supabaseUrl, anonKey, serviceRoleKey } = this.getRequiredConfig();

      this.publicClient ??= createClient(supabaseUrl, anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      this.adminClient ??= createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
    }

    return {
      adminClient: this.adminClient,
      publicClient: this.publicClient,
    };
  }

  private getRequiredConfig(): {
    supabaseUrl: string;
    anonKey: string;
    serviceRoleKey: string;
  } {
    const supabaseUrl = this.configService.get<string>("SUPABASE_URL");
    const anonKey = this.configService.get<string>("SUPABASE_ANON_KEY");
    const serviceRoleKey = this.configService.get<string>(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error(
        "Supabase environment variables are required for auth operations.",
      );
    }

    return { supabaseUrl, anonKey, serviceRoleKey };
  }
}
