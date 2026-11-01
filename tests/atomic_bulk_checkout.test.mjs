import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BulkCheckoutSchema } from '../src/core/assets/custody.schema.ts';

test('Atomic Bulk Checkout Migration - SQL Structure & Security Audit', () => {
  const migrationPath = path.resolve('supabase/migrations/20261031_atomic_bulk_checkout_rpc.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // 1. Function definition & security definer
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.execute_bulk_checkout/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = public, pg_temp/);

  // 2. Concurrency & row-level locking
  assert.match(sql, /FROM public\.assets[\s\S]*?FOR UPDATE/, 'Must acquire pessimistic row lock with SELECT ... FOR UPDATE');

  // 3. Idempotency protection
  assert.match(sql, /p_request_id TEXT/, 'Must support idempotency request ID parameter');
  assert.match(sql, /custody_ledger[\s\S]*?notes LIKE '%\[req:'/, 'Must check custody_ledger for existing request ID');

  // 4. Input & Batch integrity
  assert.match(sql, /DUPLICATE_ASSET_IDS/, 'Must reject duplicate asset IDs in batch');
  assert.match(sql, /ASSET_NOT_FOUND/, 'Must ensure all requested asset IDs exist before proceeding');

  // 5. Active transfer safety guard
  assert.match(sql, /FROM public\.transfer_requests[\s\S]*?status IN \('PENDING', 'APPROVED', 'in_transit'\)/, 'Must block checkout if active transfer exists');

  // 6. Business rule guards
  assert.match(sql, /ORGANIZATION_MISMATCH/, 'Must enforce strict tenant isolation');
  assert.match(sql, /ADMINISTRATIVELY_LOCKED/, 'Must block administratively locked assets');
  assert.match(sql, /SAFETY_INSPECTION_OVERDUE/, 'Must block overdue safety inspection assets');
  assert.match(sql, /ALREADY_ASSIGNED/, 'Must block already-assigned worker assets');
  assert.match(sql, /STATUS_UNAVAILABLE/, 'Must reject assets not in available/in_stock status');

  // 7. Atomic transaction hygiene
  assert.doesNotMatch(sql, /\bCOMMIT\b/, 'PostgreSQL functions must not contain manual COMMIT');
  assert.doesNotMatch(sql, /\bROLLBACK\b/, 'PostgreSQL functions must not contain manual ROLLBACK');

  // 8. Least privilege security model
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.execute_bulk_checkout[\s\S]*?FROM PUBLIC;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.execute_bulk_checkout[\s\S]*?FROM anon;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.execute_bulk_checkout[\s\S]*?FROM authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.execute_bulk_checkout[\s\S]*?TO service_role;/, 'Must grant EXECUTE strictly to service_role');
});

test('Atomic Bulk Checkout Schema - Idempotency & Validation Contract', () => {
  // Valid payload with requestId
  const validPayload = {
    assetIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    workerName: 'אחמד סאלח',
    workerPhone: '0501234567',
    expectedReturnDate: '2026-11-15T10:00:00Z',
    signatureData: 'data:image/svg+xml;base64,mock',
    requestId: 'req-unique-uuid-1234',
    accessories: {
      '11111111-1111-1111-1111-111111111111': {
        batteriesCount: 2,
        hasCharger: true,
        hasCase: true,
      },
    },
  };

  const parsed = BulkCheckoutSchema.safeParse(validPayload);
  assert.ok(parsed.success, 'Schema must parse valid payload with requestId');
  assert.equal(parsed.data.requestId, 'req-unique-uuid-1234');

  // Missing workerName must be rejected
  const invalidWorker = BulkCheckoutSchema.safeParse({ ...validPayload, workerName: 'a' });
  assert.equal(invalidWorker.success, false);

  // Empty assetIds must be rejected
  const emptyAssets = BulkCheckoutSchema.safeParse({ ...validPayload, assetIds: [] });
  assert.equal(emptyAssets.success, false);
});

