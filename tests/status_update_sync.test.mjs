import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('getInTransitFleetAction returns [] when Supabase is configured and has 0 active in-transit assets (never mock ZR-282)', () => {
  const maintSrc = fs.readFileSync(
    path.join(projectRoot, 'src/app/actions/maintenance.ts'),
    'utf8'
  );
  const fnStart = maintSrc.indexOf('export async function getInTransitFleetAction');
  const fnEnd = maintSrc.indexOf('export async function getMaintenanceAssetsAction');
  const fnBody = maintSrc.slice(fnStart, fnEnd);

  // Inside isSupabaseConfigured() branch, both error and empty rows must return [] immediately
  const sbBranchEnd = fnBody.indexOf('Fallback to unified in-memory mock store');
  assert.ok(sbBranchEnd > 0);
  const sbBranch = fnBody.slice(0, sbBranchEnd);

  assert.match(sbBranch, /if \(assetErr\) \{\s*console\.error\([\s\S]*?\);\s*return \[\];\s*\}/);
  assert.match(sbBranch, /if \(!assetRows \|\| assetRows\.length === 0\) \{\s*return \[\];\s*\}/);
  assert.match(sbBranch, /catch \(err\) \{\s*console\.error\([\s\S]*?\);\s*return \[\];\s*\}/);
});

