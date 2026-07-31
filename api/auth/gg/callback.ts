import { createClient } from "@supabase/supabase-js";
import { consumeState } from "./authorize.js";
import { getOAuthConfig, isSafeReturnPath } from "../../../src/auth-config.js";

const sessions = new Map<string, { userId: string; displayName: string; scopes: string[]; expiresAt: string }>();

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, state, error, error_description, next } = req.query ?? {};
  const returnTo = isSafeReturnPath(next as string | null) ? (next as string) : "/";

  if (error) {
    res.status(400).json({ error: String(error), error_description: String(error_description || "OAuth denied") });
    return;
  }

  if (typeof code !== "string" || typeof state !== "string") {
    res.status(400).json({ error: "Missing authorization code or state" });
    return;
  }

  const entry = consumeState(state);
  const cookieState = getCookieValue(req.headers.cookie, "gg_oauth_state");
  const verifier = getCookieValue(req.headers.cookie, "gg_oauth_verifier");
  if (!entry || cookieState !== state || !verifier) {
    res.status(400).json({ error: "Invalid or expired OAuth state" });
    return;
  }

  const config = getOAuthConfig();
  const supabase = createClient(config.supabaseUrl || "", config.supabaseAnonKey || "");
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data.session?.user) {
    res.status(400).json({ error: "Failed to exchange OAuth code" });
    return;
  }

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    userId: data.session.user.id,
    displayName: data.session.user.user_metadata?.full_name || data.session.user.email || "GG User",
    scopes: data.session.user.app_metadata?.provider ? [String(data.session.user.app_metadata.provider)] : [],
    expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : new Date(Date.now() + 3600 * 1000).toISOString()
  });

  res.setHeader("Set-Cookie", [
    `gg_session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    `gg_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `gg_oauth_verifier=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `gg_oauth_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  ]);

  const origin = config.appBaseUrl || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}`;
  res.redirect(303, `${origin}${returnTo}`);
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId) || null;
}
