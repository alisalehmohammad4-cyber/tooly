-- ==============================================================================
-- Tooly - Database Schema & Migration: app_users Table
-- Ensures permanent persistence of all system operators, storekeepers and users
-- with Row Level Security (RLS) and Tenant Isolation.
-- ==============================================================================

-- 1. Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE,
  pin TEXT,
  pin_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'storekeeper',
  assigned_warehouse_id TEXT,
  assigned_warehouse_name TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Ensure all columns exist for backwards compatibility with previous migrations
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'storekeeper';
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS assigned_warehouse_id TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS assigned_warehouse_name TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS public.app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Indexes for fast tenant-scoped queries and authentication
CREATE INDEX IF NOT EXISTS idx_app_users_org ON public.app_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_app_users_pin_code ON public.app_users(pin_code);
CREATE INDEX IF NOT EXISTS idx_app_users_pin ON public.app_users(pin);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
-- Drop existing policies if any to ensure clean configuration
DROP POLICY IF EXISTS "Allow read app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow upsert app_users" ON public.app_users;
DROP POLICY IF EXISTS "Tenant isolation for app_users select" ON public.app_users;
DROP POLICY IF EXISTS "Tenant isolation for app_users insert" ON public.app_users;
DROP POLICY IF EXISTS "Tenant isolation for app_users update" ON public.app_users;
DROP POLICY IF EXISTS "Tenant isolation for app_users delete" ON public.app_users;

-- SELECT policy: Users can only view records within their organization or via service_role
CREATE POLICY "Tenant isolation for app_users select" ON public.app_users
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- INSERT policy: Service role or scoped to organization
CREATE POLICY "Tenant isolation for app_users insert" ON public.app_users
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- UPDATE policy: Service role or scoped to organization
CREATE POLICY "Tenant isolation for app_users update" ON public.app_users
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- DELETE policy: Service role or scoped to organization
CREATE POLICY "Tenant isolation for app_users delete" ON public.app_users
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- 6. Insert primary admin account for default organization if not present
INSERT INTO public.app_users (
  organization_id,
  name,
  full_name,
  username,
  pin,
  pin_code,
  role,
  is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'מנהל מפעל ראשי',
  'מנהל מפעל ראשי',
  'Zatout01',
  '1952',
  '1952',
  'admin',
  true
)
ON CONFLICT (username) DO UPDATE SET
  pin = '1952',
  pin_code = '1952',
  organization_id = EXCLUDED.organization_id;
