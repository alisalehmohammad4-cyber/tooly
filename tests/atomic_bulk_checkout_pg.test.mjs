import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { computeCheckoutPayloadHash } from '../src/lib/assets/idempotency.ts';

// Helper to initialize an isolated PostgreSQL 16 database with production schema
async function setupTestDatabase() {
  const db = new PGlite();

  // Create roles
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;
  `);

  // Grant schema usage to roles
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);

  // Create base production tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.warehouses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow read warehouses" ON public.warehouses FOR ALL TO anon, authenticated, service_role USING (true);
    GRANT ALL ON public.warehouses TO anon, authenticated, service_role;

    CREATE TABLE IF NOT EXISTS public.assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      current_warehouse_id UUID,
      name TEXT NOT NULL,
      brand TEXT,
      model_number TEXT,
      serial_number TEXT,
      qr_code TEXT,
      tag_number TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      is_locked BOOLEAN DEFAULT false,
      lock_reason TEXT,
      safety_inspection_due DATE,
      current_assigned_worker TEXT,
      expected_return_date TIMESTAMPTZ,
      version INT DEFAULT 1,
      condition TEXT DEFAULT 'good',
      accessories JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all on assets" ON public.assets FOR ALL TO anon, authenticated, service_role USING (organization_id IS NOT NULL);
    GRANT ALL ON public.assets TO anon, authenticated, service_role;

    CREATE TABLE IF NOT EXISTS public.custody_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      asset_id UUID NOT NULL,
      action TEXT NOT NULL,
      warehouse_id UUID,
      from_warehouse_id UUID,
      to_warehouse_id UUID,
      performed_by TEXT,
      worker_name TEXT,
      target_worker TEXT,
      worker_phone TEXT,
      signature_svg TEXT,
      signature_data TEXT,
      is_tag_verified BOOLEAN DEFAULT true,
      signed_at TIMESTAMPTZ DEFAULT now(),
      expected_return_date TIMESTAMPTZ,
      accessories_snapshot JSONB,
      gps_lat DOUBLE PRECISION,
      gps_lng DOUBLE PRECISION,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.custody_ledger ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all on custody_ledger" ON public.custody_ledger FOR ALL TO anon, authenticated, service_role USING (organization_id IS NOT NULL);
    GRANT ALL ON public.custody_ledger TO anon, authenticated, service_role;

    CREATE TABLE IF NOT EXISTS public.transfer_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      asset_id UUID NOT NULL,
      source_warehouse_id TEXT,
      target_warehouse_id TEXT,
      requested_by TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED')),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all on transfer_requests" ON public.transfer_requests FOR ALL TO anon, authenticated, service_role USING (organization_id IS NOT NULL);
    GRANT ALL ON public.transfer_requests TO anon, authenticated, service_role;
  `);

  // Execute migration file unmodified
  const migrationPath = path.resolve('supabase/migrations/20261031_atomic_bulk_checkout_rpc.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await db.exec(migrationSql);

  return db;
}

