import { clearCookie, getOAuthConfig, readCookie, usesSecureCookies } from "../../../src/auth-config.js";
import { revokeOAuthSession } from "../../../src/gg-oauth-store.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const config = getOAuthConfig();
  const sessionId = readCookie(req.headers.cookie, config.sessionCookieName);
  if (sessionId) {
    await revokeOAuthSession(sessionId).catch((error) => {
      console.warn("GG OAuth logout revocation failed", error instanceof Error ? error.message : "unknown");
    });
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", clearCookie(config.sessionCookieName, usesSecureCookies(config.appBaseUrl)));
  res.status(200).json({ success: true });
}
