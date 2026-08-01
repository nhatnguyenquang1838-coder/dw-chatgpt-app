import crypto from "node:crypto";
import { assertServerOAuthConfig, getOAuthConfig, type OAuthConfig } from "./auth-config.js";

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
  idToken?: string;
  providerUserId?: string;
  displayName?: string;
};

type SessionRow = {
  session_hash: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_type: string;
  access_token_expires_at: string;
  session_expires_at: string;
  provider_user_id: string | null;
  display_name: string | null;
  scopes: string[] | null;
  workspace_id: string | null;
  refresh_version: number;
  revoked_at: string | null;
};

export type OAuthSession = {
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  accessTokenExpiresAt: Date;
  sessionExpiresAt: Date;
  providerUserId?: string;
  displayName: string;
  scopes: string[];
  workspaceId: string;
  refreshVersion: number;
};

const STATE_TABLE = "gg_oauth_states";
const SESSION_TABLE = "gg_oauth_sessions";

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function hashValue(value: string, config: OAuthConfig): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

function encryptionKey(config: OAuthConfig): Buffer {
  const raw = config.tokenEncryptionKey;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  throw new Error("TOKEN_ENCRYPTION_KEY_INVALID:expected 32-byte base64 or 64-char hex");
}

export function encryptSecret(value: string, config = assertServerOAuthConfig()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(config), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${base64Url(iv)}.${base64Url(tag)}.${base64Url(ciphertext)}`;
}

export function decryptSecret(value: string, config = assertServerOAuthConfig()): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("TOKEN_CIPHERTEXT_INVALID");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(config), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

async function supabaseRequest<T>(
  resource: string,
  init: RequestInit & { prefer?: string } = {},
  config = assertServerOAuthConfig()
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("apikey", config.supabaseServiceRoleKey);
  headers.set("Authorization", `Bearer ${config.supabaseServiceRoleKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.prefer) headers.set("Prefer", init.prefer);
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${resource}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SUPABASE_STORE_ERROR:${response.status}:${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function storeOAuthState(state: string, returnTo: string): Promise<void> {
  const config = assertServerOAuthConfig();
  await supabaseRequest(STATE_TABLE, {
    method: "POST",
    prefer: "return=minimal,resolution=merge-duplicates",
    body: JSON.stringify({
      state_hash: hashValue(state, config),
      return_to: returnTo,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
  }, config);
}

export async function consumeOAuthState(state: string): Promise<{ returnTo: string } | null> {
  const config = assertServerOAuthConfig();
  const query = new URLSearchParams({
    state_hash: `eq.${hashValue(state, config)}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: "return_to"
  });
  const rows = await supabaseRequest<Array<{ return_to: string }>>(`${STATE_TABLE}?${query}`, {
    method: "DELETE",
    prefer: "return=representation"
  }, config);
  return rows[0] ? { returnTo: rows[0].return_to } : null;
}

function tokenRequestHeaders(config: OAuthConfig): Headers {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded"
  });
  if (config.clientAuthMethod === "client_secret_basic") {
    headers.set("Authorization", `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret ?? ""}`).toString("base64")}`);
  }
  return headers;
}

function addClientCredentials(body: URLSearchParams, config: OAuthConfig): void {
  if (config.clientAuthMethod === "none") body.set("client_id", config.clientId);
  if (config.clientAuthMethod === "client_secret_post") {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret ?? "");
  }
}

function parseScopes(value: unknown, fallback: string): string[] {
  const raw = typeof value === "string" && value.trim() ? value : fallback;
  return raw.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
}

function jwtClaims(idToken: unknown): Record<string, unknown> {
  if (typeof idToken !== "string") return {};
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function userInfo(accessToken: string, config: OAuthConfig): Promise<Record<string, unknown>> {
  if (!config.userInfoUrl) return {};
  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!response.ok) return {};
  return await response.json() as Record<string, unknown>;
}

async function parseTokenResponse(response: Response, config: OAuthConfig): Promise<OAuthTokenSet> {
  const text = await response.text();
  if (!response.ok) throw new Error(`GG_TOKEN_ENDPOINT_ERROR:${response.status}:${text.slice(0, 300)}`);
  const payload = JSON.parse(text) as Record<string, unknown>;
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("GG_TOKEN_RESPONSE_INVALID");
  const claims = jwtClaims(payload.id_token);
  const info = await userInfo(payload.access_token, config);
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in ?? 3600);
  const providerUserId = [info.sub, info.id, payload.user_id, claims.sub].find((value) => typeof value === "string") as string | undefined;
  const displayName = [info.name, info.preferred_username, info.email, claims.name, claims.email]
    .find((value) => typeof value === "string") as string | undefined;
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    expiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000),
    scopes: parseScopes(payload.scope, config.scopes),
    idToken: typeof payload.id_token === "string" ? payload.id_token : undefined,
    providerUserId,
    displayName
  };
}