test('PostgreSQL Integration - Scenario 1: Happy Path Bulk Checkout under ROLE anon with RLS', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const asset1 = 'aaaaaaaa-1111-1111-1111-111111111111';
  const asset2 = 'bbbbbbbb-2222-2222-2222-222222222222';
  const asset3 = 'cccccccc-3333-3333-3333-333333333333';

  // Seed warehouse and 3 available assets
  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name, code)
    VALUES ('${whId}', '${orgId}', 'מחסן ראשי', 'WH-01');

    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, brand, status, version, is_locked)
    VALUES
      ('${asset1}', '${orgId}', '${whId}', 'מברגה מקיטה', 'Makita', 'available', 1, false),
      ('${asset2}', '${orgId}', '${whId}', 'פטישון בוש', 'Bosch', 'in_stock', 1, false),
      ('${asset3}', '${orgId}', '${whId}', 'משחזת זוית דיוולט', 'DeWalt', 'available', 1, false);
  `);

  const idempotencyKey = 'idemp-tx-happy-path-001';
  const workerName = 'איבראהים חסן';
  const expectedReturnDate = '2026-11-20T16:00:00Z';
  const payloadHash = computeCheckoutPayloadHash({
    assetIds: [asset1, asset2, asset3],
    organizationId: orgId,
    warehouseId: whId,
    workerName,
    expectedReturnDate,
  });

  // Switch to role anon (simulating Next.js Server Action client under Supabase anon key)
  await db.query('SET ROLE anon');

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  const res = await db.query(rpcQuery, [
    orgId,
    whId,
    [asset1, asset2, asset3],
    workerName,
    '054-1234567',
    'מחסנאי ראשי',
    'ניפוק לפרויקט רכבת קלה',
    'data:image/svg+xml;base64,mock',
    '<svg></svg>',
    expectedReturnDate,
    idempotencyKey,
    payloadHash,
    32.0853,
    34.7818,
    JSON.stringify({}),
  ]);

  const checkoutResult = res.rows[0].result;
  assert.equal(checkoutResult.success, true);
  assert.equal(checkoutResult.count, 3);
  assert.equal(checkoutResult.assets.length, 3);

  // Switch back to postgres superuser to inspect database state
  await db.query('RESET ROLE');

  // Verify assets state in database
  const assetRows = await db.query(
    'SELECT id, status, current_assigned_worker, version FROM public.assets ORDER BY id ASC'
  );
  assert.equal(assetRows.rows.length, 3);
  for (const row of assetRows.rows) {
    assert.equal(row.status, 'checked_out');
    assert.equal(row.current_assigned_worker, workerName);
    assert.equal(row.version, 2);
  }

  // Verify custody_ledger has exactly 3 rows with clean notes
  const ledgerRows = await db.query('SELECT * FROM public.custody_ledger ORDER BY created_at ASC');
  assert.equal(ledgerRows.rows.length, 3);
  for (const row of ledgerRows.rows) {
    assert.equal(row.action, 'CHECKOUT');
    assert.equal(row.worker_name, workerName);
    assert.equal(row.warehouse_id, whId);
    assert.equal(row.notes, 'ניפוק לפרויקט רכבת קלה');
    assert.doesNotMatch(row.notes, /\[req:/, 'Notes must be completely clean of [req:...]');
  }

  // Verify idempotency_keys table has 1 record
  const idempRows = await db.query('SELECT * FROM public.idempotency_keys');
  assert.equal(idempRows.rows.length, 1);
  assert.equal(idempRows.rows[0].idempotency_key, idempotencyKey);
  assert.equal(idempRows.rows[0].payload_hash, payloadHash);
});

test('PostgreSQL Integration - Scenario 2: Atomic Rollback on 3rd Asset Failure (Zero Partial Writes)', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const asset1 = 'aaaaaaaa-1111-1111-1111-111111111111';
  const asset2 = 'bbbbbbbb-2222-2222-2222-222222222222';
  const asset3Locked = 'cccccccc-3333-3333-3333-333333333333';

  // Seed Asset 1 & 2 as available, Asset 3 as locked
  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name, code)
    VALUES ('${whId}', '${orgId}', 'מחסן ראשי', 'WH-01');

    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version, is_locked, lock_reason)
    VALUES
      ('${asset1}', '${orgId}', '${whId}', 'כלי תקין 1', 'available', 1, false, null),
      ('${asset2}', '${orgId}', '${whId}', 'כלי תקין 2', 'available', 1, false, null),
      ('${asset3Locked}', '${orgId}', '${whId}', 'כלי נעול', 'available', 1, true, 'בדיקת מעבדה נדרשת');
  `);

  const idempotencyKey = 'idemp-tx-fail-rollback-002';
  const workerName = 'עלי מוחמד';
  const expectedReturnDate = '2026-11-20T16:00:00Z';
  const payloadHash = computeCheckoutPayloadHash({
    assetIds: [asset1, asset2, asset3Locked],
    organizationId: orgId,
    warehouseId: whId,
    workerName,
    expectedReturnDate,
  });

  await db.query('SET ROLE anon');

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  let errorThrown = null;
  try {
    await db.query(rpcQuery, [
      orgId,
      whId,
      [asset1, asset2, asset3Locked],
      workerName,
      '050-0000000',
      'מחסנאי',
      'ניסיון ניפוק קבוצתי',
      null,
      null,
      expectedReturnDate,
      idempotencyKey,
      payloadHash,
      null,
      null,
      JSON.stringify({}),
    ]);
  } catch (err) {
    errorThrown = err;
  }

  assert.ok(errorThrown, 'Must throw exception when one asset in batch is locked');
  assert.match(errorThrown.message, /ASSET_LOCKED:/, 'Exception must indicate ASSET_LOCKED');

  await db.query('RESET ROLE');

  // Verify ATOMIC ROLLBACK: Asset 1 and Asset 2 were NOT updated
  const asset1Row = (await db.query(`SELECT * FROM public.assets WHERE id = '${asset1}'`)).rows[0];
  const asset2Row = (await db.query(`SELECT * FROM public.assets WHERE id = '${asset2}'`)).rows[0];
  assert.equal(asset1Row.status, 'available', 'Asset 1 must remain available');
  assert.equal(asset1Row.current_assigned_worker, null, 'Asset 1 worker must remain null');
  assert.equal(asset1Row.version, 1, 'Asset 1 version must not increment');

  assert.equal(asset2Row.status, 'available', 'Asset 2 must remain available');
  assert.equal(asset2Row.current_assigned_worker, null, 'Asset 2 worker must remain null');
  assert.equal(asset2Row.version, 1, 'Asset 2 version must not increment');

  // Verify zero rows added to custody_ledger and idempotency_keys
  const ledgerCount = (await db.query('SELECT count(*) AS count FROM public.custody_ledger')).rows[0].count;
  const idempCount = (await db.query('SELECT count(*) AS count FROM public.idempotency_keys')).rows[0].count;
  assert.equal(Number(ledgerCount), 0, 'Zero ledger rows must exist after rollback');
  assert.equal(Number(idempCount), 0, 'Zero idempotency records must exist after rollback');
});

