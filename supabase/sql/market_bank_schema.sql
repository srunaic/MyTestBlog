-- [ANTICODE] Bank Transfer System Schema
-- Run this in Supabase SQL Editor.

-- 1. Create Admins Table
create table if not exists public.anticode_admins (
  username text primary key references public.anticode_users(username) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Admins
alter table public.anticode_admins enable row level security;
create policy "Public read admins" on public.anticode_admins for select using (true);

-- 2. Update Payment History Table
-- Add 'depositor_name' if not exists
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'anticode_payment_history' and column_name = 'depositor_name') then
    alter table public.anticode_payment_history add column depositor_name text;
  end if;
end $$;

-- 3. RPC: Request Bank Deposit (User)
create or replace function public.request_bank_deposit(
  p_amount int,
  p_depositor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_payment_id text;
begin
  -- Get current user
  select username into v_user_id from public.anticode_users where uid::text = auth.uid()::text;
  
  if v_user_id is null then
    return '{"status": "error", "message": "로그인이 필요합니다."}'::jsonb;
  end if;

  -- Generate ID
  v_payment_id := 'BANK-' || extract(epoch from now())::bigint || '-' || floor(random() * 1000)::text;

  -- Insert Pending Record
  insert into public.anticode_payment_history (user_id, imp_uid, merchant_uid, amount, status, depositor_name)
  values (v_user_id, v_payment_id, v_payment_id, p_amount, 'pending', p_depositor_name);

  return '{"status": "success", "message": "입금 신청이 완료되었습니다. 관리자 승인 후 지급됩니다."}'::jsonb;
end;
$$;

-- 4. RPC: Get Pending Deposits (Admin Only)
create or replace function public.get_pending_deposits()
returns table (
  id bigint,
  user_id text,
  amount int,
  depositor_name text,
  merchant_uid text,
  created_at timestamp with time zone
)
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
    raise exception 'Access Denied: Not an Admin';
  end if;

  return query
  select h.id, h.user_id, h.amount, h.depositor_name, h.merchant_uid, h.created_at
  from public.anticode_payment_history h
  where h.status = 'pending'
  order by h.created_at desc;
end;
$$;

-- 5. RPC: Approve Bank Deposit (Admin Only)
create or replace function public.approve_bank_deposit(
  p_merchant_uid text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id text;
  v_record record;
begin
  -- Check Admin
  select username into v_caller_id from public.anticode_users where uid::text = auth.uid()::text;
  
  if not exists (select 1 from public.anticode_admins where username = v_caller_id) then
    return '{"status": "error", "message": "관리자만 승인할 수 있습니다."}'::jsonb;
  end if;

  -- Get Record
  select * into v_record from public.anticode_payment_history 
  where merchant_uid = p_merchant_uid and status = 'pending';

  if not found then
    return '{"status": "error", "message": "대기 중인 요청을 찾을 수 없습니다."}'::jsonb;
  end if;

  -- Update Status
  update public.anticode_payment_history set status = 'paid' where id = v_record.id;

  -- Charge Coins
  insert into public.anticode_wallets (user_id, balance) values (v_record.user_id, v_record.amount)
  on conflict (user_id) do update 
  set balance = anticode_wallets.balance + v_record.amount, 
      updated_at = now();

  return '{"status": "success", "message": "승인 완료. 코인이 지급되었습니다."}'::jsonb;
end;
$$;
