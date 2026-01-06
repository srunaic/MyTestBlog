-- Anticode: Channel participants (ever chatted in this room)
-- Purpose:
-- - Right panel should show:
--   1) Online users currently in the room (presence)
--   2) Offline users who have EVER chatted in this room
--
-- Note:
-- - This is required because we prune old messages per channel (see anticode_messages_retention_300.sql),
--   so "ever chatted" cannot be derived from the messages table reliably over time.
--
-- Run in Supabase SQL Editor.

create table if not exists public.anticode_channel_participants (
  channel_id uuid not null references public.anticode_channels(id) on delete cascade,
  username text not null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (channel_id, username)
);

create index if not exists anticode_channel_participants_channel_idx
on public.anticode_channel_participants (channel_id, last_message_at desc);

-- Trigger: when a message is inserted, upsert participant row
create or replace function public._anticode_channel_participants_touch()
returns trigger as $$
begin
  insert into public.anticode_channel_participants (channel_id, username, last_message_at)
  values (new.channel_id, new.user_id, coalesce(new.created_at, now()))
  on conflict (channel_id, username)
  do update set last_message_at = excluded.last_message_at;
  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_channel_participants_touch on public.anticode_messages;
create trigger anticode_channel_participants_touch
after insert on public.anticode_messages
for each row execute function public._anticode_channel_participants_touch();

-- If you use anon key + custom auth, simplest is disabling RLS.
alter table public.anticode_channel_participants disable row level security;


