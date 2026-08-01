import { getOAuthConfig, readCookie } from "../../../src/auth-config.js";
import { getOAuthSessionStatus } from "../../../src/gg-oauth-store.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const config = getOAuthConfig();
  const sessionId = readCookie(req.headers.cookie, config.sessionCookieName);
  if (!sessionId) {
    res.status(200).json({ authenticated: false, provider: "gg", reason: "missing" });
    return;
  }
  const status = await getOAuthSessionStatus(sessionId);
  res.status(200).json({ provider: "gg", ...status });
}
