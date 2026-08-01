import crypto from "node:crypto";

export type OAuthClientAuthMethod = "client_secret_basic" | "client_secret_post" | "none";

export type OAuthConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  revocationUrl?: string;
  userInfoUrl?: string;
  apiBaseUrl?: string;
  clientId: string;
  clientSecret?: string;
  clientAuthMethod: OAuthClientAuthMethod;
  scopes: string;
  redirectUri: string;
  appBaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  sessionSecret: string;
  tokenEncryptionKey: string;
  sessionCookieName: string;
  sessionMaxAgeSeconds: number;
};

function clean(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeUrl(value: string): string {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return candidate.replace(/\/$/, "");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientAuthMethod(value: string | undefined): OAuthClientAuthMethod {
  if (value === "client_secret_post" || value === "none") return value;
  return "client_secret_basic";
}

export function getOAuthConfig(): OAuthConfig {
  const supabaseUrl = clean(process.env.SUPABASE_URL) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "";
  const vercelUrl = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? clean(process.env.VERCEL_URL);
  const appBaseUrl = clean(process.env.APP_BASE_URL)
    ? normalizeUrl(clean(process.env.APP_BASE_URL)!)
    : vercelUrl
      ? normalizeUrl(vercelUrl)
      : "http://localhost:3000";

  return {
    authorizationUrl:
      clean(process.env.GG_OAUTH_AUTHORIZATION_URL) ??
      (supabaseUrl ? `${normalizeUrl(supabaseUrl)}/auth/v1/oauth/authorize` : ""),
    tokenUrl:
      clean(process.env.GG_OAUTH_TOKEN_URL) ??
      (supabaseUrl ? `${normalizeUrl(supabaseUrl)}/auth/v1/oauth/token` : ""),
    revocationUrl: clean(process.env.GG_OAUTH_REVOCATION_URL),
    userInfoUrl: clean(process.env.GG_OAUTH_USERINFO_URL),
    apiBaseUrl: clean(process.env.GG_API_URL)?.replace(/\/$/, ""),
    clientId: clean(process.env.GG_OAUTH_CLIENT_ID) ?? "",
    clientSecret: clean(process.env.GG_OAUTH_CLIENT_SECRET),
    clientAuthMethod: clientAuthMethod(clean(process.env.GG_OAUTH_CLIENT_AUTH_METHOD)),
    scopes: clean(process.env.GG_OAUTH_SCOPES) ?? "openid profile email offline_access",
    redirectUri: clean(process.env.GG_OAUTH_REDIRECT_URI) ?? `${appBaseUrl}/api/auth/gg/callback`,
    appBaseUrl,
    supabaseUrl: supabaseUrl ? normalizeUrl(supabaseUrl) : "",
    supabaseServiceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ?? "",
    sessionSecret: clean(process.env.SESSION_SECRET) ?? "",
    tokenEncryptionKey: clean(process.env.TOKEN_ENCRYPTION_KEY) ?? "",
    sessionCookieName: clean(process.env.GG_SESSION_COOKIE_NAME) ?? "gg_session_id",
    sessionMaxAgeSeconds: positiveInteger(clean(process.env.GG_SESSION_MAX_AGE_SECONDS), 30 * 24 * 60 * 60)
  };
}

export function assertServerOAuthConfig(config = getOAuthConfig()): OAuthConfig {
  const missing: string[] = [];
  if (!config.authorizationUrl) missing.push("GG_OAUTH_AUTHORIZATION_URL");
  if (!config.tokenUrl) missing.push("GG_OAUTH_TOKEN_URL");
  if (!config.clientId) missing.push("GG_OAUTH_CLIENT_ID");
  if (config.clientAuthMethod !== "none" && !config.clientSecret) missing.push("GG_OAUTH_CLIENT_SECRET");
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET(>=32 chars)");
  if (!config.tokenEncryptionKey) missing.push("TOKEN_ENCRYPTION_KEY");
  if (missing.length > 0) throw new Error(`GG_OAUTH_CONFIG_MISSING:${missing.join(",")}`);
  return config;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createStateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function isSafeReturnPath(value: string | null | undefined): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function buildAuthUrl(
  config: OAuthConfig,
  options: { state: string; codeChallenge: string; nonce?: string; provider?: string }
): string {
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

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean; sameSite?: "Lax" | "None"; httpOnly?: boolean }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", { maxAge: 0, secure, sameSite: "Lax" });
}

export function usesSecureCookies(appBaseUrl: string): boolean {
  return appBaseUrl.startsWith("https://");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
