import { getSession } from "./callback.js";

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId = req.headers.cookie?.split(";").map((part: string) => part.trim()).find((part: string) => part.startsWith("gg_session_id="))?.slice("gg_session_id=".length);
  const session = sessionId ? getSession(decodeURIComponent(sessionId)) : null;

  if (session) {
    // Invalidate by clearing the cookie-backed session reference.
    // Provider revocation can be added once the final GG/Supabase revocation endpoint is confirmed.
  }

  res.setHeader("Set-Cookie", [
    "gg_session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  ]);

  res.status(200).json({ success: true });
}
