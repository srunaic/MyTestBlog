-- [ANTICODE] Bank Transfer System Refinement
-- Run this in Supabase SQL Editor.

-- 1. Create Bank Settings Table
create table if not exists public.anticode_bank_settings (
  id int primary key default 1,
  bank_name text not null default '카카오뱅크',
  account_number text not null default '3333-00-0000000',
  account_owner text not null default '홍길동',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint single_row check (id = 1)
);

-- Seed initial data
insert into public.anticode_bank_settings (id, bank_name, account_number, account_owner)
values (1, '카카오뱅크', '3333-00-0000000', '홍길동')
on conflict (id) do nothing;

-- Enable RLS
alter table public.anticode_bank_settings enable row level security;
create policy "Public read bank settings" on public.anticode_bank_settings for select using (true);

-- 2. RPC: Update Bank Settings (Admin Only)
create or replace function public.update_bank_settings(
  p_bank_name text,
  p_account_number text,
  p_account_owner text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id text;
begin
  -- Check Admin
  select username into v_caller_id from public.anticode_users where uid::text = auth.uid()::text;
  
  if not exists (select 1 from public.anticode_admins where username = v_caller_id) then
    return '{"status": "error", "message": "관리자만 수정할 수 있습니다."}'::jsonb;
  end if;

  update public.anticode_bank_settings
  set bank_name = p_bank_name,
      account_number = p_account_number,
      account_owner = p_account_owner,
      updated_at = now()
  where id = 1;

  return '{"status": "success", "message": "계좌 정보가 업데이트되었습니다."}'::jsonb;
end;
$$;

-- 3. Refined Request Bank Deposit (User - Immediate Grant with Warning handled in JS)
create or replace function public.request_bank_deposit(
  p_amount int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_username text;
  v_user_nickname text;
  v_payment_id text;
begin
  -- Get current user info
  select username, nickname into v_user_username, v_user_nickname 
  from public.anticode_users where uid::text = auth.uid()::text;
  
  if v_user_username is null then
    return '{"status": "error", "message": "로그인이 필요합니다."}'::jsonb;
  end if;

  -- Generate ID
  v_payment_id := 'BANK-' || extract(epoch from now())::bigint || '-' || floor(random() * 1000)::text;

  -- 1. Insert Record (Status is 'paid' immediately as requested)
  insert into public.anticode_payment_history (user_id, imp_uid, merchant_uid, amount, status, depositor_name)
  values (v_user_username, v_payment_id, v_payment_id, p_amount, 'paid', v_user_nickname);

  -- 2. Update Wallet IMMEDIATELY
  insert into public.anticode_wallets (user_id, balance) values (v_user_username, p_amount)
  on conflict (user_id) do update 
  set balance = anticode_wallets.balance + p_amount, 
      updated_at = now();

  return '{"status": "success", "message": "코인이 즉시 지급되었습니다! 안내드린 계좌로 입금을 꼭 완료해주세요.", "balance_added": ' || p_amount || '}'::jsonb;
end;
$$;
