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
declare
  ch uuid;
begin
  -- anticode_messages.channel_id is TEXT in this project; participants.channel_id is UUID.
  -- Convert safely by looking up the channel UUID.
  select c.id into ch
  from public.anticode_channels c
  where c.id::text = new.channel_id
  limit 1;

  -- If we can't resolve channel UUID, do nothing (but never fail the message insert).
  if ch is null then
    return new;
  end if;

  insert into public.anticode_channel_participants (channel_id, username, last_message_at)
  values (ch, new.user_id, coalesce(new.created_at, now()))
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


