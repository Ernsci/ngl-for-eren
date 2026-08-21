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

alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists bio text;

-- account fields (email + password)
alter table public.users add column if not exists email text;
alter table public.users add column if not exists password_hash text;
create unique index if not exists idx_users_email on public.users (email) where email is not null;

-- read/unread for notifications
alter table public.messages add column if not exists is_read boolean not null default false;
create index if not exists idx_messages_unread on public.messages (username, is_read);