-- Anticode: Channel creation limit (Free/Pro friendly)
-- Goal: Prevent server overload by limiting total number of channels.
--
-- Default:
--   Free  = 3 channels total
--   Pro   = 23 channels total (free + 20)
--
-- How to switch to Pro:
--   update public.anticode_app_settings set value = '23' where key = 'channel_limit';
--
-- Run in Supabase SQL Editor.

create table if not exists public.anticode_app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public._anticode_app_settings_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_app_settings_touch on public.anticode_app_settings;
create trigger anticode_app_settings_touch
before update on public.anticode_app_settings
for each row execute function public._anticode_app_settings_touch_updated_at();

-- Default setting (Free = 3)
insert into public.anticode_app_settings(key, value)
values ('channel_limit', '3')
on conflict (key) do nothing;

create or replace function public._anticode_setting_int(p_key text, p_default int)
returns int as $$
declare
  v text;
  n int;
begin
  select value into v from public.anticode_app_settings where key = p_key;
  if v is null then
    return p_default;
  end if;
  begin
    n := v::int;
  exception when others then
    return p_default;
  end;
  return n;
end;
$$ language plpgsql stable;

-- Enforce channel count limit on insert
create or replace function public._anticode_channels_enforce_limit()
returns trigger as $$
declare
  lim int;
  cnt int;
begin
  lim := public._anticode_setting_int('channel_limit', 3);
  if lim < 1 then
    lim := 1;
  end if;

  select count(*) into cnt from public.anticode_channels;
  if cnt >= lim then
    raise exception 'channel_limit_reached (max=%)', lim
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_channels_limit on public.anticode_channels;
create trigger anticode_channels_limit
before insert on public.anticode_channels
for each row execute function public._anticode_channels_enforce_limit();

-- Compatibility mode (current app):
alter table public.anticode_app_settings disable row level security;


