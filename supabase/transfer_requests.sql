-- ==============================================================================
-- Tooly - Database Schema: Inter-site Transfer Requests Table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  source_warehouse_id TEXT NOT NULL,
  target_warehouse_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_user_id TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  rejection_reason TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optimized indexes for tenant-scoped querying and status filtering
CREATE INDEX IF NOT EXISTS idx_transfer_requests_org ON public.transfer_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON public.transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_asset ON public.transfer_requests(asset_id);

-- Enable RLS
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transfer_requests' AND policyname = 'Allow read transfer_requests'
  ) THEN
    CREATE POLICY "Allow read transfer_requests" ON public.transfer_requests FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transfer_requests' AND policyname = 'Allow upsert transfer_requests'
  ) THEN
    CREATE POLICY "Allow upsert transfer_requests" ON public.transfer_requests FOR ALL USING (true);
  END IF;
END $$;
