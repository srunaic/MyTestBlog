-- Add bio column to anticode_users for profile card feature
-- Run this in Supabase SQL Editor

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='anticode_users' AND column_name='bio') THEN
        ALTER TABLE public.anticode_users ADD COLUMN bio TEXT DEFAULT '';
        RAISE NOTICE 'Added bio column to anticode_users';
    ELSE
        RAISE NOTICE 'bio column already exists';
    END IF;
END $$;
