import { getSession } from "./callback.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId = req.headers.cookie?.split(";").map((part: string) => part.trim()).find((part: string) => part.startsWith("gg_session_id="))?.slice("gg_session_id=".length);
  const session = sessionId ? getSession(decodeURIComponent(sessionId)) : null;

  if (!session) {
    res.status(200).json({ authenticated: false, provider: "gg" });
    return;
  }

  res.status(200).json({
    authenticated: true,
    provider: "gg",
    user: { id: session.userId, displayName: session.displayName },
    scopes: session.scopes,
    expiresAt: session.expiresAt
  });
}
