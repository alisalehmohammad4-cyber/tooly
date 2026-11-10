import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  TRANSFER_REQUEST_DB_STATUS,
  ACTIVE_TRANSFER_REQUEST_STATUSES,
  isTransferRequestActive,
} from '../src/lib/transfers/status.ts';
import { CANONICAL_AVAILABLE_STATUS } from '../src/lib/assets/status.ts';

// Helper to set up an in-memory PostgreSQL instance with Tooly schema
async function setupTestDb() {
  const db = new PGlite();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.warehouses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );

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
      condition TEXT DEFAULT 'good',
      current_assigned_worker TEXT,
      expected_return_date TIMESTAMPTZ,
      version INT DEFAULT 1,
      is_locked BOOLEAN DEFAULT false,
      safety_inspection_due DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.transfer_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      asset_id UUID NOT NULL,
      source_warehouse_id UUID NOT NULL,
      target_warehouse_id UUID NOT NULL,
      requested_by TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED')),
      rejection_reason TEXT,
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.custody_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      asset_id UUID NOT NULL,
      action TEXT NOT NULL,
      warehouse_id UUID,
      from_warehouse_id UUID,
      to_warehouse_id UUID,
      target_warehouse_id UUID,
      target_site_name TEXT,
      performed_by TEXT,
      condition_at_return TEXT,
      notes TEXT,
      damage_report JSONB,
      gps_lat DOUBLE PRECISION,
      gps_lng DOUBLE PRECISION,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  return db;
}

