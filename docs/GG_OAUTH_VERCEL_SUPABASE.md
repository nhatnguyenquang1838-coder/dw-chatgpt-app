# GG OAuth — Vercel and Supabase Wiring

## Target

- Vercel project: `dw-super-chatgpt-app-complete-v1`
- Vercel project ID: `prj_OY5gKUjORdSOwHfdGFGb7kDs7u1S`
- Vercel team: `DW1407` (`team_4mKlLmlLe2pWbK5F5e10zck1`)
- Repository baseline: `main@35353308862f6e7ad63db2a9a752a31f26cc3cae`

## What this wiring changes

The original OAuth implementation used process-local `Map` objects for state and sessions. Vercel Functions do not guarantee that a callback, session check, refresh, and logout execute in the same process. This change persists only hashed state/session identifiers in Supabase and encrypts provider tokens with AES-256-GCM before storage.

It also fixes these boundaries:

- `GG_OAUTH_CLIENT_ID` is no longer inferred from a Supabase anon key.
- `GG_OAUTH_CLIENT_SECRET` is no longer inferred from the Supabase service-role key.
- OAuth code exchange sends the PKCE `code_verifier` to the token endpoint.
- OAuth state is single-use and replay-resistant through an atomic Supabase delete.
- Refresh-token rotation uses an optimistic `refresh_version` fence.
- Logout clears encrypted credentials and records `revoked_at`.

## Supabase

Apply the repository migration:

```text
supabase/migrations/20260801114500_gg_oauth_session_store.sql
```

The migration creates:

- `public.gg_oauth_states`
- `public.gg_oauth_sessions`

Both tables have RLS enabled and grant no access to `anon` or `authenticated`. Runtime access must use `SUPABASE_SERVICE_ROLE_KEY` from a server-side Vercel Function only.

Do not reuse the Rental Home production database unless that database is explicitly approved as the identity/session store for this app. Prefer a dedicated Supabase project or a reviewed shared platform project.

## Vercel environment variables

Configure the values from `.env.example` separately for Preview and Production. At minimum:

- `APP_BASE_URL`
- `GG_OAUTH_CLIENT_ID`
- `GG_OAUTH_CLIENT_SECRET` when the client is confidential
- `GG_OAUTH_CLIENT_AUTH_METHOD`
- `GG_OAUTH_AUTHORIZATION_URL`
- `GG_OAUTH_TOKEN_URL`
- `GG_OAUTH_REDIRECT_URI`
- `GG_OAUTH_SCOPES`
- `GG_API_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`

Generate `SESSION_SECRET` with at least 32 random bytes. Generate `TOKEN_ENCRYPTION_KEY` as exactly 32 random bytes encoded as base64 or as 64 hexadecimal characters.

## OAuth provider registration

Register the exact production callback:

```text
https://dw-super-chatgpt-app-complete-v1-dw1407.vercel.app/api/auth/gg/callback
```

Register preview callbacks separately. Do not use a wildcard callback unless the provider supports a reviewed, constrained wildcard policy.

## Verification

1. `GET /api/auth/gg/authorize?mode=json` returns an authorization URL and three secure state cookies.
2. The authorization URL includes `state`, `code_challenge`, and `code_challenge_method=S256`.
3. A valid callback creates one row in `gg_oauth_sessions` and deletes the matching `gg_oauth_states` row.
4. Replaying the same callback returns `GG_OAUTH_STATE_EXPIRED_OR_REPLAYED`.
5. `GET /api/auth/gg/session` returns metadata only; it never returns provider tokens.
6. Expired access tokens refresh once and increment `refresh_version`.
7. `POST /api/auth/gg/logout` revokes or clears the session and expires the cookie.

## Remaining architecture boundary

The browser cookie session and the MCP request session are different security contexts. This patch makes the Vercel/Supabase OAuth routes durable, but it does not silently bind a browser cookie to MCP tool calls. A follow-up must use a reviewed MCP authorization mechanism or an explicit one-time session-link protocol. Do not restore global process maps or expose provider tokens to the widget to bridge this gap.
