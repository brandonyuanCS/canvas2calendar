-- Supabase RLS Policies for canvas2calendar
-- Run this in your Supabase SQL Editor to secure the users table
-- This removes OLD policies that used Supabase Auth (we now use Google OAuth only)

-- ===========================================
-- STEP 1: Enable RLS on the users table
-- ===========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- STEP 2: Drop ALL existing policies (these are insecure)
-- ===========================================
-- These old policies reference auth.uid() and user_metadata which we no longer use
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users are viewable by owner" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Allow anon select" ON public.users;
DROP POLICY IF EXISTS "Allow anon insert" ON public.users;
DROP POLICY IF EXISTS "Allow anon update" ON public.users;
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.users;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.users;

-- ===========================================
-- STEP 3: Fix the function search_path issue
-- ===========================================
-- This fixes the "mutable search_path" warning
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ===========================================
-- RESULT: No policies = Only service_role can access
-- ===========================================
-- With RLS enabled and NO policies defined:
-- ❌ Extension (anon key) cannot access users table directly
-- ✅ Edge Functions (service_role key) can access everything
-- ✅ Stripe webhooks (service_role key) can update subscriptions
--
-- This is the correct architecture because:
-- 1. We use Google OAuth, not Supabase Auth
-- 2. auth.uid() returns NULL for all extension requests
-- 3. All user operations go through secure Edge Functions

-- ===========================================
-- OPTIONAL: Verify policies are gone
-- ===========================================
-- Run this to confirm no policies exist:
-- SELECT policyname FROM pg_policies WHERE tablename = 'users';
-- (Should return empty result)

-- ===========================================
-- NOTE ABOUT auth.users TABLE
-- ===========================================
-- The auth.users table (Supabase's built-in auth table) is NOT used.
-- We only use public.users (your custom table) with google_user_id as the key.
-- The Supabase Auth warnings about "leaked password protection" can be ignored
-- since we don't use password authentication.
