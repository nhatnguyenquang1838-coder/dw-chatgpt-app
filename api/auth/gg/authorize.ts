import { buildAuthUrl, createPkcePair, createStateToken, getOAuthConfig, isSafeReturnPath } from "../../../src/auth-config.js";

const stateStore = new Map<string, { verifier: string; returnTo: string; createdAt: number }>();

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const config = getOAuthConfig();
  const state = createStateToken();
  const { verifier, challenge } = createPkcePair();
  const returnTo = isSafeReturnPath(req.query?.returnTo as string | null) ? (req.query.returnTo as string) : "/";

  stateStore.set(state, { verifier, returnTo, createdAt: Date.now() });
  res.setHeader("Set-Cookie", [
    `gg_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `gg_oauth_verifier=${verifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `gg_oauth_return_to=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  ]);

  const authorizationUrl = buildAuthUrl(config, {
    state,
    codeChallenge: challenge,
    nonce: createStateToken(),
    provider: req.query?.provider === "supabase" ? "supabase" : undefined
  });

  if (req.query?.mode === "json") {
    res.status(200).json({ authorizationUrl });
    return;
  }

  res.redirect(302, authorizationUrl);
}

export function consumeState(state: string) {
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  return entry;
}
