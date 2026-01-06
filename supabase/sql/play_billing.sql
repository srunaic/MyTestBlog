-- Google Play Billing verification (server-side)
-- Stores verification logs for purchase tokens. Entitlements are stored in public.app_entitlements.
-- Run in Supabase SQL Editor.

create table if not exists public.play_purchase_tokens (
  id bigserial primary key,
  user_id text not null,                 -- your app user identifier (username/uid)
  package_name text not null,            -- com.your.app
  product_id text not null,              -- subscription product id (e.g. pro_monthly)
  token_hash text not null,              -- sha256(purchaseToken) hex
  last_verified_at timestamptz not null default now(),
  expires_at timestamptz,
  raw jsonb,
  unique (package_name, product_id, token_hash)
);

create index if not exists play_purchase_tokens_user_idx
on public.play_purchase_tokens (user_id);

create index if not exists play_purchase_tokens_expires_idx
on public.play_purchase_tokens (expires_at);

-- Compatibility mode (current app uses custom auth + anon key)
alter table public.play_purchase_tokens disable row level security;







