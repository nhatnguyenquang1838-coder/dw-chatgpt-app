import {
  assertServerOAuthConfig,
  buildAuthUrl,
  createPkcePair,
  createStateToken,
  isSafeReturnPath,
  serializeCookie,
  usesSecureCookies
} from "../../../src/auth-config.js";
import { storeOAuthState } from "../../../src/gg-oauth-store.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  try {
    const config = assertServerOAuthConfig();
    const state = createStateToken();
    const nonce = createStateToken();
    const { verifier, challenge } = createPkcePair();
    const returnTo = isSafeReturnPath(req.query?.returnTo) ? req.query.returnTo : "/";
    await storeOAuthState(state, returnTo);
    const secure = usesSecureCookies(config.appBaseUrl);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", [
      serializeCookie("gg_oauth_state", state, { maxAge: 600, secure }),
      serializeCookie("gg_oauth_verifier", verifier, { maxAge: 600, secure }),
      serializeCookie("gg_oauth_return_to", returnTo, { maxAge: 600, secure })
    ]);
    const authorizationUrl = buildAuthUrl(config, {
      state,
      codeChallenge: challenge,
      nonce,
      provider: typeof req.query?.provider === "string" ? req.query.provider : undefined
    });
    if (req.query?.mode === "json") {
      res.status(200).json({ authorizationUrl });
      return;
    }
    res.redirect(302, authorizationUrl);
  } catch (error) {
    console.error("GG OAuth authorize failed", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ error: "GG_OAUTH_NOT_CONFIGURED" });
  }
}