test('PostgreSQL Integration - Scenario 3: Idempotent Retry After Network Drop', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const asset1 = 'aaaaaaaa-1111-1111-1111-111111111111';

  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whId}', '${orgId}', 'מחסן');
    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version)
    VALUES ('${asset1}', '${orgId}', '${whId}', 'מסור עגול', 'available', 1);
  `);

  const idempotencyKey = 'idemp-tx-retry-003';
  const workerName = 'סמיר עודה';
  const expectedReturnDate = '2026-11-20T16:00:00Z';
  const payloadHash = computeCheckoutPayloadHash({
    assetIds: [asset1],
    organizationId: orgId,
    warehouseId: whId,
    workerName,
    expectedReturnDate,
  });

  await db.query('SET ROLE anon');

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  const params = [
    orgId,
    whId,
    [asset1],
    workerName,
    null,
    'מחסנאי',
    'ניפוק ראשוני',
    null,
    null,
    expectedReturnDate,
    idempotencyKey,
    payloadHash,
    null,
    null,
    JSON.stringify({}),
  ];

  // 1. First execution
  const res1 = await db.query(rpcQuery, params);
  assert.equal(res1.rows[0].result.success, true);
  assert.equal(res1.rows[0].result.idempotent, false);

  // 2. Exact retry with same idempotency key and payload hash (simulating network drop retry)
  const res2 = await db.query(rpcQuery, params);
  assert.equal(res2.rows[0].result.success, true);
  assert.equal(res2.rows[0].result.idempotent_replay, true, 'Must return idempotent_replay: true');

  await db.query('RESET ROLE');

  // Verify asset version is 2 (incremented only ONCE)
  const asset = (await db.query(`SELECT version, status FROM public.assets WHERE id = '${asset1}'`)).rows[0];
  assert.equal(asset.version, 2, 'Version must only increment once');
  assert.equal(asset.status, 'checked_out');

  // Verify exactly 1 custody_ledger row (NOT 2)
  const ledgerCount = (await db.query('SELECT count(*) AS count FROM public.custody_ledger')).rows[0].count;
  assert.equal(Number(ledgerCount), 1, 'Only 1 ledger entry must be created');
});

test('PostgreSQL Integration - Scenario 4: Idempotency Payload Mismatch Protection', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const asset1 = 'aaaaaaaa-1111-1111-1111-111111111111';

  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whId}', '${orgId}', 'מחסן');
    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version)
    VALUES ('${asset1}', '${orgId}', '${whId}', 'מקדחה', 'available', 1);
  `);

  const idempotencyKey = 'idemp-tx-mismatch-004';
  const workerName = 'עובד מקורי';
  const expectedReturnDate = '2026-11-20T16:00:00Z';
  const payloadHash = computeCheckoutPayloadHash({
    assetIds: [asset1],
    organizationId: orgId,
    warehouseId: whId,
    workerName,
    expectedReturnDate,
  });

  await db.query('SET ROLE anon');

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  // First call succeeds
  await db.query(rpcQuery, [
    orgId,
    whId,
    [asset1],
    workerName,
    null,
    'מחסנאי',
    'ניפוק ראשוני',
    null,
    null,
    expectedReturnDate,
    idempotencyKey,
    payloadHash,
    null,
    null,
    JSON.stringify({}),
  ]);

  // Second call with SAME idempotency key but DIFFERENT worker (payload hash mismatch)
  const differentHash = computeCheckoutPayloadHash({
    assetIds: [asset1],
    organizationId: orgId,
    warehouseId: whId,
    workerName: 'עובד שונה לחלוטין',
    expectedReturnDate,
  });

  let errorThrown = null;
  try {
    await db.query(rpcQuery, [
      orgId,
      whId,
      [asset1],
      'עובד שונה לחלוטין',
      null,
      'מחסנאי',
      'ניפוק עם פרמטרים שונים',
      null,
      null,
      expectedReturnDate,
      idempotencyKey,
      differentHash,
      null,
      null,
      JSON.stringify({}),
    ]);
  } catch (err) {
    errorThrown = err;
  }

  assert.ok(errorThrown, 'Must reject reused idempotency key with different payload');
  assert.match(
    errorThrown.message,
    /IDEMPOTENCY_PAYLOAD_MISMATCH:/,
    'Must throw IDEMPOTENCY_PAYLOAD_MISMATCH exception'
  );
});

