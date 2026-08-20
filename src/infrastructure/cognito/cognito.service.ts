import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import * as jose from "jose";

export interface CognitoSessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email?: string; user_metadata?: Record<string, any> };
}

@Injectable()
export class CognitoService {
  private readonly client: CognitoIdentityProviderClient;
  private readonly userPoolId: string;
  private readonly clientId: string;
  private readonly region: string;
  private jwks?: jose.RemoteJWKSet;
  private readonly issuer: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>("COGNITO_REGION") || "us-east-1";
    this.userPoolId = this.configService.get<string>("COGNITO_USER_POOL_ID") || "";
    this.clientId = this.configService.get<string>("COGNITO_CLIENT_ID") || "";

    this.client = new CognitoIdentityProviderClient({ region: this.region });
    this.issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
  }

  // ─── Google OAuth via Cognito Hosted UI ────────────────────────

  getGoogleAuthUrl(redirectTo: string): { url: string; state: string } {
    this.getRequiredConfig();

    const state = Buffer.from(JSON.stringify({ redirectTo })).toString("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectTo,
      scope: "openid email profile",
      identity_provider: "Google",
      state,
    });

    return {
      url: `${this.issuer}/oauth2/authorize?${params.toString()}`,
      state,
    };
  }

  async exchangeGoogleCode(
    code: string,
    state: string,
  ): Promise<CognitoSessionResult> {
    this.getRequiredConfig();

    const redirectUri = JSON.parse(
      Buffer.from(state, "base64url").toString(),
    ).redirectTo;

    const command = new AdminInitiateAuthCommand({
      UserPoolId: this.userPoolId,
      ClientId: this.clientId,
      AuthFlow: "USER_SRP_AUTH",
      AuthParameters: {
        USERNAME: code,
        SRP_A: "",
      },
    });

    // For Google OAuth, Cognito redirects with tokens directly.
    // The BFF should handle the Hosted UI callback which returns tokens in the URL fragment.
    // This method is called when the BFF exchanges the authorization code.
    const tokenResponse = await fetch(
      `${this.issuer}/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          code,
          redirect_uri: redirectUri,
        }).toString(),
      },
    );

    const tokenData = (await tokenResponse.json()) as Record<string, any>;

    if (!tokenResponse.ok || !tokenData.id_token) {
      throw new UnauthorizedException(
        tokenData.error_description ?? tokenData.error ?? "Could not exchange code.",
      );
    }

    const payload = await this.verifyToken(tokenData.id_token);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: "bearer",
      expiresIn: tokenData.expires_in ?? 3600,
      user: {
        id: payload.sub!,
        email: payload.email as string,
        user_metadata: {
          full_name: (payload as any).name as string,
          picture: (payload as any).picture as string,
        },
      },
    };
  }

  // ─── Email/Password via Cognito ────────────────────────────────

  async register(
    email: string,
    password: string,
    userMetadata?: Record<string, string>,
    appMetadata?: Record<string, string>,
  ): Promise<{ id: string }> {
    this.getRequiredConfig();

    const command = new AdminCreateUserCommand({
      UserPoolId: this.userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        ...(userMetadata
          ? Object.entries(userMetadata).map(([k, v]) => ({
              Name: `custom:${k}`,
              Value: v,
            }))
          : []),
      ],
      MessageAction: "SUPPRESS",
    });

    const result = await this.client.send(command);
    const sub = result.User?.Attributes?.find((a) => a.Name === "sub")?.Value;

    if (!sub) {
      throw new Error("Could not get user sub from Cognito.");
    }

    // Set permanent password
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: this.userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    });
    await this.client.send(setPasswordCommand);

    // Set app_metadata (role, colegioId) via custom attributes
    if (appMetadata && Object.keys(appMetadata).length > 0) {
      await this.updateUserAppMetadata(sub, appMetadata);
    }

    return { id: sub };
  }

  async login(
    email: string,
    password: string,
  ): Promise<CognitoSessionResult> {
    this.getRequiredConfig();

    const command = new AdminInitiateAuthCommand({
      UserPoolId: this.userPoolId,
      ClientId: this.clientId,
      AuthFlow: "ADMIN_NO_SRP_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const result = await this.client.send(command);

    if (!result.AuthenticationResult?.IdToken) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const payload = await this.verifyToken(result.AuthenticationResult.IdToken);

    return {
      accessToken: result.AuthenticationResult.AccessToken!,
      refreshToken: result.AuthenticationResult.RefreshToken!,
      tokenType: "bearer",
      expiresIn: result.AuthenticationResult.ExpiresIn ?? 3600,
      user: {
        id: payload.sub!,
        email: payload.email as string,
        user_metadata: {
          full_name: (payload as any).name as string,
        },
      },
    };
  }

  async refresh(refreshToken: string): Promise<CognitoSessionResult> {
    this.getRequiredConfig();

    // Cognito doesn't have a direct admin refresh via SDK; use the token endpoint
    const command = new AdminInitiateAuthCommand({
      UserPoolId: this.userPoolId,
      ClientId: this.clientId,
      AuthFlow: "REFRESH_TOKEN_AUTH",
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const result = await this.client.send(command);

    if (!result.AuthenticationResult?.IdToken) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const payload = await this.verifyToken(result.AuthenticationResult.IdToken);

    return {
      accessToken: result.AuthenticationResult.AccessToken!,
      refreshToken: result.AuthenticationResult.RefreshToken ?? refreshToken,
      tokenType: "bearer",
      expiresIn: result.AuthenticationResult.ExpiresIn ?? 3600,
      user: {
        id: payload.sub!,
        email: payload.email as string,
      },
    };
  }

  async logout(accessToken: string): Promise<void> {
    const command = new GlobalSignOutCommand({ AccessToken: accessToken });
    await this.client.send(command);
  }

  async getUser(accessToken: string): Promise<{ id: string; email?: string }> {
    const payload = await this.verifyToken(accessToken);
    return {
      id: payload.sub!,
      email: payload.email as string,
    };
  }

  // ─── User Management (Admin) ──────────────────────────────────

  async createUserWithPasswordAndMetadata(
    email: string,
    password: string,
    userMetadata?: Record<string, string>,
    appMetadata?: Record<string, string>,
  ): Promise<{ id: string }> {
    return this.register(email, password, userMetadata, appMetadata);
  }

  async deleteUser(sub: string): Promise<void> {
    this.getRequiredConfig();
    const command = new AdminDeleteUserCommand({
      UserPoolId: this.userPoolId,
      Username: sub,
    });
    await this.client.send(command);
  }

  async resetUserPassword(sub: string, newPassword: string): Promise<void> {
    this.getRequiredConfig();
    const command = new AdminSetUserPasswordCommand({
      UserPoolId: this.userPoolId,
      Username: sub,
      Password: newPassword,
      Permanent: true,
    });
    await this.client.send(command);
  }

  async updateUserAppMetadata(
    sub: string,
    attributes: Record<string, string | null>,
  ): Promise<void> {
    this.getRequiredConfig();

    const userAttributes = Object.entries(attributes).map(([key, value]) => ({
      Name: `custom:${key}`,
      Value: value ?? "",
    }));

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: this.userPoolId,
      Username: sub,
      UserAttributes: userAttributes,
    });
    await this.client.send(command);
  }

  // ─── JWT Verification via JWKS ────────────────────────────────

  async verifyToken(token: string): Promise<jose.JWTPayload> {
    try {
      const jwks = await this.getJwks();
      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer: this.issuer,
      });
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }

  private async getJwks(): Promise<jose.RemoteJWKSet> {
    if (!this.jwks) {
      this.jwks = jose.createRemoteJWKSet(
        new URL(`${this.issuer}/.well-known/jwks.json`),
      );
    }
    return this.jwks;
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private getRequiredConfig(): void {
    if (!this.userPoolId || !this.clientId) {
      throw new Error(
        "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required.",
      );
    }
  }
}
