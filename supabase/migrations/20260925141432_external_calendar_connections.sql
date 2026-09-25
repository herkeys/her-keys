-- Her Keys External Intelligence — Google Calendar service-only storage.
--
-- This is a BLUEPRINT, not an applied migration. When activation is authorized:
--   supabase migration new external_calendar_connections
-- then copy this SQL into the generated migration and run the normal hostile
-- migration/RLS verification before Staging. Do not invent a migration timestamp.
--
-- Both tables live in the exposed public schema only so Edge Functions can reach
-- them through PostgREST. They are deliberately NOT granted to anon/authenticated
-- and have no user policies. Only the server secret/service role may access them.

create table if not exists public.calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.calendar_oauth_states enable row level security;
revoke all on table public.calendar_oauth_states from anon, authenticated;
grant select, insert, update, delete on table public.calendar_oauth_states to service_role;

create table if not exists public.external_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'google'),
  provider_account_id text,
  scopes text[] not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  selected_calendar_ids text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'reauth_required', 'revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  unique (user_id, provider)
);

alter table public.external_calendar_connections enable row level security;
revoke all on table public.external_calendar_connections from anon, authenticated;
grant select, insert, update, delete on table public.external_calendar_connections to service_role;

create index if not exists external_calendar_connections_user_id_idx
  on public.external_calendar_connections (user_id);

create index if not exists calendar_oauth_states_expires_at_idx
  on public.calendar_oauth_states (expires_at);