export async function exchangeAuthorizationCode(code: string, verifier: string): Promise<OAuthTokenSet> {
  const config = assertServerOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier
  });
  addClientCredentials(body, config);
  return parseTokenResponse(await fetch(config.tokenUrl, {
    method: "POST",
    headers: tokenRequestHeaders(config),
    body
  }), config);
}

async function refreshTokens(refreshToken: string): Promise<OAuthTokenSet> {
  const config = assertServerOAuthConfig();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  addClientCredentials(body, config);
  return parseTokenResponse(await fetch(config.tokenUrl, {
    method: "POST",
    headers: tokenRequestHeaders(config),
    body
  }), config);
}

function sessionFromRow(sessionId: string, row: SessionRow, config: OAuthConfig): OAuthSession | null {
  if (row.revoked_at || !row.access_token_ciphertext) return null;
  const sessionExpiresAt = new Date(row.session_expires_at);
  if (sessionExpiresAt.getTime() <= Date.now()) return null;
  return {
    sessionId,
    accessToken: decryptSecret(row.access_token_ciphertext, config),
    refreshToken: row.refresh_token_ciphertext ? decryptSecret(row.refresh_token_ciphertext, config) : undefined,
    tokenType: row.token_type,
    accessTokenExpiresAt: new Date(row.access_token_expires_at),
    sessionExpiresAt,
    providerUserId: row.provider_user_id ?? undefined,
    displayName: row.display_name ?? "GG User",
    scopes: row.scopes ?? [],
    workspaceId: row.workspace_id ?? "default",
    refreshVersion: row.refresh_version ?? 0
  };
}

async function readSessionRow(sessionId: string, config: OAuthConfig): Promise<SessionRow | null> {
  const query = new URLSearchParams({
    session_hash: `eq.${hashValue(sessionId, config)}`,
    select: "*",
    limit: "1"
  });
  const rows = await supabaseRequest<SessionRow[]>(`${SESSION_TABLE}?${query}`, { method: "GET" }, config);
  return rows[0] ?? null;
}

export async function createOAuthSession(tokens: OAuthTokenSet): Promise<OAuthSession> {
  const config = assertServerOAuthConfig();
  const sessionId = crypto.randomBytes(32).toString("base64url");
  const sessionExpiresAt = new Date(Date.now() + config.sessionMaxAgeSeconds * 1000);
  const row = {
    session_hash: hashValue(sessionId, config),
    access_token_ciphertext: encryptSecret(tokens.accessToken, config),
    refresh_token_ciphertext: tokens.refreshToken ? encryptSecret(tokens.refreshToken, config) : null,
    token_type: tokens.tokenType,
    access_token_expires_at: tokens.expiresAt.toISOString(),
    session_expires_at: sessionExpiresAt.toISOString(),
    provider_user_id: tokens.providerUserId ?? null,
    display_name: tokens.displayName ?? "GG User",
    scopes: tokens.scopes,
    workspace_id: "default",
    refresh_version: 0,
    revoked_at: null,
    updated_at: new Date().toISOString()
  };
  await supabaseRequest(SESSION_TABLE, {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify(row)
  }, config);
  return {
    sessionId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    accessTokenExpiresAt: tokens.expiresAt,
    sessionExpiresAt,
    providerUserId: tokens.providerUserId,
    displayName: tokens.displayName ?? "GG User",
    scopes: tokens.scopes,
    workspaceId: "default",
    refreshVersion: 0
  };
}