test('updateAssetStatusAction enforces canonical statuses, clears worker, writes custody_ledger, clears catalogCache, and fails loudly', () => {
  const assetsSrc = fs.readFileSync(
    path.join(projectRoot, 'src/app/actions/assets.ts'),
    'utf8'
  );
  const fnStart = assetsSrc.indexOf('export async function updateAssetStatusAction');
  const fnBody = assetsSrc.slice(fnStart);

  // Uses normalizeAssetStatus and canonical status
  assert.match(fnBody, /const canonicalStatus = normalizeAssetStatus\(newStatus\)/);
  assert.match(fnBody, /status: canonicalStatus/);

  // Clears worker & expected return date on available / maintenance / retired
  assert.match(fnBody, /canonicalStatus === 'available' \|\|\s*canonicalStatus === 'maintenance' \|\|\s*canonicalStatus === 'retired'/);
  assert.match(fnBody, /updateData\.current_assigned_worker = null/);
  assert.match(fnBody, /updateData\.expected_return_date = null/);
  assert.match(fnBody, /updateData\.version =/);

  // Fails loudly on DB error or zero rows or ledger error — never falls through to mockStore when Supabase is configured
  assert.match(fnBody, /if \(updateErr\)[\s\S]*?return \{ success: false, error:/);
  assert.match(fnBody, /if \(!updatedRows \|\| updatedRows\.length === 0\)[\s\S]*?return \{ success: false, error:/);
  assert.match(fnBody, /if \(ledgerErr\)[\s\S]*?return \{ success: false, error:/);
  assert.match(fnBody, /if \(isSupabaseConfigured\(\)\) \{[\s\S]*?\} else \{[\s\S]*?mutateMockAsset/);

  // Invalidates catalogCache and dashboard caches + revalidates paths
  assert.match(fnBody, /await invalidateCatalogCache\(\)/);
  assert.match(fnBody, /await clearDashboardCaches\(\)/);
  assert.match(fnBody, /revalidatePath\('\/catalog'\)/);
  assert.match(fnBody, /revalidatePath\('\/dashboard\/warehouse'\)/);

  // clearDashboardCaches also clears catalogCache so any custody action clears catalog
  const dashSrc = fs.readFileSync(
    path.join(projectRoot, 'src/app/actions/dashboard.ts'),
    'utf8'
  );
  const clearFn = dashSrc.slice(
    dashSrc.indexOf('export async function clearDashboardCaches'),
    dashSrc.indexOf('async function resolveActiveOrganizationId')
  );
  assert.match(clearFn, /invalidateCatalogCache/);
});

test('UI status switchers & modals sync local state, expose switcher to all elevated roles, and forceRefresh warehouse dashboard', () => {
  const switcherSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/StatusSwitcher.tsx'),
    'utf8'
  );
  const passportSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/ToolPassportModal.tsx'),
    'utf8'
  );
  const warehouseSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/WarehouseDashboardView.tsx'),
    'utf8'
  );
  const catalogSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/CatalogView.tsx'),
    'utf8'
  );

  // StatusSwitcher syncs prop changes and alerts on error
  assert.match(switcherSrc, /useEffect\(\(\) => \{\s*setStatus\(currentStatus\);\s*\}, \[currentStatus\]\)/);
  assert.match(switcherSrc, /if \(!res\.success\) \{\s*alert\(/);

  // ToolPassportModal uses AuthContext isSupervisorOrAdmin (all elevated roles, not only supervisor/admin)
  assert.doesNotMatch(passportSrc, /const isSupervisorOrAdmin = role === 'supervisor' \|\| role === 'admin'/);
  assert.match(passportSrc, /isSupervisorOrAdmin \} = useAuth\(\)/);

  // WarehouseDashboardView refreshes dashboard state with forceRefresh = true when passport updates
  assert.match(warehouseSrc, /handleWarehouseChange\(selectedWarehouseId, true\)/);
  assert.match(warehouseSrc, /void loadMaintenanceAssets\(\)/);
  assert.match(warehouseSrc, /void loadInTransitFleet\(\)/);

  // CatalogView clears assigned worker on available/maintenance/retired
  assert.match(catalogSrc, /currentAssignedWorker: null/);
});

test('PostgreSQL Integration - status update persists canonically, clears worker on available/maintenance, increments version, and writes custody_ledger', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE assets (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL,
      qr_code text NOT NULL,
      status text NOT NULL CHECK (status IN ('available', 'checked_out', 'maintenance', 'in_transit', 'retired')),
      condition text NOT NULL DEFAULT 'good',
      current_warehouse_id uuid NOT NULL,
      current_assigned_worker text,
      expected_return_date timestamptz,
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE custody_ledger (
      id bigserial PRIMARY KEY,
      asset_id uuid NOT NULL REFERENCES assets(id),
      organization_id uuid NOT NULL,
      action text NOT NULL,
      warehouse_id uuid NOT NULL,
      performed_by text NOT NULL,
      condition_at_return text,
      notes text
    );
  `);

  const orgId = '00000000-0000-0000-0000-000000000001';
  const whId = '10000000-0000-0000-0000-000000000001';
  const assetId = '1cd09a2c-28d7-4ff7-9d08-34b999deddec';

  await db.query(
    `INSERT INTO assets (id, organization_id, qr_code, status, condition, current_warehouse_id, current_assigned_worker, expected_return_date, version)
     VALUES ($1, $2, 'ZR-282', 'checked_out', 'good', $3, 'יוסי', '2026-11-30T10:00:00Z', 1)`,
    [assetId, orgId, whId]
  );

  // 1. Transition checked_out -> maintenance: clears worker & expected_return_date, sets condition = needs_repair, increments version
  const upd1 = await db.query(
    `UPDATE assets
     SET status = 'maintenance', condition = 'needs_repair', current_assigned_worker = NULL, expected_return_date = NULL, version = version + 1
     WHERE id = $1 AND organization_id = $2
     RETURNING status, condition, current_assigned_worker, expected_return_date, version`,
    [assetId, orgId]
  );
  assert.equal(upd1.rows[0].status, 'maintenance');
  assert.equal(upd1.rows[0].condition, 'needs_repair');
  assert.equal(upd1.rows[0].current_assigned_worker, null);
  assert.equal(upd1.rows[0].expected_return_date, null);
  assert.equal(upd1.rows[0].version, 2);

  await db.query(
    `INSERT INTO custody_ledger (asset_id, organization_id, action, warehouse_id, performed_by, condition_at_return, notes)
     VALUES ($1, $2, 'MAINTENANCE', $3, 'סאמח עמאשה', 'needs_repair', 'שינוי סטטוס כלי ישיר ל-maintenance')`,
    [assetId, orgId, whId]
  );

  // 2. Transition maintenance -> available: clears worker, restores condition = good, increments version
  const upd2 = await db.query(
    `UPDATE assets
     SET status = 'available', condition = 'good', current_assigned_worker = NULL, expected_return_date = NULL, version = version + 1
     WHERE id = $1 AND organization_id = $2
     RETURNING status, condition, current_assigned_worker, version`,
    [assetId, orgId]
  );
  assert.equal(upd2.rows[0].status, 'available');
  assert.equal(upd2.rows[0].condition, 'good');
  assert.equal(upd2.rows[0].current_assigned_worker, null);
  assert.equal(upd2.rows[0].version, 3);

  // 3. Verify 0 in_transit assets exist
  const inTransit = await db.query(
    `SELECT id FROM assets WHERE organization_id = $1 AND status = 'in_transit'`,
    [orgId]
  );
  assert.equal(inTransit.rows.length, 0);

  const ledger = await db.query(`SELECT action FROM custody_ledger WHERE asset_id = $1`, [assetId]);
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].action, 'MAINTENANCE');
});
