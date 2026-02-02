-- [ANTICODE] Market Seed Data
-- Run this in Supabase SQL Editor to parse initial products and give yourself coins.

-- 1. Insert Sample Products (Emoticon Packs)
insert into public.anticode_products (title, description, price, type, content_data, is_public)
values 
(
  'Basic Pack', 
  'The essential starter pack for everyone.', 
  0, 
  'emoticon_pack', 
  '{"images": ["emo_01.png", "emo_02.png", "emo_03.png", "emo_04.png", "emo_08.png"]}'::jsonb, 
  true
),
(
  'Cute Animals', 
  'Adorable animals to brighten your chat.', 
  500, 
  'emoticon_pack', 
  '{"images": ["emo_09.png", "emo_10.png", "emo_11.png", "emo_12.png", "emo_13.png"]}'::jsonb, 
  true
),
(
  'Developer Emotions', 
  'Only for true coders. Debugging feels included.', 
  1000, 
  'emoticon_pack', 
  '{"images": ["emo_20.png", "emo_21.png", "emo_22.png", "emo_23.png", "emo_25.png"]}'::jsonb, 
  true
)
on conflict do nothing;

-- 2. Grant Test Coins to ALL existing users (One-time bonus)
-- This ensures you can test the purchase flow immediately.
insert into public.anticode_wallets (user_id, balance)
select username, 2000 from public.anticode_users
on conflict (user_id) do update 
set balance = anticode_wallets.balance + 2000;
