import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

export interface SupabaseSessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SupabaseService {
  private adminClient?: SupabaseClient;
  private publicClient?: SupabaseClient;
  private readonly oauthChallenges = new Map<
    string,
    { codeVerifier: string; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {}

  async register(
    email: string,
    password: string,
    appMetadata?: Record<string, unknown>,
  ): Promise<SupabaseSessionResult> {
    const { adminClient, publicClient } = this.getClients();

    const createdUser = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Sembrar el tenant en app_metadata antes del sign-in para que el token
      // emitido ya lo lleve (server-only; lo leen perfil-alumno/docs del JWT).
      ...(appMetadata ? { app_metadata: appMetadata } : {}),
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
    return this.createUserWithPasswordAndMetadata(email, password);
  }

  async resetUserPassword(
    supabaseUserId: string,
    newPassword: string,
  ): Promise<void> {
    const { adminClient } = this.getClients();

    const result = await adminClient.auth.admin.updateUserById(supabaseUserId, {
      password: newPassword,
    });

    if (result.error || !result.data.user) {
      throw new InternalServerErrorException(
        result.error?.message ?? "Could not reset user password.",
      );
    }
  }

  async createUserWithPasswordAndMetadata(
    email: string,
    password: string,
    userMetadata?: Record<string, unknown>,
    appMetadata?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const { adminClient } = this.getClients();

    const createdUser = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      // app_metadata es server-only (solo con service-role): es la fuente
      // segura del tenant que los microservicios leen del JWT (perfil, docs).
      ...(appMetadata ? { app_metadata: appMetadata } : {}),
    });

    if (createdUser.error || !createdUser.data.user) {
      throw new InternalServerErrorException(
        createdUser.error?.message ?? "Could not create Supabase user.",
      );
    }

    return { id: createdUser.data.user.id };
  }

  /**
   * Sincroniza el app_metadata (colegioId, role) del usuario en Supabase.
   *
   * app_metadata es server-only (el usuario NO puede editarlo desde el SDK,
   * a diferencia de user_metadata): por eso es la fuente segura del tenant
   * para los microservicios que validan el JWT por JWKS (perfil-alumno, docs).
   * El nuevo valor solo viaja en tokens emitidos tras un nuevo login/refresh.
   */
  async updateUserAppMetadata(
    supabaseUserId: string,
    appMetadata: Record<string, unknown>,
  ): Promise<void> {
    const { adminClient } = this.getClients();

    const result = await adminClient.auth.admin.updateUserById(supabaseUserId, {
      app_metadata: appMetadata,
    });

    if (result.error || !result.data.user) {
      throw new InternalServerErrorException(
        result.error?.message ?? "Could not update user app_metadata.",
      );
    }
  }

  /**
   * Genera la URL de autorización de Google (flujo OAuth con PKCE).
   *
   * El `state` se usa como clave para guardar el `code_verifier` en memoria
   * (Map con TTL): cuando el browser vuelve al callback con `?code=...&state=...`,
   * exchangeGoogleCode() recupera el verifier por ese state.
   */
  async getGoogleAuthUrl(
    redirectTo: string,
  ): Promise<{ url: string; state: string }> {
    const { supabaseUrl } = this.getRequiredConfig();
    this.cleanupOauthChallenges();

    const state = randomBytes(16).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    this.oauthChallenges.set(state, {
      codeVerifier,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      provider: "google",
      redirect_to: redirectTo,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    return {
      url: `${supabaseUrl}/auth/v1/authorize?${params.toString()}`,
      state,
    };
  }

  /**
   * Intercambia el `code` devuelto por Supabase (tras el login de Google) por
   * una sesión, usando el `code_verifier` del PKCE guardado para ese `state`.
   */
  async exchangeGoogleCode(
    code: string,
    state: string,
  ): Promise<SupabaseSessionResult> {
    const { supabaseUrl, anonKey } = this.getRequiredConfig();

    const challenge = this.oauthChallenges.get(state);
    this.oauthChallenges.delete(state);

    if (!challenge || challenge.expiresAt < Date.now()) {
      throw new UnauthorizedException(
        "Invalid or expired OAuth state.",
      );
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({
        grant_type: "pkce",
        code,
        code_verifier: challenge.codeVerifier,
      }),
    });

    const data = (await response.json()) as Record<string, any>;

    if (!response.ok || !data.access_token || !data.user) {
      throw new UnauthorizedException(
        data.error_description ??
          data.error ??
          "Could not exchange Google OAuth code.",
      );
    }

    return this.mapSession(
      data.access_token,
      data.refresh_token,
      data.token_type ?? "bearer",
      data.expires_in ?? 3600,
      data.user,
    );
  }

  private cleanupOauthChallenges(): void {
    const now = Date.now();
    for (const [state, entry] of this.oauthChallenges) {
      if (entry.expiresAt < now) {
        this.oauthChallenges.delete(state);
      }
    }
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