async function refreshSession(session: OAuthSession, config: OAuthConfig): Promise<OAuthSession | null> {
  if (!session.refreshToken) return null;
  let tokens: OAuthTokenSet;
  try {
    tokens = await refreshTokens(session.refreshToken);
  } catch (error) {
    const latest = await readSessionRow(session.sessionId, config);
    if (latest && latest.refresh_version !== session.refreshVersion) return sessionFromRow(session.sessionId, latest, config);
    await revokeOAuthSession(session.sessionId, false);
    throw error;
  }
  const nextRefreshToken = tokens.refreshToken ?? session.refreshToken;
  const query = new URLSearchParams({
    session_hash: `eq.${hashValue(session.sessionId, config)}`,
    refresh_version: `eq.${session.refreshVersion}`,
    select: "*"
  });
  const rows = await supabaseRequest<SessionRow[]>(`${SESSION_TABLE}?${query}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({
      access_token_ciphertext: encryptSecret(tokens.accessToken, config),
      refresh_token_ciphertext: encryptSecret(nextRefreshToken, config),
      token_type: tokens.tokenType,
      access_token_expires_at: tokens.expiresAt.toISOString(),
      scopes: tokens.scopes,
      refresh_version: session.refreshVersion + 1,
      updated_at: new Date().toISOString()
    })
  }, config);
  if (rows[0]) return sessionFromRow(session.sessionId, rows[0], config);
  const latest = await readSessionRow(session.sessionId, config);
  return latest ? sessionFromRow(session.sessionId, latest, config) : null;
}

export async function getOAuthSession(sessionId: string, refresh = true): Promise<OAuthSession | null> {
  const config = assertServerOAuthConfig();
  const row = await readSessionRow(sessionId, config);
  const session = row ? sessionFromRow(sessionId, row, config) : null;
  if (!session) return null;
  if (refresh && session.accessTokenExpiresAt.getTime() <= Date.now() + 60_000) {
    return refreshSession(session, config);
  }
  return session;
}

export async function getOAuthSessionStatus(sessionId: string): Promise<{
  authenticated: boolean;
  user?: { id?: string; displayName: string };
  scopes?: string[];
  expiresAt?: string;
  reason?: string;
}> {
  try {
    const session = await getOAuthSession(sessionId, true);
    if (!session) return { authenticated: false, reason: "missing_or_expired" };
    return {
      authenticated: true,
      user: { id: session.providerUserId, displayName: session.displayName },
      scopes: session.scopes,
      expiresAt: session.accessTokenExpiresAt.toISOString()
    };
  } catch {
    return { authenticated: false, reason: "refresh_failed" };
  }
}

async function revokeAtProvider(token: string, config: OAuthConfig): Promise<void> {
  if (!config.revocationUrl) return;
  const body = new URLSearchParams({ token });
  addClientCredentials(body, config);
  await fetch(config.revocationUrl, {
    method: "POST",
    headers: tokenRequestHeaders(config),
    body
  }).catch(() => undefined);
}

export async function revokeOAuthSession(sessionId: string, revokeProvider = true): Promise<void> {
  const config = assertServerOAuthConfig();
  const row = await readSessionRow(sessionId, config);
  if (row && revokeProvider) {
    const token = row.refresh_token_ciphertext ?? row.access_token_ciphertext;
    if (token) await revokeAtProvider(decryptSecret(token, config), config);
  }
  const query = new URLSearchParams({ session_hash: `eq.${hashValue(sessionId, config)}` });
  await supabaseRequest(`${SESSION_TABLE}?${query}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }, config);
}

export async function callGG(
  sessionId: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const config = getOAuthConfig();
  if (!config.apiBaseUrl) throw new Error("GG_API_URL_MISSING");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("GG_API_PATH_INVALID");
  const session = await getOAuthSession(sessionId, true);
  if (!session) throw new Error("GG_AUTH_MISSING");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `${session.tokenType} ${session.accessToken}`);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  return fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
}
