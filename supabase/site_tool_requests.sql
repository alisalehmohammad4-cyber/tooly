-- ==============================================================================
-- Tooly - Database Schema: Site Tool Requests Table (Two-Tier Logistics)
-- Operational separation between Site Storekeeper and Chief Operations Manager
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.site_tool_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  requesting_warehouse_id TEXT NOT NULL,
  tool_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  urgency TEXT NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('NORMAL', 'URGENT', 'CRITICAL')),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'APPROVED', 'REJECTED', 'COMPLETED')),
  assigned_asset_id UUID,
  source_warehouse_id TEXT,
  rejection_reason TEXT,
  requested_by TEXT NOT NULL,
  requested_by_user_id TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optimized indexes for tenant-scoped querying and filtering
CREATE INDEX IF NOT EXISTS idx_site_tool_requests_org ON public.site_tool_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_site_tool_requests_wh ON public.site_tool_requests(requesting_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_site_tool_requests_status ON public.site_tool_requests(status);
CREATE INDEX IF NOT EXISTS idx_site_tool_requests_assigned_asset ON public.site_tool_requests(assigned_asset_id);

-- Enable RLS
ALTER TABLE public.site_tool_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'site_tool_requests' AND policyname = 'Allow read site_tool_requests'
  ) THEN
    CREATE POLICY "Allow read site_tool_requests" ON public.site_tool_requests FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'site_tool_requests' AND policyname = 'Allow upsert site_tool_requests'
  ) THEN
    CREATE POLICY "Allow upsert site_tool_requests" ON public.site_tool_requests FOR ALL USING (true);
  END IF;
END $$;
