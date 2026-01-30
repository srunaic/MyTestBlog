create or replace function public._anticode_channel_limit_for_user(p_user_id text)
returns int
security definer -- Bypass RLS so we can read anticode_users.role
as $$
declare
  u_role text;
begin
  -- 1. Check if user is admin explicitly (via anticode_users role)
  select role into u_role from public.anticode_users where username = p_user_id;
  
  if lower(coalesce(u_role, '')) = 'admin' then
    return 999999; -- Effectively unlimited
  end if;

  -- 2. Check Pro status
  if public._anticode_is_pro(p_user_id) then
    return 23;
  end if;

  -- 3. Default Free limit
  return 3;
end;
$$ language plpgsql;
