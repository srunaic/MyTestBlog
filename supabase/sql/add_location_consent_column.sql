-- [ANTICODE] Add Location Consent Column
-- This column tracks whether a user has consented to location data collection.

-- 1. Update 'users' table (Blog System)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='location_allowed') THEN
        ALTER TABLE public.users ADD COLUMN location_allowed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Update 'anticode_users' table (Chat System)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='anticode_users' AND column_name='location_allowed') THEN
        ALTER TABLE public.anticode_users ADD COLUMN location_allowed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

COMMENT ON COLUMN public.users.location_allowed IS 'Consent for location data collection (Google Play compliance)';
COMMENT ON COLUMN public.anticode_users.location_allowed IS 'Consent for location data collection (Google Play compliance)';
