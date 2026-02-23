-- [ANTICODE] OAuth User Sync Trigger
-- This script automatically creates records in your application's user tables
-- when a new user signs up via Google or Naver.

-- 1. Create the sync function
CREATE OR REPLACE FUNCTION public.handle_new_oauth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nickname TEXT;
BEGIN
  -- Extract nickname from metadata (Supabase stores display name here)
  v_nickname := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    SPLIT_PART(new.email, '@', 1) -- Fallback to email prefix
  );

  -- Sync to 'public.users' (Blog)
  -- We use 'email' as the username for OAuth users to ensure uniqueness
  INSERT INTO public.users (username, password, nickname, role)
  VALUES (new.email, 'OAUTH_USER', v_nickname, 'user')
  ON CONFLICT (username) DO NOTHING;

  -- Sync to 'public.anticode_users' (Chat)
  -- We link it via the Supabase UID for robust session handling
  INSERT INTO public.anticode_users (username, nickname, role, uid)
  VALUES (new.email, v_nickname, 'user', new.id)
  ON CONFLICT (username) DO UPDATE
  SET uid = new.id, nickname = EXCLUDED.nickname;

  RETURN new;
END;
$$;

-- 2. Create the trigger on auth.users
-- Note: 'auth' schema is managed by Supabase, so we create the trigger there.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_oauth_user();
