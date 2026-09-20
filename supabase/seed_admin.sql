-- ==============================================================================
-- Tooly - Supabase Database Seed: Primary Admin Account
-- ==============================================================================

-- 1. Ensure the app_users table exists with appropriate structure and constraints
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  name TEXT,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  pin TEXT,
  pin_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supervisor',
  assigned_warehouse_id TEXT,
  assigned_warehouse_name TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backwards-compatible column additions
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Enable RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- Tenant isolation RLS policies
DROP POLICY IF EXISTS "Allow read app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow upsert app_users" ON public.app_users;

CREATE POLICY "Tenant isolation for app_users select" ON public.app_users
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE POLICY "Tenant isolation for app_users upsert" ON public.app_users
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- 2. Insert or update the dedicated executive admin account
INSERT INTO public.app_users (organization_id, name, full_name, username, pin, pin_code, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'מנהל מפעל ראשי', 'מנהל מפעל ראשי', 'Zatout01', '1952', '1952', 'admin')
ON CONFLICT (username) DO UPDATE SET 
  pin = '1952',
  pin_code = '1952',
  organization_id = EXCLUDED.organization_id;
