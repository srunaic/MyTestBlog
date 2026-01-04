-- Per-channel block list (used to prevent re-inviting kicked users until unblocked)

create table if not exists public.anticode_channel_blocks (
  id bigserial primary key,
  channel_id uuid not null,
  blocked_username text not null,
  blocked_by text not null,
  created_at timestamptz not null default now(),
  unique (channel_id, blocked_username, blocked_by)
);

create index if not exists anticode_channel_blocks_channel_idx
  on public.anticode_channel_blocks (channel_id);

create index if not exists anticode_channel_blocks_blocked_by_idx
  on public.anticode_channel_blocks (blocked_by);

-- (선택) RLS 끄기: 지금 구조(커스텀 로그인 + anon key)면 이게 제일 간단합니다
alter table public.anticode_channel_blocks disable row level security;


