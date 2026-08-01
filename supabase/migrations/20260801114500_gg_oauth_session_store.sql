create table if not exists public.gg_oauth_states (
  state_hash text primary key,
  return_to text not null default '/',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists gg_oauth_states_expires_at_idx
  on public.gg_oauth_states (expires_at);

create table if not exists public.gg_oauth_sessions (
  session_hash text primary key,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_type text not null default 'Bearer',
  access_token_expires_at timestamptz not null,
  session_expires_at timestamptz not null,
  provider_user_id text,
  display_name text,
  scopes text[] not null default '{}',
  workspace_id text not null default 'default',
  refresh_version integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gg_oauth_sessions_session_expires_at_idx
  on public.gg_oauth_sessions (session_expires_at)
  where revoked_at is null;

alter table public.gg_oauth_states enable row level security;
alter table public.gg_oauth_sessions enable row level security;

revoke all on table public.gg_oauth_states from anon, authenticated;
revoke all on table public.gg_oauth_sessions from anon, authenticated;

comment on table public.gg_oauth_states is
  'Single-use hashed OAuth state records for the DW ChatGPT GG authorization flow.';
comment on table public.gg_oauth_sessions is
  'Server-only GG OAuth sessions. Provider tokens are encrypted before persistence.';
