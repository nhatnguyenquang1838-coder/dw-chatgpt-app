import {
  assertServerOAuthConfig,
  clearCookie,
  constantTimeEqual,
  readCookie,
  serializeCookie,
  usesSecureCookies
} from "../../../src/auth-config.js";
import {
  consumeOAuthState,
  createOAuthSession,
  exchangeAuthorizationCode
} from "../../../src/gg-oauth-store.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const { code, state, error } = req.query ?? {};
  if (error) {
    res.status(400).json({ error: "GG_OAUTH_DENIED" });
    return;
  }
  if (typeof code !== "string" || typeof state !== "string") {
    res.status(400).json({ error: "GG_OAUTH_CALLBACK_INVALID" });
    return;
  }
  try {
    const config = assertServerOAuthConfig();
    const cookieState = readCookie(req.headers.cookie, "gg_oauth_state");
    const verifier = readCookie(req.headers.cookie, "gg_oauth_verifier");
    if (!cookieState || !verifier || !constantTimeEqual(cookieState, state)) {
      res.status(400).json({ error: "GG_OAUTH_STATE_INVALID" });
      return;
    }
    const storedState = await consumeOAuthState(state);
    if (!storedState) {
      res.status(400).json({ error: "GG_OAUTH_STATE_EXPIRED_OR_REPLAYED" });
      return;
    }
    const tokens = await exchangeAuthorizationCode(code, verifier);
    const session = await createOAuthSession(tokens);
    const secure = usesSecureCookies(config.appBaseUrl);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", [
      serializeCookie(config.sessionCookieName, session.sessionId, {
        maxAge: config.sessionMaxAgeSeconds,
        secure
      }),
      clearCookie("gg_oauth_state", secure),
      clearCookie("gg_oauth_verifier", secure),
      clearCookie("gg_oauth_return_to", secure)
    ]);
    res.redirect(303, new URL(storedState.returnTo, config.appBaseUrl).toString());
  } catch {
    console.error("GG OAuth callback failed", "GG_OAUTH_EXCHANGE_FAILED");
    res.status(502).json({ error: "GG_OAUTH_EXCHANGE_FAILED" });
  }
}
