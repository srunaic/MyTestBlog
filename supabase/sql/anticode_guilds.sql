-- Anticode: Guild/Server shared pages (multi-user channel directory)
-- Run in Supabase SQL Editor.
--
-- NOTE: This project currently uses custom auth + anon key and often disables RLS.
-- We disable RLS here for compatibility, but include a security guide in docs for future migration.

create table if not exists public.anticode_guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_username text not null,
  created_at timestamptz not null default now()
);

create index if not exists anticode_guilds_owner_idx
on public.anticode_guilds (owner_username);

create table if not exists public.anticode_guild_members (
  guild_id uuid not null references public.anticode_guilds(id) on delete cascade,
  username text not null,
  role text not null default 'member', -- owner | admin | member
  created_at timestamptz not null default now(),
  primary key (guild_id, username)
);

create index if not exists anticode_guild_members_user_idx
on public.anticode_guild_members (username);

create table if not exists public.anticode_guild_pages (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.anticode_guilds(id) on delete cascade,
  name text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, name)
);

create index if not exists anticode_guild_pages_guild_idx
on public.anticode_guild_pages (guild_id);

create table if not exists public.anticode_guild_page_items (
  id bigserial primary key,
  page_id uuid not null references public.anticode_guild_pages(id) on delete cascade,
  channel_id uuid not null references public.anticode_channels(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (page_id, channel_id)
);

create index if not exists anticode_guild_page_items_page_idx
on public.anticode_guild_page_items (page_id, position);

create or replace function public._anticode_guild_pages_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_guild_pages_touch on public.anticode_guild_pages;
create trigger anticode_guild_pages_touch
before update on public.anticode_guild_pages
for each row execute function public._anticode_guild_pages_touch_updated_at();

-- Compatibility mode (current app):
alter table public.anticode_guilds disable row level security;
alter table public.anticode_guild_members disable row level security;
alter table public.anticode_guild_pages disable row level security;
alter table public.anticode_guild_page_items disable row level security;