test('Transfer Reception Flow - Completing Reception Transitions Asset to Available and Completes Transfer Request', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sourceWhId = '22222222-2222-2222-2222-222222222222';
  const targetWhId = '33333333-3333-3333-3333-333333333333';
  const assetId = '44444444-4444-4444-4444-444444444444';
  const requestId = '55555555-5555-5555-5555-555555555555';

  // Seed warehouses
  await db.query(
    `INSERT INTO public.warehouses (id, organization_id, name, code) VALUES
     ($1, $2, 'מחסן צפון', 'NORTH'),
     ($3, $2, 'מחסן מרכז', 'CENTER')`,
    [sourceWhId, orgId, targetWhId]
  );

  // Seed asset in 'in_transit' status
  await db.query(
    `INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, qr_code, tag_number, status, current_assigned_worker, expected_return_date, version)
     VALUES ($1, $2, $3, 'רתכת אלקטרונית', 'QR-WELD-01', 'TAG-001', 'in_transit', 'נהג שינוע', NOW() + INTERVAL '1 day', 2)`,
    [assetId, orgId, targetWhId]
  );

  // Seed transfer request in 'IN_TRANSIT' status
  await db.query(
    `INSERT INTO public.transfer_requests (id, organization_id, asset_id, source_warehouse_id, target_warehouse_id, requested_by, status)
     VALUES ($1, $2, $3, $4, $5, 'מחסנאי צפון', 'IN_TRANSIT')`,
    [requestId, orgId, assetId, sourceWhId, targetWhId]
  );

  // Execute reception logic simulating completeTransferReceptionAction
  const performer = 'מחסנאי מרכז';
  const notes = 'הכלי הגיע ונבדק תקין';

  await db.exec('BEGIN');

  // 1. Update asset to canonical available, clear worker & expected return date, bump version
  const assetRes = await db.query(
    `UPDATE public.assets
     SET current_warehouse_id = $1,
         status = $2,
         current_assigned_worker = NULL,
         expected_return_date = NULL,
         version = COALESCE(version, 1) + 1,
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING *`,
    [targetWhId, CANONICAL_AVAILABLE_STATUS, assetId, orgId]
  );

  assert.equal(assetRes.rows.length, 1);
  const updatedAsset = assetRes.rows[0];
  assert.equal(updatedAsset.status, 'available');
  assert.equal(updatedAsset.current_warehouse_id, targetWhId);
  assert.equal(updatedAsset.current_assigned_worker, null);
  assert.equal(updatedAsset.expected_return_date, null);
  assert.equal(updatedAsset.version, 3);

  // 2. Insert RECEIVE_TRANSFER into custody_ledger
  const ledgerRes = await db.query(
    `INSERT INTO public.custody_ledger (
       organization_id, asset_id, action, warehouse_id, target_warehouse_id,
       from_warehouse_id, to_warehouse_id, target_site_name, performed_by, notes
     )
     VALUES ($1, $2, 'RECEIVE_TRANSFER', $3, $3, $4, $3, 'מחסן מרכז', $5, $6)
     RETURNING *`,
    [orgId, assetId, targetWhId, sourceWhId, performer, notes]
  );

  assert.equal(ledgerRes.rows.length, 1);
  assert.equal(ledgerRes.rows[0].action, 'RECEIVE_TRANSFER');
  assert.equal(ledgerRes.rows[0].warehouse_id, targetWhId);
  assert.equal(ledgerRes.rows[0].from_warehouse_id, sourceWhId);
  assert.equal(ledgerRes.rows[0].performed_by, performer);

  // 3. Mark transfer_requests as COMPLETED with received_at
  const trRes = await db.query(
    `UPDATE public.transfer_requests
     SET status = 'COMPLETED',
         received_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [requestId, orgId]
  );

  await db.exec('COMMIT');

  assert.equal(trRes.rows.length, 1);
  assert.equal(trRes.rows[0].status, 'COMPLETED');
  assert.ok(trRes.rows[0].received_at, 'received_at must be populated on reception');
  assert.equal(isTransferRequestActive(trRes.rows[0].status), false);
});

test('Transfer Rollback Flow - Cancelling Transfer Restores Asset to Source Warehouse and Rejects Request', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const sourceWhId = '22222222-2222-2222-2222-222222222222';
  const targetWhId = '33333333-3333-3333-3333-333333333333';
  const assetId = '66666666-6666-6666-6666-666666666666';
  const requestId = '77777777-7777-7777-7777-777777777777';

  // Seed warehouses
  await db.query(
    `INSERT INTO public.warehouses (id, organization_id, name, code) VALUES
     ($1, $2, 'מחסן ראשי', 'MAIN'),
     ($3, $2, 'אתר פרויקט', 'SITE')`,
    [sourceWhId, orgId, targetWhId]
  );

  // Seed asset in 'in_transit' status pointing to targetWhId
  await db.query(
    `INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, qr_code, tag_number, status, current_assigned_worker, version)
     VALUES ($1, $2, $3, 'גנרטור נייד 5KVA', 'QR-GEN-01', 'TAG-GEN', 'in_transit', 'נהג הובלה', 4)`,
    [assetId, orgId, targetWhId]
  );

  // Seed transfer request in 'APPROVED' / 'IN_TRANSIT' status
  await db.query(
    `INSERT INTO public.transfer_requests (id, organization_id, asset_id, source_warehouse_id, target_warehouse_id, requested_by, status)
     VALUES ($1, $2, $3, $4, $5, 'מנהל עבודה', 'IN_TRANSIT')`,
    [requestId, orgId, assetId, sourceWhId, targetWhId]
  );

  // Execute rollback logic simulating cancelTransferRollbackAction
  const performer = 'מחסנאי ראשי';
  const rollbackReason = 'השינוע בוטל עקב ביטול יום עבודה באתר';

  await db.exec('BEGIN');

  // 1. Restore asset to source warehouse, canonical available, clear worker, bump version
  const assetRes = await db.query(
    `UPDATE public.assets
     SET current_warehouse_id = $1,
         status = $2,
         current_assigned_worker = NULL,
         expected_return_date = NULL,
         version = COALESCE(version, 1) + 1,
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING *`,
    [sourceWhId, CANONICAL_AVAILABLE_STATUS, assetId, orgId]
  );

  assert.equal(assetRes.rows.length, 1);
  const updatedAsset = assetRes.rows[0];
  assert.equal(updatedAsset.status, 'available');
  assert.equal(updatedAsset.current_warehouse_id, sourceWhId);
  assert.equal(updatedAsset.current_assigned_worker, null);
  assert.equal(updatedAsset.expected_return_date, null);
  assert.equal(updatedAsset.version, 5);

  // 2. Mark transfer request as REJECTED with rejection_reason
  const trRes = await db.query(
    `UPDATE public.transfer_requests
     SET status = 'REJECTED',
         rejection_reason = $1,
         updated_at = NOW()
     WHERE id = $2 AND organization_id = $3
     RETURNING *`,
    [rollbackReason, requestId, orgId]
  );

  assert.equal(trRes.rows.length, 1);
  assert.equal(trRes.rows[0].status, 'REJECTED');
  assert.equal(trRes.rows[0].rejection_reason, rollbackReason);
  assert.equal(isTransferRequestActive(trRes.rows[0].status), false);

  // 3. Log CANCEL_TRANSFER in custody_ledger
  const ledgerRes = await db.query(
    `INSERT INTO public.custody_ledger (
       organization_id, asset_id, action, from_warehouse_id, to_warehouse_id,
       warehouse_id, target_site_name, performed_by, notes
     )
     VALUES ($1, $2, 'CANCEL_TRANSFER', $3, $4, $4, 'מחסן ראשי', $5, $6)
     RETURNING *`,
    [orgId, assetId, targetWhId, sourceWhId, performer, rollbackReason]
  );

  await db.exec('COMMIT');

  assert.equal(ledgerRes.rows.length, 1);
  assert.equal(ledgerRes.rows[0].action, 'CANCEL_TRANSFER');
  assert.equal(ledgerRes.rows[0].from_warehouse_id, targetWhId);
  assert.equal(ledgerRes.rows[0].to_warehouse_id, sourceWhId);
  assert.equal(ledgerRes.rows[0].performed_by, performer);
});

test('Transfer Reception Flow - Multi-Tenant Isolation Protection', async () => {
  const db = await setupTestDb();
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const assetId = '88888888-8888-8888-8888-888888888888';
  const whB = '99999999-9999-9999-9999-999999999999';

  // Seed asset belonging to Tenant B in_transit
  await db.query(
    `INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, qr_code, status)
     VALUES ($1, $2, $3, 'מסור שולחני Bosch', 'TOOL-SAW-01', 'in_transit')`,
    [assetId, orgB, whB]
  );

  // Tenant A attempts to complete reception of Tenant B's asset
  const updateRes = await db.query(
    `UPDATE public.assets
     SET status = 'available',
         current_assigned_worker = NULL
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [assetId, orgA]
  );

  // 0 rows updated because organization_id does not match
  assert.equal(updateRes.rows.length, 0);

  // Verify asset still belongs to Tenant B and status is still in_transit
  const verifyRes = await db.query('SELECT status, organization_id FROM public.assets WHERE id = $1', [assetId]);
  assert.equal(verifyRes.rows[0].status, 'in_transit');
  assert.equal(verifyRes.rows[0].organization_id, orgB);
});

