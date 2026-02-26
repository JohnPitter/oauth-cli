import { randomBytes, createHash } from "node:crypto";
import type { OAuthProviderConfig } from "./providers.js";

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(
  provider: OAuthProviderConfig,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    ...provider.extraParams,
  });
  return `${provider.authorizationUrl}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export async function exchangeCode(
  provider: OAuthProviderConfig,
  code: string,
  codeVerifier: string,
  opts?: { redirectUri?: string; state?: string },
): Promise<TokenResponse> {
  // Clean code — remove hash fragments or extra params that may be appended
  const cleanCode = code.split("#")[0].split("&")[0];

  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code: cleanCode,
    redirect_uri: opts?.redirectUri ?? provider.redirectUri,
    client_id: provider.clientId,
    code_verifier: codeVerifier,
    ...(provider.clientSecret ? { client_secret: provider.clientSecret } : {}),
    ...(opts?.state ? { state: opts.state } : {}),
  };

  const useJson = provider.tokenContentType === "json";

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": useJson ? "application/json" : "application/x-www-form-urlencoded",
      ...(useJson ? { Accept: "application/json", Referer: "https://claude.ai/", Origin: "https://claude.ai" } : {}),
    },
    body: useJson ? JSON.stringify(params) : new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    idToken: data.id_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
    tokenType: data.token_type as string | undefined,
    scope: data.scope as string | undefined,
  };
}