test('PostgreSQL Integration - Scenario 5: Double-Checkout / Concurrency Protection', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const asset1 = 'aaaaaaaa-1111-1111-1111-111111111111';
  const asset2 = 'bbbbbbbb-2222-2222-2222-222222222222';

  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whId}', '${orgId}', 'מחסן');
    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version)
    VALUES
      ('${asset1}', '${orgId}', '${whId}', 'רתכת', 'available', 1),
      ('${asset2}', '${orgId}', '${whId}', 'גנרטור', 'available', 1);
  `);

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  await db.query('SET ROLE anon');

  // Checkout asset1 first
  const hash1 = computeCheckoutPayloadHash({
    assetIds: [asset1],
    organizationId: orgId,
    warehouseId: whId,
    workerName: 'עובד א',
    expectedReturnDate: '2026-11-20T16:00:00Z',
  });
  await db.query(rpcQuery, [
    orgId,
    whId,
    [asset1],
    'עובד א',
    null,
    'מחסנאי',
    'ניפוק 1',
    null,
    null,
    '2026-11-20T16:00:00Z',
    'idemp-tx-dc-1',
    hash1,
    null,
    null,
    JSON.stringify({}),
  ]);

  // Second user attempts to checkout batch containing asset1 and asset2
  const hash2 = computeCheckoutPayloadHash({
    assetIds: [asset1, asset2],
    organizationId: orgId,
    warehouseId: whId,
    workerName: 'עובד ב',
    expectedReturnDate: '2026-11-20T16:00:00Z',
  });

  let errorThrown = null;
  try {
    await db.query(rpcQuery, [
      orgId,
      whId,
      [asset1, asset2],
      'עובד ב',
      null,
      'מחסנאי',
      'ניפוק 2 כפול',
      null,
      null,
      '2026-11-20T16:00:00Z',
      'idemp-tx-dc-2',
      hash2,
      null,
      null,
      JSON.stringify({}),
    ]);
  } catch (err) {
    errorThrown = err;
  }

  assert.ok(errorThrown, 'Must throw exception when asset is already checked out');
  assert.match(errorThrown.message, /ASSET_NOT_AVAILABLE:|ASSET_ALREADY_ASSIGNED:/);

  await db.query('RESET ROLE');

  // Verify asset2 was NOT checked out (atomically rolled back!)
  const asset2Row = (await db.query(`SELECT * FROM public.assets WHERE id = '${asset2}'`)).rows[0];
  assert.equal(asset2Row.status, 'available');
  assert.equal(asset2Row.current_assigned_worker, null);
});

test('PostgreSQL Integration - Scenario 6: Multi-Tenant Isolation', async () => {
  const db = await setupTestDatabase();

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '99999999-9999-9999-9999-999999999999';
  const whA = '22222222-2222-2222-2222-222222222222';
  const whB = '88888888-8888-8888-8888-888888888888';
  const assetOrgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whA}', '${orgA}', 'מחסן א');
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whB}', '${orgB}', 'מחסן ב');
    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version)
    VALUES ('${assetOrgB}', '${orgB}', '${whB}', 'כלי של ארגון ב', 'available', 1);
  `);

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  const hash = computeCheckoutPayloadHash({
    assetIds: [assetOrgB],
    organizationId: orgA,
    warehouseId: whA,
    workerName: 'תוקף רב דיירים',
    expectedReturnDate: '2026-11-20T16:00:00Z',
  });

  await db.query('SET ROLE anon');

  let errorThrown = null;
  try {
    // Org A attempts to checkout Org B's asset
    await db.query(rpcQuery, [
      orgA,
      whA,
      [assetOrgB],
      'תוקף רב דיירים',
      null,
      'מחסנאי',
      'ניסיון פריצה בין ארגונים',
      null,
      null,
      '2026-11-20T16:00:00Z',
      'idemp-tx-tenant-hack',
      hash,
      null,
      null,
      JSON.stringify({}),
    ]);
  } catch (err) {
    errorThrown = err;
  }

  assert.ok(errorThrown, 'Must reject asset belonging to different organization');
  assert.match(errorThrown.message, /ASSET_NOT_FOUND_OR_TENANT_MISMATCH/);

  await db.query('RESET ROLE');

  // Verify Org B's asset remains untouched
  const assetRow = (await db.query(`SELECT * FROM public.assets WHERE id = '${assetOrgB}'`)).rows[0];
  assert.equal(assetRow.organization_id, orgB);
  assert.equal(assetRow.status, 'available');
  assert.equal(assetRow.current_assigned_worker, null);
});

