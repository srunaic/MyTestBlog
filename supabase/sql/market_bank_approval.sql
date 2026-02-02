-- [ANTICODE] Bank Transfer Manual Approval System
-- Run this in Supabase SQL Editor.

-- 1. [CRITICAL] Drop existing functions to avoid parameter/return type conflicts
DROP FUNCTION IF EXISTS public.request_bank_deposit(int, text, text, text);
DROP FUNCTION IF EXISTS public.get_pending_deposits();
DROP FUNCTION IF EXISTS public.approve_bank_deposit(text);

-- 2. Update Payment History Table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anticode_payment_history' AND column_name = 'sender_bank') THEN
    ALTER TABLE public.anticode_payment_history ADD COLUMN sender_bank text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anticode_payment_history' AND column_name = 'sender_account') THEN
    ALTER TABLE public.anticode_payment_history ADD COLUMN sender_account text;
  END IF;
END $$;

-- 3. Refined Request Bank Deposit (User - Pending Status)
CREATE OR REPLACE FUNCTION public.request_bank_deposit(
  p_amount int,
  p_username text,
  p_sender_bank text,
  p_sender_account text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_nickname text;
  v_payment_id text;
BEGIN
  -- 1. Check User
  SELECT nickname INTO v_user_nickname 
  FROM public.anticode_users WHERE username = p_username;

  IF v_user_nickname IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', '사용자 정보를 찾을 수 없습니다.');
  END IF;

  -- 2. Generate ID
  v_payment_id := 'BANK-' || extract(epoch from now())::bigint || '-' || floor(random() * 1000)::text;

  -- 3. Insert PENDING Record
  INSERT INTO public.anticode_payment_history (user_id, imp_uid, merchant_uid, amount, status, depositor_name, sender_bank, sender_account)
  VALUES (p_username, v_payment_id, v_payment_id, p_amount, 'pending', v_user_nickname, p_sender_bank, p_sender_account);

  RETURN jsonb_build_object('status', 'success', 'message', '입금 신청이 접수되었습니다. 관리자 확인 후 코인이 지급됩니다.');
END;
$$;

-- 4. Get Pending Deposits (Admin Only)
CREATE OR REPLACE FUNCTION public.get_pending_deposits()
RETURNS TABLE (
  id bigint,
  user_id text,
  amount int,
  depositor_name text,
  merchant_uid text,
  sender_bank text,
  sender_account text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Special Admin Check for victoryka123 or anticode_admins
  IF NOT EXISTS (
      SELECT 1 FROM public.anticode_admins a 
      JOIN public.anticode_users u ON u.username = a.username
      WHERE u.uid::text = auth.uid()::text
  ) AND NOT EXISTS (
      SELECT 1 FROM public.anticode_users WHERE username = 'victoryka123' AND uid::text = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  SELECT h.id, h.user_id, h.amount, h.depositor_name, h.merchant_uid, h.sender_bank, h.sender_account, h.created_at
  FROM public.anticode_payment_history h
  WHERE h.status = 'pending'
  ORDER BY h.created_at DESC;
END;
$$;

-- 5. Approve Bank Deposit (Admin Only)
CREATE OR REPLACE FUNCTION public.approve_bank_deposit(
  p_merchant_uid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
BEGIN
  -- Admin Check
  IF NOT EXISTS (
      SELECT 1 FROM public.anticode_admins a 
      JOIN public.anticode_users u ON u.username = a.username
      WHERE u.uid::text = auth.uid()::text
  ) AND NOT EXISTS (
      SELECT 1 FROM public.anticode_users WHERE username = 'victoryka123' AND uid::text = auth.uid()::text
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'message', '관리자 권한이 없습니다.');
  END IF;

  -- Get Record
  SELECT * INTO v_record FROM public.anticode_payment_history 
  WHERE merchant_uid = p_merchant_uid AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', '대기 중인 요청을 찾을 수 없습니다.');
  END IF;

  -- Update Status
  UPDATE public.anticode_payment_history SET status = 'paid' WHERE id = v_record.id;

  -- Charge Coins
  INSERT INTO public.anticode_wallets (user_id, balance) VALUES (v_record.user_id, v_record.amount)
  ON CONFLICT (user_id) DO UPDATE 
  SET balance = anticode_wallets.balance + v_record.amount, 
      updated_at = now();

  RETURN jsonb_build_object('status', 'success', 'message', '승인 완료. 유저에게 코인이 지급되었습니다.');
END;
$$;
