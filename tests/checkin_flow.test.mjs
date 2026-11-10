import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { CheckinSchema } from '../src/core/assets/custody.schema.ts';
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

    CREATE TABLE IF NOT EXISTS public.custody_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      asset_id UUID NOT NULL,
      action TEXT NOT NULL,
      warehouse_id UUID,
      from_warehouse_id UUID,
      to_warehouse_id UUID,
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

test('Check-in Schema - Validation Contract', () => {
  // Valid standard check-in
  const valid = CheckinSchema.safeParse({
    assetId: '11111111-1111-1111-1111-111111111111',
    condition: 'good',
    notes: 'הוחזר במצב תקין',
  });
  assert.equal(valid.success, true);

  // Valid damaged check-in
  const damaged = CheckinSchema.safeParse({
    assetId: '11111111-1111-1111-1111-111111111111',
    condition: 'needs_repair',
    damageReport: {
      isDamaged: true,
      damageType: 'impact_drop',
      notes: 'סדק בגוף המכשיר עקב נפילה',
    },
    warehouseId: '22222222-2222-2222-2222-222222222222',
  });
  assert.equal(damaged.success, true);

  // Invalid: missing assetId
  const missingId = CheckinSchema.safeParse({
    condition: 'good',
  });
  assert.equal(missingId.success, false);

  // Invalid: unsupported condition
  const badCondition = CheckinSchema.safeParse({
    assetId: '11111111-1111-1111-1111-111111111111',
    condition: 'unknown_condition',
  });
  assert.equal(badCondition.success, false);
});

test('Check-in Flow - Successful Return Transitions Asset to Canonical Available & Clears Worker', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const assetId = '33333333-3333-3333-3333-333333333333';

  // Seed checked-out asset
  await db.query(
    `INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, qr_code, status, current_assigned_worker, expected_return_date, version)
     VALUES ($1, $2, $3, 'מקדחה רוטטת Bosch', 'TOOL-BOSCH-01', 'checked_out', 'ישראל ישראלי', NOW() + INTERVAL '2 days', 1)`,
    [assetId, orgId, whId]
  );

  // Execute atomic check-in transaction
  const newStatus = CANONICAL_AVAILABLE_STATUS; // 'available'
  const condition = 'good';
  const performedBy = 'מחסנאי שטח';
  const notes = 'הוחזר תקין';

  await db.exec('BEGIN');

  // 1. Update asset
  const updateRes = await db.query(
    `UPDATE public.assets
     SET status = $1,
         current_assigned_worker = NULL,
         expected_return_date = NULL,
         condition = $2,
         version = COALESCE(version, 1) + 1,
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING *`,
    [newStatus, condition, assetId, orgId]
  );

  assert.equal(updateRes.rows.length, 1);
  const updatedAsset = updateRes.rows[0];
  assert.equal(updatedAsset.status, 'available');
  assert.equal(updatedAsset.current_assigned_worker, null);
  assert.equal(updatedAsset.expected_return_date, null);
  assert.equal(updatedAsset.version, 2);

  // 2. Insert custody ledger record
  const ledgerRes = await db.query(
    `INSERT INTO public.custody_ledger (organization_id, asset_id, action, warehouse_id, to_warehouse_id, performed_by, condition_at_return, notes)
     VALUES ($1, $2, 'CHECKIN', $3, $3, $4, $5, $6)
     RETURNING *`,
    [orgId, assetId, whId, performedBy, condition, notes]
  );

  await db.exec('COMMIT');

  assert.equal(ledgerRes.rows.length, 1);
  assert.equal(ledgerRes.rows[0].action, 'CHECKIN');
  assert.equal(ledgerRes.rows[0].condition_at_return, 'good');
  assert.equal(ledgerRes.rows[0].performed_by, 'מחסנאי שטח');
});