test('PostgreSQL Integration - Scenario 7: Active Transfer Guard (IN_TRANSIT / PENDING / APPROVED)', async () => {
  const db = await setupTestDatabase();

  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const assetAvailable = 'aaaaaaaa-1111-1111-1111-111111111111';
  const assetInTransitTransfer = 'cccccccc-1111-1111-1111-111111111111';

  // Seed assets: both marked status = 'available' in assets table,
  // BUT assetInTransitTransfer has an active transfer request with status = 'IN_TRANSIT'
  await db.exec(`
    INSERT INTO public.warehouses (id, organization_id, name) VALUES ('${whId}', '${orgId}', 'מחסן');
    INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, status, version)
    VALUES
      ('${assetAvailable}', '${orgId}', '${whId}', 'כלי זמין רגיל', 'available', 1),
      ('${assetInTransitTransfer}', '${orgId}', '${whId}', 'כלי בשינוע פעיל', 'available', 1);

    INSERT INTO public.transfer_requests (id, organization_id, asset_id, source_warehouse_id, target_warehouse_id, requested_by, status)
    VALUES (gen_random_uuid(), '${orgId}', '${assetInTransitTransfer}', '${whId}', 'WH-TARGET', 'נהג שינוע', 'IN_TRANSIT');
  `);

  const rpcQuery = `
    SELECT public.execute_bulk_checkout(
      $1::uuid,
      $2::uuid,
      $3::uuid[],
      $4::varchar,
      $5::varchar,
      $6::varchar,
      $7::text,
      $8::text,
      $9::text,
      $10::timestamptz,
      $11::varchar,
      $12::varchar,
      $13::double precision,
      $14::double precision,
      $15::jsonb
    ) AS result;
  `;

  const hash = computeCheckoutPayloadHash({
    assetIds: [assetAvailable, assetInTransitTransfer],
    organizationId: orgId,
    warehouseId: whId,
    workerName: 'מחסנאי שטח',
    expectedReturnDate: '2026-11-20T16:00:00Z',
  });

  await db.query('SET ROLE anon');

  let errorThrown = null;
  try {
    await db.query(rpcQuery, [
      orgId,
      whId,
      [assetAvailable, assetInTransitTransfer],
      'מחסנאי שטח',
      null,
      'מחסנאי',
      'ניסיון ניפוק כלי שבשינוע',
      null,
      null,
      '2026-11-20T16:00:00Z',
      'idemp-tx-transit-guard',
      hash,
      null,
      null,
      JSON.stringify({}),
    ]);
  } catch (err) {
    errorThrown = err;
  }

  assert.ok(errorThrown, 'Must throw exception when asset has active transfer');
  assert.match(errorThrown.message, /ASSET_IN_ACTIVE_TRANSFER/);

  await db.query('RESET ROLE');

  // Verify atomic rollback: assetAvailable must NOT be checked out
  const availableRow = (await db.query(`SELECT * FROM public.assets WHERE id = '${assetAvailable}'`)).rows[0];
  assert.equal(availableRow.status, 'available');
  assert.equal(availableRow.current_assigned_worker, null);
  assert.equal(availableRow.version, 1);
});
