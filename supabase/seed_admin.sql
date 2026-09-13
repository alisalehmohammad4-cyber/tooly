-- ==============================================================================
-- Tooly - Supabase Database Seed: Primary Admin Account
-- ==============================================================================

-- 1. Ensure the app_users table exists with appropriate structure and constraints
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  pin_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supervisor',
  assigned_warehouse_id TEXT,
  assigned_warehouse_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Allow anonymous/authenticated read & write for field app operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow read app_users'
  ) THEN
    CREATE POLICY "Allow read app_users" ON app_users FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_users' AND policyname = 'Allow upsert app_users'
  ) THEN
    CREATE POLICY "Allow upsert app_users" ON app_users FOR ALL USING (true);
  END IF;
END $$;

-- 2. Insert or update the dedicated executive admin account
INSERT INTO app_users (full_name, username, pin_code, role)
VALUES ('מנהל מפעל ראשי', 'Zatout01', '1952', 'admin')
ON CONFLICT (username) DO UPDATE SET pin_code = '1952';
