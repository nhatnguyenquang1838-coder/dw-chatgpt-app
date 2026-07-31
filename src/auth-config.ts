import crypto from "node:crypto";

export type OAuthSessionState = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  providerUserId: string;
  workspaceId: string;
};

export type OAuthConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  revocationUrl?: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
  appBaseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export function getOAuthConfig(): OAuthConfig {
  const appBaseUrl = process.env.APP_BASE_URL?.trim() || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  return {
    authorizationUrl: process.env.GG_OAUTH_AUTHORIZATION_URL?.trim() || "https://supabase.com/auth/v1/authorize",
    tokenUrl: process.env.GG_OAUTH_TOKEN_URL?.trim() || "https://supabase.com/auth/v1/token",
    revocationUrl: process.env.GG_OAUTH_REVOCATION_URL?.trim(),
    clientId: process.env.GG_OAUTH_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
    clientSecret: process.env.GG_OAUTH_CLIENT_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    scopes: process.env.GG_OAUTH_SCOPES?.trim() || "openid email profile offline_access",
    redirectUri: process.env.GG_OAUTH_REDIRECT_URI?.trim() || `${appBaseUrl}/api/auth/gg/callback`,
    appBaseUrl,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim(),
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()
  };
}

export function createPkcePair() {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createStateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function isSafeReturnPath(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

export function buildAuthUrl(config: OAuthConfig, options: { state: string; codeChallenge: string; nonce?: string; provider?: string }) {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (options.nonce) url.searchParams.set("nonce", options.nonce);
  if (options.provider) url.searchParams.set("provider", options.provider);
  return url.toString();
}
