-- [ANTICODE] Bank Transfer System Refinement (Fixed Signature)
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
drop policy if exists "Public read bank settings" on public.anticode_bank_settings;
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

-- 3. Refined Request Bank Deposit (User - Immediate Grant with Self-Healing)
-- DROP existing versions to avoid parameter name/type conflicts
DROP FUNCTION IF EXISTS public.request_bank_deposit(int);
DROP FUNCTION IF EXISTS public.request_bank_deposit(int, text);

CREATE OR REPLACE FUNCTION public.request_bank_deposit(
  p_amount int,
  p_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_uid text;
  v_user_nickname text;
  v_payment_id text;
BEGIN
  -- 1. 유저네임으로 기존 유저 정보를 찾습니다.
  SELECT uid, nickname INTO v_db_uid, v_user_nickname 
  FROM public.anticode_users WHERE username = p_username;

  IF v_user_nickname IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', '사용자 정보를 찾을 수 없습니다.');
  END IF;

  -- 2. [로그인 정보 자동 연동] 
  -- 만약 DB에 UID가 없거나 예전 방식(짧은 숫자)이라면, 지금 접속한 ID로 자동 업데이트합니다.
  IF (v_db_uid IS NULL OR length(v_db_uid) < 10) AND auth.uid() IS NOT NULL THEN
    UPDATE public.anticode_users SET uid = auth.uid()::text WHERE username = p_username;
    v_db_uid := auth.uid()::text;
  END IF;

  -- 3. 권한 확인 (지금 접속한 사람과 기록된 사람이 맞는지 - 보안 강화)
  IF auth.uid() IS NOT NULL AND v_db_uid::text != auth.uid()::text THEN
    RETURN jsonb_build_object('status', 'error', 'message', '로그인이 필요합니다. (권한 불일치)');
  END IF;

  -- 4. 코인 지급 및 기록 (즉시 지급)
  v_payment_id := 'BANK-' || extract(epoch from now())::bigint || '-' || floor(random() * 1000)::text;

  INSERT INTO public.anticode_payment_history (user_id, imp_uid, merchant_uid, amount, status, depositor_name)
  VALUES (p_username, v_payment_id, v_payment_id, p_amount, 'paid', v_user_nickname);

  INSERT INTO public.anticode_wallets (user_id, balance) VALUES (p_username, p_amount)
  ON CONFLICT (user_id) DO UPDATE 
  SET balance = anticode_wallets.balance + p_amount, updated_at = now();

  RETURN jsonb_build_object('status', 'success', 'message', '코인이 즉시 지급되었습니다! 계좌 입금을 잊지 마세요.');
END;
$$;
