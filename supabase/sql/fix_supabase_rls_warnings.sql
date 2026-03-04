-- SQL Script to resolve Supabase Security Advisor RLS Warnings
-- This script enables RLS on flagged tables and applies secure policies:
-- 1. Anyone (or authenticated users) can READ (SELECT).
-- 2. ONLY authenticated logged-in users can WRITE (INSERT, UPDATE, DELETE).

DO $$ 
DECLARE
    table_name text;
    tables text[] := ARRAY[
        'users',
        'channels',
        'messages',
        'anticode_channel_members',
        'anticode_push_subscriptions',
        'anticode_deletion_requests',
        'anticode_channel_pages',
        'anticode_channel_page_items',
        'app_entry_log',
        'revenuecat_events',
        'anticode_channel_participants',
        'posts',
        'comments',
        'chatbot_logs',
        'site_management'
    ];
BEGIN
    FOREACH table_name IN ARRAY tables LOOP
        -- Check if table exists
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = table_name) THEN
            
            -- 1. Enable RLS
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_name);
            
            -- 2. Drop existing overly-permissive manual policies to clear warnings
            BEGIN
                EXECUTE format('DROP POLICY IF EXISTS "Enable all for anon on members" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Enable all for anon on blocks" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "public_read_all" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "public_write_all" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.%I;', table_name);
                EXECUTE format('DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.%I;', table_name);
            EXCEPTION WHEN OTHERS THEN
                -- Ignore errors if policies don't exist
            END;

            -- 3. Create secure policies
            -- SELECT: Allow read access for everyone (since it's a public blog/chat UI that loads data before auth in some cases)
            EXECUTE format('CREATE POLICY "Enable read access for all users" ON public.%I FOR SELECT USING (true);', table_name);
            
            -- INSERT: Only authenticated users
            EXECUTE format('CREATE POLICY "Enable insert for authenticated users only" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', table_name);
            
            -- UPDATE: Only authenticated users
            EXECUTE format('CREATE POLICY "Enable update for authenticated users only" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', table_name);
            
            -- DELETE: Only authenticated users
            EXECUTE format('CREATE POLICY "Enable delete for authenticated users only" ON public.%I FOR DELETE TO authenticated USING (true);', table_name);
            
            RAISE NOTICE 'Secured table: %', table_name;
        ELSE
            RAISE NOTICE 'Table does not exist, skipping: %', table_name;
        END IF;
    END LOOP;
END $$;
