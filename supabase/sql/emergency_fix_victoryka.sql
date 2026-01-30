-- Anticode: Emergency Admin Fix for 'victoryka123'
-- 1. Ensure the user exists in anticode_users with admin role
INSERT INTO public.anticode_users (username, nickname, role)
VALUES ('victoryka123', 'VictoryKa', 'admin')
ON CONFLICT (username) DO UPDATE
SET role = 'admin';

-- 2. Update limit function with HARDCODED bypass for this username
create or replace function public._anticode_channel_limit_for_user(p_user_id text)
returns int
security definer
as $$
declare
  u_role text;
begin
  -- EMERGENCY BYPASS for specific admin
  if p_user_id = 'victoryka123' then
    return 999999;
  end if;

  select role into u_role from public.anticode_users where username = p_user_id;
  
  if lower(coalesce(u_role, '')) = 'admin' then
    return 999999; 
  end if;

  if public._anticode_is_pro(p_user_id) then
    return 23;
  end if;

  return 3;
end;
$$ language plpgsql;
