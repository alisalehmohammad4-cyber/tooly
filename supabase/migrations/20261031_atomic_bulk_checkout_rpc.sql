-- ==============================================================================
-- Tooly - Database Migration: Atomic Bulk Custody Checkout RPC & Idempotency Table
-- File: supabase/migrations/20261031_atomic_bulk_checkout_rpc.sql
-- ==============================================================================

-- 1. Dedicated public.idempotency_keys Table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  operation VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_idempotency_org_key UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys (created_at);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.idempotency_keys TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'idempotency_keys' AND policyname = 'idempotency_keys_org_isolation'
  ) THEN
    CREATE POLICY idempotency_keys_org_isolation ON public.idempotency_keys
      FOR ALL
      TO anon, authenticated, service_role
      USING (organization_id IS NOT NULL)
      WITH CHECK (organization_id IS NOT NULL);
  END IF;
END $$;

-- 2. Atomic RPC public.execute_bulk_checkout
CREATE OR REPLACE FUNCTION public.execute_bulk_checkout(
  p_organization_id UUID,
  p_warehouse_id UUID,
  p_asset_ids UUID[],
  p_worker_name VARCHAR,
  p_worker_phone VARCHAR DEFAULT NULL,
  p_performed_by VARCHAR DEFAULT 'מחסנאי ראשי',
  p_notes TEXT DEFAULT NULL,
  p_signature_data TEXT DEFAULT NULL,
  p_signature_svg TEXT DEFAULT NULL,
  p_expected_return_date TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL,
  p_payload_hash VARCHAR DEFAULT NULL,
  p_gps_lat DOUBLE PRECISION DEFAULT NULL,
  p_gps_lng DOUBLE PRECISION DEFAULT NULL,
  p_accessories JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sorted_asset_ids UUID[];
  v_asset public.assets;
  v_locked_assets public.assets[] := ARRAY[]::public.assets[];
  v_existing_idempotency RECORD;
  v_target_wh_id UUID;
  v_item_accessories JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_updated_assets JSONB := '[]'::jsonb;
  v_response JSONB;
BEGIN
  -- Step A: Input Validation
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Active organization ID is required';
  END IF;

  IF p_asset_ids IS NULL OR cardinality(p_asset_ids) = 0 THEN
    RAISE EXCEPTION 'NO_ASSETS: Asset IDs array cannot be empty';
  END IF;

  IF p_worker_name IS NULL OR length(trim(p_worker_name)) = 0 THEN
    RAISE EXCEPTION 'WORKER_REQUIRED: Worker name is required for checkout';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED: Idempotency key is required';
  END IF;

  IF p_payload_hash IS NULL OR length(trim(p_payload_hash)) = 0 THEN
    RAISE EXCEPTION 'PAYLOAD_HASH_REQUIRED: Payload hash is required';
  END IF;

  -- Deduplicate and sort p_asset_ids in ascending UUID order
  SELECT ARRAY(
    SELECT DISTINCT id FROM unnest(p_asset_ids) AS id ORDER BY id ASC
  ) INTO v_sorted_asset_ids;

  IF v_sorted_asset_ids IS NULL OR cardinality(v_sorted_asset_ids) = 0 THEN
    RAISE EXCEPTION 'NO_ASSETS: Asset IDs array cannot be empty';
  END IF;

  -- Step B: Concurrency-Safe Idempotency Lock & Check
  PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':execute_bulk_checkout:' || p_idempotency_key));

  SELECT * INTO v_existing_idempotency
  FROM public.idempotency_keys
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idempotency.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH: Request ID already used with different parameters';
    END IF;

    -- Return recorded response with idempotent_replay flag
    RETURN v_existing_idempotency.response_payload || jsonb_build_object('idempotent_replay', true);
  END IF;

  -- Step C: Deterministic Row Locking & Business Guards
  -- Lock all target rows in public.assets ordered by id ASC to eliminate deadlocks
  FOR v_asset IN
    SELECT *
    FROM public.assets
    WHERE id = ANY(v_sorted_asset_ids)
      AND organization_id = p_organization_id
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    v_locked_assets := array_append(v_locked_assets, v_asset);
  END LOOP;

  IF cardinality(v_locked_assets) <> cardinality(v_sorted_asset_ids) THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND_OR_TENANT_MISMATCH';
  END IF;

  -- Enforce business guards on each locked row
  FOREACH v_asset IN ARRAY v_locked_assets
  LOOP
    IF COALESCE(v_asset.is_locked, false) = true THEN
      RAISE EXCEPTION 'ASSET_LOCKED:%', v_asset.id;
    END IF;

    IF v_asset.safety_inspection_due IS NOT NULL AND v_asset.safety_inspection_due < CURRENT_DATE THEN
      RAISE EXCEPTION 'SAFETY_EXPIRED:%', v_asset.id;
    END IF;

    IF LOWER(TRIM(COALESCE(v_asset.status, ''))) NOT IN ('available', 'in_stock') THEN
      RAISE EXCEPTION 'ASSET_NOT_AVAILABLE:%', v_asset.id;
    END IF;

    IF NULLIF(TRIM(COALESCE(v_asset.current_assigned_worker, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'ASSET_ALREADY_ASSIGNED:%', v_asset.id;
    END IF;
  END LOOP;

  -- Verify zero active transfer requests in public.transfer_requests
  IF EXISTS (
    SELECT 1 FROM public.transfer_requests
    WHERE organization_id = p_organization_id
      AND asset_id = ANY(v_sorted_asset_ids)
      AND UPPER(TRIM(status)) IN ('PENDING', 'APPROVED', 'IN_TRANSIT')
  ) THEN
    RAISE EXCEPTION 'ASSET_IN_ACTIVE_TRANSFER';
  END IF;

  -- Step D: Atomic Mutations
  -- Bulk update assets
  UPDATE public.assets
  SET
    status = 'checked_out',
    current_assigned_worker = p_worker_name,
    expected_return_date = p_expected_return_date,
    current_warehouse_id = COALESCE(p_warehouse_id, current_warehouse_id),
    version = COALESCE(version, 1) + 1,
    updated_at = v_now
  WHERE id = ANY(v_sorted_asset_ids)
    AND organization_id = p_organization_id;

  -- Insert custody ledger records with clean notes (no request ID tags)
  FOREACH v_asset IN ARRAY v_locked_assets
  LOOP
    v_target_wh_id := COALESCE(p_warehouse_id, v_asset.current_warehouse_id);
    IF v_target_wh_id IS NULL THEN
      SELECT id INTO v_target_wh_id
      FROM public.warehouses
      WHERE organization_id = p_organization_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    v_item_accessories := p_accessories -> (v_asset.id::text);
    IF v_item_accessories IS NULL OR jsonb_typeof(v_item_accessories) = 'null' THEN
      v_item_accessories := '{"batteriesCount": 0, "hasCharger": false, "hasCase": false}'::jsonb;
    END IF;

    INSERT INTO public.custody_ledger (
      organization_id,
      asset_id,
      action,
      warehouse_id,
      from_warehouse_id,
      to_warehouse_id,
      performed_by,
      worker_name,
      target_worker,
      worker_phone,
      signature_svg,
      signature_data,
      is_tag_verified,
      signed_at,
      expected_return_date,
      accessories_snapshot,
      gps_lat,
      gps_lng,
      notes,
      created_at
    ) VALUES (
      p_organization_id,
      v_asset.id,
      'CHECKOUT',
      v_target_wh_id,
      v_target_wh_id,
      v_target_wh_id,
      p_performed_by,
      p_worker_name,
      p_worker_name,
      p_worker_phone,
      p_signature_svg,
      p_signature_data,
      true,
      v_now,
      p_expected_return_date,
      v_item_accessories,
      p_gps_lat,
      p_gps_lng,
      p_notes,
      v_now
    );

    v_updated_assets := v_updated_assets || jsonb_build_object(
      'id', v_asset.id,
      'qr_code', v_asset.qr_code,
      'qrCode', v_asset.qr_code,
      'name', v_asset.name,
      'brand', v_asset.brand,
      'model_number', v_asset.model_number,
      'modelNumber', v_asset.model_number,
      'condition', v_asset.condition,
      'status', 'checked_out',
      'current_assigned_worker', p_worker_name,
      'currentAssignedWorker', p_worker_name,
      'current_warehouse_id', v_target_wh_id,
      'currentWarehouseId', v_target_wh_id,
      'version', COALESCE(v_asset.version, 1) + 1,
      'expectedReturnDate', p_expected_return_date,
      'accessories', v_item_accessories
    );
  END LOOP;

  v_response := jsonb_build_object(
    'success', true,
    'idempotent', false,
    'count', cardinality(v_sorted_asset_ids),
    'assets', v_updated_assets
  );

  -- Record idempotency entry with payload hash
  INSERT INTO public.idempotency_keys (
    organization_id,
    idempotency_key,
    operation,
    payload_hash,
    response_payload,
    created_at
  ) VALUES (
    p_organization_id,
    p_idempotency_key,
    'execute_bulk_checkout',
    p_payload_hash,
    v_response,
    v_now
  );

  RETURN v_response;
END;
$$;

-- 3. Security & Access Control
REVOKE ALL ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID, UUID[], VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR, VARCHAR, DOUBLE PRECISION, DOUBLE PRECISION, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID, UUID[], VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT, TEXT, TIMESTAMPTZ, VARCHAR, VARCHAR, DOUBLE PRECISION, DOUBLE PRECISION, JSONB
) TO anon, authenticated, service_role;
