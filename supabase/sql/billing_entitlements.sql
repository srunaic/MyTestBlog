-- Billing / Entitlements (RevenueCat -> Supabase)
-- Run in Supabase SQL Editor.

create table if not exists public.app_entitlements (
  id bigserial primary key,
  user_id text not null,                 -- your app user identifier (ex: username or uid)
  entitlement text not null,             -- ex: 'pro'
  is_active boolean not null default false,
  period_ends_at timestamptz,            -- expiration from RevenueCat (nullable for non-expiring)
  source text not null default 'revenuecat',
  updated_at timestamptz not null default now(),
  unique (user_id, entitlement)
);

create index if not exists app_entitlements_user_idx
on public.app_entitlements (user_id);

create table if not exists public.revenuecat_events (
  id bigserial primary key,
  event_id text unique,                  -- RevenueCat event.event.id (idempotency)
  user_id text,
  type text,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

-- Compatibility mode (current app uses custom auth + anon key)
alter table public.app_entitlements disable row level security;
alter table public.revenuecat_events disable row level security;


