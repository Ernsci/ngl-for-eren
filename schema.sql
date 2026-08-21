-- Run this in the Supabase SQL editor.
-- RLS is intentionally disabled: this app is server-side only and
-- authenticates via the service_role key.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  admin_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  body text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_username on public.messages (username);