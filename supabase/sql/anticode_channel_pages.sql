-- Anticode: Per-user channel pages (custom channel lists / "눈속임" UI)
-- Run in Supabase SQL Editor.

create table if not exists public.anticode_channel_pages (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username, name)
);

create index if not exists anticode_channel_pages_username_idx
on public.anticode_channel_pages (username);

create table if not exists public.anticode_channel_page_items (
  id bigserial primary key,
  page_id uuid not null references public.anticode_channel_pages(id) on delete cascade,
  channel_id uuid not null references public.anticode_channels(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (page_id, channel_id)
);

create index if not exists anticode_channel_page_items_page_idx
on public.anticode_channel_page_items (page_id, position);

create or replace function public._anticode_channel_pages_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_channel_pages_touch on public.anticode_channel_pages;
create trigger anticode_channel_pages_touch
before update on public.anticode_channel_pages
for each row execute function public._anticode_channel_pages_touch_updated_at();

-- (Optional) If you use custom auth + anon key, simplest is disabling RLS.
alter table public.anticode_channel_pages disable row level security;
alter table public.anticode_channel_page_items disable row level security;





