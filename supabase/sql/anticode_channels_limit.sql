-- Anticode: Channel creation limit (per-user; Free/Pro)
-- Goal: Prevent overload by limiting how many channels each creator can create.
--
-- Default:
--   Free = 3 channels per owner_id
--   Pro  = 23 channels per owner_id (3 + 20)
--
-- Depends on: public.app_entitlements (see supabase/sql/billing_entitlements.sql)
--
-- Run in Supabase SQL Editor.

create or replace function public._anticode_is_pro(p_user_id text)
returns boolean as $$
declare
  ok boolean;
begin
  select exists (
    select 1
    from public.app_entitlements e
    where e.user_id = p_user_id
      and e.entitlement = 'pro'
      and e.is_active = true
      and (e.period_ends_at is null or e.period_ends_at > now())
  ) into ok;
  return coalesce(ok, false);
end;
$$ language plpgsql stable;

create or replace function public._anticode_channel_limit_for_user(p_user_id text)
returns int as $$
begin
  if public._anticode_is_pro(p_user_id) then
    return 23;
  end if;
  return 3;
end;
$$ language plpgsql stable;

create or replace function public._anticode_channels_enforce_limit()
returns trigger as $$
declare
  lim int;
  cnt int;
  owner text;
begin
  owner := coalesce(new.owner_id, '');
  lim := public._anticode_channel_limit_for_user(owner);

  select count(*) into cnt
  from public.anticode_channels
  where owner_id = owner;

  if cnt >= lim then
    raise exception 'channel_limit_reached (owner=% max=%)', owner, lim
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_channels_limit on public.anticode_channels;
create trigger anticode_channels_limit
before insert on public.anticode_channels
for each row execute function public._anticode_channels_enforce_limit();