test('Transfer Reception Flow - Zero Silent Success on Write Failure', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const nonexistentAssetId = '00000000-0000-0000-0000-000000000000';

  // Non-existent asset lookup fails
  const updateRes = await db.query(
    `UPDATE public.assets
     SET status = 'available',
         current_assigned_worker = NULL
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [nonexistentAssetId, orgId]
  );

  assert.equal(updateRes.rows.length, 0);

  // Simulating the server action response when asset not found
  const result = updateRes.rows.length === 0
    ? { success: false, error: `כלי העבודה (${nonexistentAssetId}) לא נמצא במערכת הארגון` }
    : { success: true };

  assert.equal(result.success, false);
  assert.match(result.error, /לא נמצא במערכת הארגון/);

  // Zero entries written to custody_ledger
  const ledgerCount = (await db.query('SELECT count(*) AS cnt FROM public.custody_ledger')).rows[0].cnt;
  assert.equal(Number(ledgerCount), 0);
});

test('Transfer Reception Flow - CHECK Constraint Validates Only Permitted Statuses', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const assetId = '33333333-3333-3333-3333-333333333333';

  // Allowed statuses insert cleanly
  for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED']) {
    const res = await db.query(
      `INSERT INTO public.transfer_requests (organization_id, asset_id, source_warehouse_id, target_warehouse_id, requested_by, status)
       VALUES ($1, $2, $3, $3, 'בודק', $4)
       RETURNING id, status`,
      [orgId, assetId, whId, status]
    );
    assert.equal(res.rows[0].status, status);
  }

  // Disallowed statuses like 'cancelled' or lowercase 'in_transit' trigger CHECK constraint violation
  await assert.rejects(
    async () => {
      await db.query(
        `INSERT INTO public.transfer_requests (organization_id, asset_id, source_warehouse_id, target_warehouse_id, requested_by, status)
         VALUES ($1, $2, $3, $3, 'בודק', 'cancelled')`,
        [orgId, assetId, whId]
      );
    },
    /check constraint/i
  );
});
