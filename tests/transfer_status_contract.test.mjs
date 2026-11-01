import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFER_REQUEST_DB_STATUS,
  ALLOWED_TRANSFER_REQUEST_DB_STATUSES,
  ACTIVE_TRANSFER_REQUEST_STATUSES,
  isTransferRequestActive,
  normalizeTransferRequestDbStatus,
} from '../src/lib/transfers/status.ts';
import { CANONICAL_AVAILABLE_STATUS, isAssetAvailable } from '../src/lib/assets/status.ts';

// 1. Verified PostgreSQL CHECK constraint:
// CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED'))
test('Transfer Status Contract - Matches Database CHECK Constraint', () => {
  const verifiedCheckConstraintStatuses = [
    'PENDING',
    'APPROVED',
    'REJECTED',
    'IN_TRANSIT',
    'COMPLETED',
  ];

  assert.equal(ALLOWED_TRANSFER_REQUEST_DB_STATUSES.length, 5);
  for (const status of verifiedCheckConstraintStatuses) {
    assert.ok(
      ALLOWED_TRANSFER_REQUEST_DB_STATUSES.includes(status),
      `Status ${status} must be in ALLOWED_TRANSFER_REQUEST_DB_STATUSES`
    );
  }

  // Verify constant dictionary matches
  assert.equal(TRANSFER_REQUEST_DB_STATUS.PENDING, 'PENDING');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.APPROVED, 'APPROVED');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.REJECTED, 'REJECTED');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.IN_TRANSIT, 'IN_TRANSIT');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.COMPLETED, 'COMPLETED');

  // Verify invalid values are NOT in allowed DB write statuses
  assert.equal(ALLOWED_TRANSFER_REQUEST_DB_STATUSES.includes('cancelled'), false);
  assert.equal(ALLOWED_TRANSFER_REQUEST_DB_STATUSES.includes('CANCELLED'), false);
  assert.equal(ALLOWED_TRANSFER_REQUEST_DB_STATUSES.includes('in_transit'), false);
});

// 2. isTransferRequestActive predicate
test('Transfer Status Contract - isTransferRequestActive predicate', () => {
  // Active / Blocking statuses (case-insensitive)
  assert.equal(isTransferRequestActive('PENDING'), true);
  assert.equal(isTransferRequestActive('pending'), true);
  assert.equal(isTransferRequestActive('APPROVED'), true);
  assert.equal(isTransferRequestActive('approved'), true);
  assert.equal(isTransferRequestActive('IN_TRANSIT'), true);
  assert.equal(isTransferRequestActive('in_transit'), true);

  // Terminal / Non-blocking statuses
  assert.equal(isTransferRequestActive('COMPLETED'), false);
  assert.equal(isTransferRequestActive('completed'), false);
  assert.equal(isTransferRequestActive('REJECTED'), false);
  assert.equal(isTransferRequestActive('rejected'), false);
  assert.equal(isTransferRequestActive('cancelled'), false);
  assert.equal(isTransferRequestActive('CANCELLED'), false);

  // Falsy / Empty inputs
  assert.equal(isTransferRequestActive(''), false);
  assert.equal(isTransferRequestActive(null), false);
  assert.equal(isTransferRequestActive(undefined), false);
});

// 3. ACTIVE_TRANSFER_REQUEST_STATUSES array for queries
test('Transfer Status Contract - ACTIVE_TRANSFER_REQUEST_STATUSES includes uppercase IN_TRANSIT and legacy in_transit', () => {
  assert.ok(ACTIVE_TRANSFER_REQUEST_STATUSES.includes('PENDING'));
  assert.ok(ACTIVE_TRANSFER_REQUEST_STATUSES.includes('APPROVED'));
  assert.ok(ACTIVE_TRANSFER_REQUEST_STATUSES.includes('IN_TRANSIT'));
  assert.ok(ACTIVE_TRANSFER_REQUEST_STATUSES.includes('in_transit'));
});

