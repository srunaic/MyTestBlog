-- Anticode: Message retention (Free tier-friendly)
-- Goal: Keep ONLY the latest 300 messages per channel to prevent unbounded growth on Supabase Free.
--
-- Run this in Supabase SQL Editor.

-- 1) Indexes (performance for fetch + prune)
create index if not exists anticode_messages_channel_created_at_id_idx
on public.anticode_messages (channel_id, created_at desc, id desc);

create index if not exists anticode_messages_created_at_idx
on public.anticode_messages (created_at desc);

-- 2) Enforce retention on each insert (keep newest 300 per channel)
create or replace function public._anticode_messages_enforce_retention_300()
returns trigger as $$
begin
  -- Delete older rows, keep newest 300 by (created_at desc, id desc)
  delete from public.anticode_messages m
  where m.channel_id = new.channel_id
    and m.id not in (
      select id
      from public.anticode_messages
      where channel_id = new.channel_id
      order by created_at desc, id desc
      limit 300
    );

  return new;
end;
$$ language plpgsql;

drop trigger if exists anticode_messages_retention_300 on public.anticode_messages;
create trigger anticode_messages_retention_300
after insert on public.anticode_messages
for each row execute function public._anticode_messages_enforce_retention_300();

-- 3) (Optional) One-time prune for existing history (keeps newest 300 per channel)
-- Uncomment and run once if you already have lots of old messages.
-- with ranked as (
--   select
--     id,
--     row_number() over (partition by channel_id order by created_at desc, id desc) as rn
--   from public.anticode_messages
-- )
-- delete from public.anticode_messages m
-- using ranked r
-- where m.id = r.id
--   and r.rn > 300;


