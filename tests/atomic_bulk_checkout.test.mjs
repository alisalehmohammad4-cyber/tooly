import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BulkCheckoutSchema } from '../src/core/assets/custody.schema.ts';
import { computeCheckoutPayloadHash } from '../src/lib/assets/idempotency.ts';

test('Atomic Bulk Checkout Migration - SQL Structure & Security Architecture', () => {
  const migrationPath = path.resolve('supabase/migrations/20261031_atomic_bulk_checkout_rpc.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // 1. Dedicated idempotency table with unique constraint and payload hash
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.idempotency_keys/,
    'Must define public.idempotency_keys table'
  );
  assert.match(
    sql,
    /CONSTRAINT uq_idempotency_org_key UNIQUE \s*\(organization_id,\s*idempotency_key\)/,
    'Must enforce UNIQUE constraint on (organization_id, idempotency_key)'
  );
  assert.match(sql, /payload_hash VARCHAR\(64\) NOT NULL/, 'Must store payload_hash');
  assert.match(sql, /ALTER TABLE public\.idempotency_keys ENABLE ROW LEVEL SECURITY;/);

  // 2. Function definition with SECURITY INVOKER (NOT SECURITY DEFINER)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.execute_bulk_checkout/);
  assert.match(sql, /SECURITY INVOKER/, 'Must use SECURITY INVOKER');
  assert.doesNotMatch(sql, /SECURITY DEFINER/, 'Must NOT use SECURITY DEFINER');
  assert.match(sql, /SET search_path = public\b/, 'Must set search_path = public');

  // 3. Concurrency safety: transaction-level advisory lock & deterministic row ordering
  assert.match(
    sql,
    /PERFORM pg_advisory_xact_lock\(hashtext\(p_organization_id::text \|\| ':execute_bulk_checkout:' \|\| p_idempotency_key\)\);/,
    'Must acquire pg_advisory_xact_lock on org + idempotency key'
  );
  assert.match(
    sql,
    /ORDER BY id ASC\s+FOR UPDATE/,
    'Must acquire pessimistic row lock with deterministic ORDER BY id ASC FOR UPDATE'
  );

  // 4. Idempotency validation & payload mismatch exception
  assert.match(
    sql,
    /RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH:/,
    'Must raise exception when idempotency key is reused with different payload'
  );
  assert.match(
    sql,
    /jsonb_build_object\('idempotent_replay',\s*true\)/,
    'Must return cached payload with idempotent_replay: true'
  );

  // 5. Active transfer safety guard aligns with transfer request check constraint
  assert.match(
    sql,
    /UPPER\(TRIM\(status\)\) IN \('PENDING',\s*'APPROVED',\s*'IN_TRANSIT'\)/,
    'Must check uppercase transfer request statuses IN (PENDING, APPROVED, IN_TRANSIT)'
  );
  assert.match(
    sql,
    /RAISE EXCEPTION 'ASSET_IN_ACTIVE_TRANSFER'/,
    'Must raise ASSET_IN_ACTIVE_TRANSFER when active transfer request exists'
  );

  // 6. Domain business rule guards
  assert.match(sql, /ASSET_LOCKED:/, 'Must block locked assets');
  assert.match(sql, /SAFETY_EXPIRED:/, 'Must block expired safety inspection assets');
  assert.match(sql, /ASSET_NOT_AVAILABLE:/, 'Must reject assets not in available/in_stock status');
  assert.match(sql, /ASSET_ALREADY_ASSIGNED:/, 'Must block already-assigned worker assets');
  assert.match(sql, /ASSET_NOT_FOUND_OR_TENANT_MISMATCH/, 'Must enforce strict tenant isolation');

  // 7. Notes cleanliness: NO [req:...] tags anywhere in SQL
  assert.doesNotMatch(
    sql,
    /\[req:/,
    'SQL migration must NOT append or inspect [req:...] in custody_ledger.notes'
  );

  // 8. Atomic transaction hygiene (no COMMIT/ROLLBACK inside plpgsql)
  assert.doesNotMatch(sql, /\bCOMMIT\b/, 'PostgreSQL functions must not contain manual COMMIT');
  assert.doesNotMatch(sql, /\bROLLBACK\b/, 'PostgreSQL functions must not contain manual ROLLBACK');
});

test('Atomic Bulk Checkout Schema - Idempotency & Validation Contract', () => {
  const validPayload = {
    assetIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    workerName: 'אחמד סאלח',
    workerPhone: '0501234567',
    expectedReturnDate: '2026-11-15T10:00:00Z',
    signatureData: 'data:image/svg+xml;base64,mock',
    signatureSvg: '<svg></svg>',
    requestId: 'req-unique-uuid-1234',
    idempotencyKey: 'idemp-key-5678',
    warehouseId: 'wh-main-01',
    accessories: {
      '11111111-1111-1111-1111-111111111111': {
        batteriesCount: 2,
        hasCharger: true,
        hasCase: true,
      },
    },
  };

  const parsed = BulkCheckoutSchema.safeParse(validPayload);
  assert.ok(parsed.success, 'Schema must parse valid payload');
  assert.equal(parsed.data.requestId, 'req-unique-uuid-1234');
  assert.equal(parsed.data.idempotencyKey, 'idemp-key-5678');
  assert.equal(parsed.data.warehouseId, 'wh-main-01');
  assert.equal(parsed.data.signatureSvg, '<svg></svg>');

  // Missing workerName must be rejected
  const invalidWorker = BulkCheckoutSchema.safeParse({ ...validPayload, workerName: 'a' });
  assert.equal(invalidWorker.success, false);

  // Empty assetIds must be rejected
  const emptyAssets = BulkCheckoutSchema.safeParse({ ...validPayload, assetIds: [] });
  assert.equal(emptyAssets.success, false);
});

test('Payload Hash Computation - Deterministic and Order-Independent', async () => {
  const baseParams = {
    assetIds: [
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
    ],
    organizationId: 'org-tenant-uuid-1',
    warehouseId: 'wh-main-uuid-1',
    workerName: 'יוסי כהן',
    workerPhone: '052-1112233',
    expectedReturnDate: '2026-11-20T17:00:00.000Z',
  };

  // 1. Order independence
  const reversedParams = {
    ...baseParams,
    assetIds: [
      '33333333-3333-3333-3333-333333333333',
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
  };

  const hash1 = computeCheckoutPayloadHash(baseParams);
  const hash2 = computeCheckoutPayloadHash(reversedParams);
  assert.equal(hash1, hash2, 'Hash must be identical regardless of assetIds order');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'Must be a 64-character SHA-256 hex string');

  // 2. Integration with custody.ts: verify custody.ts invokes computeCheckoutPayloadHash
  const custodyCode = fs.readFileSync('src/app/actions/custody.ts', 'utf8');
  assert.match(
    custodyCode,
    /computeCheckoutPayloadHash/,
    'src/app/actions/custody.ts must import and execute computeCheckoutPayloadHash'
  );
  assert.match(
    custodyCode,
    /p_payload_hash:\s*payloadHash/,
    'src/app/actions/custody.ts must pass p_payload_hash to execute_bulk_checkout RPC'
  );

  // 3. Hash changes when any tool ID changes
  const changedAssetParams = {
    ...baseParams,
    assetIds: ['44444444-4444-4444-4444-444444444444', ...baseParams.assetIds.slice(1)],
  };
  assert.notEqual(
    computeCheckoutPayloadHash(changedAssetParams),
    hash1,
    'Hash must change when asset IDs change'
  );

  // 4. Hash changes when worker changes
  const changedWorkerParams = {
    ...baseParams,
    workerName: 'דני לוי',
  };
  assert.notEqual(
    computeCheckoutPayloadHash(changedWorkerParams),
    hash1,
    'Hash must change when worker changes'
  );

  // 5. Hash changes when organization changes
  const changedOrgParams = {
    ...baseParams,
    organizationId: 'org-tenant-uuid-2',
  };
  assert.notEqual(
    computeCheckoutPayloadHash(changedOrgParams),
    hash1,
    'Hash must change when organization changes'
  );
});

test('Idempotency Contract Simulation - Payload Mismatch vs Replay', () => {
  const orgId = 'org-tenant-uuid-1';
  const idempotencyKey = 'idemp-checkout-tx-001';

  // Simulated in-memory idempotency table
  const idempotencyTable = new Map();

  function simulateRpcExecution(params) {
    const lockKey = `${params.organizationId}:execute_bulk_checkout:${params.idempotencyKey}`;
    const payloadHash = computeCheckoutPayloadHash(params);

    if (idempotencyTable.has(lockKey)) {
      const existing = idempotencyTable.get(lockKey);
      if (existing.payloadHash !== payloadHash) {
        throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH: Request ID already used with different parameters');
      }
      return {
        ...existing.response,
        idempotent_replay: true,
      };
    }

    const response = {
      success: true,
      count: params.assetIds.length,
      assets: params.assetIds.map((id) => ({ id, status: 'checked_out' })),
    };

    idempotencyTable.set(lockKey, {
      payloadHash,
      response,
    });

    return response;
  }

  const initialParams = {
    assetIds: ['11111111-1111-1111-1111-111111111111'],
    organizationId: orgId,
    idempotencyKey,
    workerName: 'דוד לוי',
    expectedReturnDate: '2026-11-20T17:00:00Z',
  };

  // Initial execution
  const firstResult = simulateRpcExecution(initialParams);
  assert.equal(firstResult.success, true);
  assert.equal(firstResult.idempotent_replay, undefined);

  // Replay with identical parameters (network retry)
  const replayResult = simulateRpcExecution(initialParams);
  assert.equal(replayResult.success, true);
  assert.equal(replayResult.idempotent_replay, true, 'Must return idempotent replay');

  // Re-use same idempotency key with different worker (must reject)
  assert.throws(
    () => {
      simulateRpcExecution({
        ...initialParams,
        workerName: 'עובד אחר',
      });
    },
    /IDEMPOTENCY_PAYLOAD_MISMATCH/,
    'Must throw IDEMPOTENCY_PAYLOAD_MISMATCH on modified payload'
  );

  // Re-use same idempotency key with different tool IDs (must reject)
  assert.throws(
    () => {
      simulateRpcExecution({
        ...initialParams,
        assetIds: ['99999999-9999-9999-9999-999999999999'],
      });
    },
    /IDEMPOTENCY_PAYLOAD_MISMATCH/,
    'Must throw IDEMPOTENCY_PAYLOAD_MISMATCH on different tools'
  );
});

test('Clean Ledger Notes - No [req:...] tags in custody actions', () => {
  const custodyActionsCode = fs.readFileSync('src/app/actions/custody.ts', 'utf8');

  // Assert no [req: tags are created or searched in custody.ts
  assert.doesNotMatch(
    custodyActionsCode,
    /\[req:/,
    'src/app/actions/custody.ts must not construct or query [req:...] notes'
  );
});
