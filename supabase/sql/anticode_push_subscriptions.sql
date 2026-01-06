-- Web Push subscription storage (for offline OS notifications)
-- Run this in Supabase SQL editor.

create table if not exists public.anticode_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anticode_push_subscriptions_username_idx
  on public.anticode_push_subscriptions (username);

create index if not exists anticode_push_subscriptions_enabled_idx
  on public.anticode_push_subscriptions (enabled);

-- keep updated_at fresh
create or replace function public._anticode_push_subscriptions_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_push_subscriptions_touch on public.anticode_push_subscriptions;
create trigger anticode_push_subscriptions_touch
before update on public.anticode_push_subscriptions
for each row execute function public._anticode_push_subscriptions_touch_updated_at();

-- NOTE ABOUT SECURITY (RLS)
-- This project currently uses a custom auth session (localStorage) + Supabase anon key.
-- If you enable RLS here, you'll need real Supabase Auth or an Edge Function registration flow.
-- For now, leave RLS disabled OR add safe policies that match your auth model.








