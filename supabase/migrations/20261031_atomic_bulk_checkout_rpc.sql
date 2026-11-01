-- ==============================================================================
-- Tooly - Database Migration: Atomic Bulk Custody Checkout RPC
-- File: supabase/migrations/20261031_atomic_bulk_checkout_rpc.sql
-- Function: public.execute_bulk_checkout
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.execute_bulk_checkout(
  p_org_id UUID,
  p_asset_ids UUID[],
  p_worker_name TEXT,
  p_worker_phone TEXT DEFAULT NULL,
  p_expected_return_date TIMESTAMPTZ DEFAULT NULL,
  p_performed_by TEXT DEFAULT 'מחסנאי ראשי',
  p_signature_data TEXT DEFAULT NULL,
  p_gps_lat DOUBLE PRECISION DEFAULT NULL,
  p_gps_lng DOUBLE PRECISION DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_accessories JSONB DEFAULT '{}'::jsonb,
  p_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset RECORD;
  v_locked_assets RECORD[] := ARRAY[]::RECORD[];
  v_count INT := 0;
  v_expected_count INT;
  v_target_wh_id UUID;
  v_effective_notes TEXT;
  v_item_accessories JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_updated_assets JSONB := '[]'::jsonb;
BEGIN
  -- 1. Input parameter validation
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Active organization ID is required';
  END IF;

  IF p_asset_ids IS NULL OR cardinality(p_asset_ids) = 0 THEN
    RAISE EXCEPTION 'NO_ASSETS: Asset IDs array cannot be empty';
  END IF;

  IF p_worker_name IS NULL OR length(trim(p_worker_name)) = 0 THEN
    RAISE EXCEPTION 'WORKER_REQUIRED: Worker name is required for checkout';
  END IF;

  v_expected_count := cardinality(p_asset_ids);

  -- Reject duplicate asset IDs in checkout request
  IF (SELECT count(DISTINCT id) FROM unnest(p_asset_ids) AS id) <> v_expected_count THEN
    RAISE EXCEPTION 'DUPLICATE_ASSET_IDS: Input contains duplicate asset IDs';
  END IF;

  -- 2. Idempotency protection against duplicate requests and network retries
  IF p_request_id IS NOT NULL AND length(trim(p_request_id)) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.custody_ledger
      WHERE organization_id = p_org_id
        AND action = 'CHECKOUT'
        AND notes LIKE '%[req:' || trim(p_request_id) || ']%'
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'message', 'Checkout already completed for this request ID',
        'count', v_expected_count
      );
    END IF;
  END IF;

  -- 3. Lock candidate asset rows with SELECT FOR UPDATE to prevent race conditions
  FOR v_asset IN
    SELECT
      id,
      version,
      status,
      is_locked,
      lock_reason,
      safety_inspection_due,
      organization_id,
      current_assigned_worker,
      current_warehouse_id,
      qr_code,
      name,
      brand,
      model_number,
      condition
    FROM public.assets
    WHERE id = ANY(p_asset_ids)
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    v_locked_assets := array_append(v_locked_assets, v_asset);
  END LOOP;

  IF v_count <> v_expected_count THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND: Some tools could not be located in database. Found % of %.', v_count, v_expected_count;
  END IF;

  -- 4. Check active transfers in transfer_requests (scoped to tenant & candidate assets)
  IF EXISTS (
    SELECT 1 FROM public.transfer_requests
    WHERE organization_id = p_org_id
      AND asset_id = ANY(p_asset_ids)
      AND status IN ('PENDING', 'APPROVED', 'in_transit')
  ) THEN
    RAISE EXCEPTION 'IN_TRANSIT: לא ניתן לנפק: הכלי נמצא בתהליך שינוע פעיל בין אתרים.';
  END IF;

  -- 5. Business rule validation across all locked candidate assets
  FOREACH v_asset IN ARRAY v_locked_assets
  LOOP
    -- Organization / Tenant isolation
    IF v_asset.organization_id IS DISTINCT FROM p_org_id THEN
      RAISE EXCEPTION 'ORGANIZATION_MISMATCH: לא ניתן לנפק ציוד שאינו שייך לארגון הפעיל';
    END IF;

    -- Administrative lock
    IF coalesce(v_asset.is_locked, false) THEN
      RAISE EXCEPTION 'ADMINISTRATIVELY_LOCKED: הכלי נעול מנהלית: %', coalesce(v_asset.lock_reason, 'נעול להוצאה מהמחסן');
    END IF;

    -- Safety inspection validity
    IF v_asset.safety_inspection_due IS NOT NULL AND v_asset.safety_inspection_due < v_now THEN
      RAISE EXCEPTION 'SAFETY_INSPECTION_OVERDUE: ⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית';
    END IF;

    -- Worker assignment
    IF v_asset.current_assigned_worker IS NOT NULL AND length(trim(v_asset.current_assigned_worker)) > 0 THEN
      RAISE EXCEPTION 'ALREADY_ASSIGNED: הכלי כבר משויך לעובד: %', v_asset.current_assigned_worker;
    END IF;

    -- Status availability (accepts canonical 'available' and legacy 'in_stock')
    IF v_asset.status NOT IN ('available', 'in_stock') THEN
      RAISE EXCEPTION 'STATUS_UNAVAILABLE: הכלי אינו זמין במלאי לניפוק';
    END IF;
  END LOOP;

  -- 6. Construct notes with idempotency tag
  v_effective_notes := coalesce(p_notes, 'ניפוק לעובד ' || p_worker_name);
  IF p_request_id IS NOT NULL AND length(trim(p_request_id)) > 0 THEN
    v_effective_notes := v_effective_notes || ' [req:' || trim(p_request_id) || ']';
  END IF;

  -- 7. Atomically update assets and insert custody ledger records in the same transaction
  FOREACH v_asset IN ARRAY v_locked_assets
  LOOP
    -- Extract accessories for this specific asset from JSONB map
    v_item_accessories := p_accessories -> (v_asset.id::text);
    IF v_item_accessories IS NULL OR jsonb_typeof(v_item_accessories) = 'null' THEN
      v_item_accessories := '{"batteriesCount": 0, "hasCharger": false, "hasCase": false}'::jsonb;
    END IF;

    -- Resolve warehouse UUID
    v_target_wh_id := v_asset.current_warehouse_id;
    IF v_target_wh_id IS NULL THEN
      SELECT id INTO v_target_wh_id
      FROM public.warehouses
      WHERE organization_id = p_org_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- Update asset
    UPDATE public.assets
    SET
      status = 'checked_out',
      current_assigned_worker = p_worker_name,
      expected_return_date = p_expected_return_date,
      accessories = v_item_accessories,
      version = coalesce(version, 1) + 1,
      organization_id = p_org_id,
      updated_at = v_now
    WHERE id = v_asset.id;

    -- Insert into custody_ledger
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
      p_org_id,
      v_asset.id,
      'CHECKOUT',
      v_target_wh_id,
      v_target_wh_id,
      v_target_wh_id,
      p_performed_by,
      p_worker_name,
      p_worker_name,
      p_worker_phone,
      p_signature_data,
      p_signature_data,
      true,
      v_now,
      p_expected_return_date,
      v_item_accessories,
      p_gps_lat,
      p_gps_lng,
      v_effective_notes,
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
      'version', coalesce(v_asset.version, 1) + 1,
      'expectedReturnDate', p_expected_return_date,
      'accessories', v_item_accessories
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'count', v_expected_count,
    'assets', v_updated_assets
  );
END;
$$;

-- 8. Restrict EXECUTE privileges strictly to service_role (minimum required role)
-- Never grant EXECUTE to PUBLIC, anon, or authenticated
REVOKE ALL ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID[], TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID[], TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, TEXT
) FROM anon;

REVOKE ALL ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID[], TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, TEXT
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.execute_bulk_checkout(
  UUID, UUID[], TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB, TEXT
) TO service_role;