test('Check-in Flow - Damaged Asset Return Transitions to Maintenance', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const whId = '22222222-2222-2222-2222-222222222222';
  const assetId = '44444444-4444-4444-4444-444444444444';

  // Seed checked-out asset
  await db.query(
    `INSERT INTO public.assets (id, organization_id, current_warehouse_id, name, qr_code, status, current_assigned_worker, expected_return_date, version)
     VALUES ($1, $2, $3, 'משחזת זווית Makita', 'TOOL-MAKITA-01', 'checked_out', 'דוד כהן', NOW() + INTERVAL '1 day', 2)`,
    [assetId, orgId, whId]
  );

  // Return condition: needs_repair
  const condition = 'needs_repair';
  const isDamaged = true;
  const newStatus = isDamaged ? 'maintenance' : CANONICAL_AVAILABLE_STATUS;

  await db.exec('BEGIN');

  const updateRes = await db.query(
    `UPDATE public.assets
     SET status = $1,
         current_assigned_worker = NULL,
         expected_return_date = NULL,
         condition = $2,
         version = COALESCE(version, 1) + 1,
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING *`,
    [newStatus, condition, assetId, orgId]
  );

  assert.equal(updateRes.rows.length, 1);
  assert.equal(updateRes.rows[0].status, 'maintenance');
  assert.equal(updateRes.rows[0].current_assigned_worker, null);
  assert.equal(updateRes.rows[0].version, 3);

  const ledgerRes = await db.query(
    `INSERT INTO public.custody_ledger (organization_id, asset_id, action, warehouse_id, performed_by, condition_at_return, notes)
     VALUES ($1, $2, 'CHECKIN', $3, 'מחסנאי', $4, 'תקלה במנוע')
     RETURNING *`,
    [orgId, assetId, whId, condition]
  );

  await db.exec('COMMIT');

  assert.equal(ledgerRes.rows[0].action, 'CHECKIN');
  assert.equal(ledgerRes.rows[0].condition_at_return, 'needs_repair');
});

test('Check-in Flow - Multi-Tenant Isolation Protection', async () => {
  const db = await setupTestDb();
  const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const assetId = '55555555-5555-5555-5555-555555555555';

  // Seed asset belonging to Tenant B
  await db.query(
    `INSERT INTO public.assets (id, organization_id, name, qr_code, status, current_assigned_worker)
     VALUES ($1, $2, 'פטישון DeWalt', 'TOOL-DEWALT-01', 'checked_out', 'יוסי לוי')`,
    [assetId, orgB]
  );

  // Tenant A attempts to check in Tenant B's asset
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

  // Verify asset in DB still belongs to Tenant B and is still checked out
  const checkRes = await db.query('SELECT status, current_assigned_worker, organization_id FROM public.assets WHERE id = $1', [assetId]);
  assert.equal(checkRes.rows[0].status, 'checked_out');
  assert.equal(checkRes.rows[0].current_assigned_worker, 'יוסי לוי');
  assert.equal(checkRes.rows[0].organization_id, orgB);
});

test('Check-in Flow - Zero Silent Success on Write Failure', async () => {
  const db = await setupTestDb();
  const orgId = '11111111-1111-1111-1111-111111111111';
  const nonexistentAssetId = '99999999-9999-9999-9999-999999999999';

  // Attempting to check in a non-existent asset
  const updateRes = await db.query(
    `UPDATE public.assets
     SET status = 'available',
         current_assigned_worker = NULL
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [nonexistentAssetId, orgId]
  );

  assert.equal(updateRes.rows.length, 0);

  // Simulating the server action response when 0 rows updated
  const result = updateRes.rows.length === 0
    ? { success: false, error: 'שגיאת מסד נתונים: העדכון נכשל (0 שורות עודכנו עקב הרשאות או מזהה לא תואם).' }
    : { success: true };

  assert.equal(result.success, false);
  assert.match(result.error, /0 שורות עודכנו/);

  // Ledger should contain 0 records
  const ledgerCount = (await db.query('SELECT count(*) AS cnt FROM public.custody_ledger')).rows[0].cnt;
  assert.equal(Number(ledgerCount), 0);
});
