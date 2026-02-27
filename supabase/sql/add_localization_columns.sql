-- 1. [Users Table] Add columns for localization
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ko';
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;

-- 2. [Policies] Allow users to update their own language/country settings
-- Note: Assuming the policy for 'Users can update own details' might not cover these new columns explicitly 
-- or to ensure transparency for this specific feature.
-- If a general update policy already exists, this might be redundant but safe.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'users' AND policyname = 'Allow users to update their own localization'
    ) THEN
        CREATE POLICY "Allow users to update their own localization" 
        ON users FOR UPDATE 
        USING (auth.uid()::text = username)
        WITH CHECK (auth.uid()::text = username);
    END IF;
END
$$;

-- 3. [Trigger Fix] In ROSAE HUB, user data is often synced between auth.users and public.users.
-- If you have a trigger that syncs auth.users metadata to public.users, 
-- ensure it handles the new 'language' and 'country' metadata keys.
-- Below is a suggested addition to any existing sync trigger function:

/* 
-- Example of what might be in your trigger function:
NEW.language := COALESCE(NEW.raw_user_meta_data->>'language', 'ko');
NEW.country := NEW.raw_user_meta_data->>'country';
*/
