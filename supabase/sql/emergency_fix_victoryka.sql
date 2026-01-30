-- Anticode: Emergency Admin Fix V2 (Comprehensive)
-- Issue: "role" column missing in anticode_users table

-- 1. Safely add 'role' column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='anticode_users' AND column_name='role') THEN
        ALTER TABLE public.anticode_users ADD COLUMN role text DEFAULT 'user';
    END IF;
END $$;

-- 2. Ensure the user exists and has 'admin' role
INSERT INTO public.anticode_users (username, nickname, role)
VALUES ('victoryka123', 'VictoryKa', 'admin')
ON CONFLICT (username) DO UPDATE
SET role = 'admin';

-- 3. Update limit function with HARDCODED bypass for this username AND role check
create or replace function public._anticode_channel_limit_for_user(p_user_id text)
returns int
security definer
as $$
declare
  u_role text;
begin
  -- EMERGENCY BYPASS for specific admin (fastest path)
  if p_user_id = 'victoryka123' then
    return 999999;
  end if;

  -- Check DB role (now that column exists)
  select role into u_role from public.anticode_users where username = p_user_id;
  
  if lower(coalesce(u_role, '')) = 'admin' then
    return 999999; 
  end if;

  -- Pro Check
  if public._anticode_is_pro(p_user_id) then
    return 23;
  end if;

  -- Default Free limit
  return 3;
end;
$$ language plpgsql;