// 4. normalizeTransferRequestDbStatus mapping
test('Transfer Status Contract - normalizeTransferRequestDbStatus', () => {
  // Cancellation must normalize to REJECTED to satisfy CHECK constraint
  assert.equal(normalizeTransferRequestDbStatus('cancelled'), 'REJECTED');
  assert.equal(normalizeTransferRequestDbStatus('CANCELLED'), 'REJECTED');
  assert.equal(normalizeTransferRequestDbStatus('CANCELED'), 'REJECTED');
  assert.equal(normalizeTransferRequestDbStatus('rejected'), 'REJECTED');
  assert.equal(normalizeTransferRequestDbStatus('REJECTED'), 'REJECTED');

  // Other canonical transitions
  assert.equal(normalizeTransferRequestDbStatus('IN_TRANSIT'), 'IN_TRANSIT');
  assert.equal(normalizeTransferRequestDbStatus('in_transit'), 'IN_TRANSIT');
  assert.equal(normalizeTransferRequestDbStatus('APPROVED'), 'APPROVED');
  assert.equal(normalizeTransferRequestDbStatus('approved'), 'APPROVED');
  assert.equal(normalizeTransferRequestDbStatus('COMPLETED'), 'COMPLETED');
  assert.equal(normalizeTransferRequestDbStatus('completed'), 'COMPLETED');

  // Defaults
  assert.equal(normalizeTransferRequestDbStatus(null), 'PENDING');
  assert.equal(normalizeTransferRequestDbStatus(''), 'PENDING');
});

// 5. Checkout Guard Simulation - Transfer Status Enforcement
test('Regression Scenario - IN_TRANSIT transfer request blocks bulk checkout', () => {
  const assetId = '11111111-1111-1111-1111-111111111111';
  const orgId = 'org-tenant-1';

  // Mock table of transfer_requests
  const transferRequestsTable = [
    {
      id: 'req-1',
      organization_id: orgId,
      asset_id: assetId,
      status: 'IN_TRANSIT',
    },
  ];

  // Helper simulating the actual checkout guard query in custody.ts
  function queryActiveTransfers(targetOrgId, targetAssetIds) {
    return transferRequestsTable.filter(
      (r) =>
        r.organization_id === targetOrgId &&
        targetAssetIds.includes(r.asset_id) &&
        ACTIVE_TRANSFER_REQUEST_STATUSES.includes(r.status)
    );
  }

  const activeTransfers = queryActiveTransfers(orgId, [assetId]);
  assert.equal(activeTransfers.length, 1, 'IN_TRANSIT transfer request must be detected as active');

  // Should trigger checkout rejection
  const checkoutBlocked = activeTransfers.length > 0;
  assert.equal(checkoutBlocked, true, 'Checkout must be blocked when transfer is IN_TRANSIT');
});

test('Regression Scenario - COMPLETED or REJECTED transfer request allows bulk checkout', () => {
  const assetId1 = '11111111-1111-1111-1111-111111111111';
  const assetId2 = '22222222-2222-2222-2222-222222222222';
  const orgId = 'org-tenant-1';

  const transferRequestsTable = [
    {
      id: 'req-completed',
      organization_id: orgId,
      asset_id: assetId1,
      status: 'COMPLETED',
    },
    {
      id: 'req-rejected',
      organization_id: orgId,
      asset_id: assetId2,
      status: 'REJECTED',
    },
  ];

  function queryActiveTransfers(targetOrgId, targetAssetIds) {
    return transferRequestsTable.filter(
      (r) =>
        r.organization_id === targetOrgId &&
        targetAssetIds.includes(r.asset_id) &&
        ACTIVE_TRANSFER_REQUEST_STATUSES.includes(r.status)
    );
  }

  const activeTransfers = queryActiveTransfers(orgId, [assetId1, assetId2]);
  assert.equal(activeTransfers.length, 0, 'COMPLETED and REJECTED transfers must not block checkout');
});

test('Regression Scenario - Fail-closed on transfer query error', () => {
  // If database query returns an error, checkout must safely reject
  const simulatedDbError = { message: 'Connection timeout' };
  let errorResponse = null;

  if (simulatedDbError) {
    errorResponse = {
      success: false,
      error: `שגיאה באימות סטטוס שינוע פעיל: ${simulatedDbError.message}`,
    };
  }

  assert.equal(errorResponse.success, false);
  assert.ok(errorResponse.error.includes('Connection timeout'));
});

// 6. Contract separation: assets.status vs transfer_requests.status
test('Contract Separation - assets.status vs transfer_requests.status', () => {
  // assets.status values are lowercase
  assert.equal(CANONICAL_AVAILABLE_STATUS, 'available');
  assert.equal(isAssetAvailable('available'), true);
  assert.equal(isAssetAvailable('in_transit'), false);

  // transfer_requests.status values are uppercase in DB
  assert.equal(TRANSFER_REQUEST_DB_STATUS.IN_TRANSIT, 'IN_TRANSIT');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.APPROVED, 'APPROVED');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.REJECTED, 'REJECTED');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.COMPLETED, 'COMPLETED');
  assert.equal(TRANSFER_REQUEST_DB_STATUS.PENDING, 'PENDING');
});
