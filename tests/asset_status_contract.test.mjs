import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_AVAILABLE_STATUS,
  AVAILABLE_STATUSES,
  isAssetAvailable,
  isAssetCheckedOut,
  isAssetInMaintenance,
  isAssetInTransit,
  isAssetRetired,
  normalizeAssetStatus,
  evaluateCheckoutEligibility,
  applyTransferReceptionTransition,
} from '../src/lib/assets/status.ts';

test('Asset Status Contract - Constants', () => {
  assert.equal(CANONICAL_AVAILABLE_STATUS, 'available');
  assert.ok(AVAILABLE_STATUSES.includes('available'));
  assert.ok(AVAILABLE_STATUSES.includes('in_stock'));
  assert.equal(AVAILABLE_STATUSES.length, 2);
});

test('Asset Status Contract - isAssetAvailable predicate', () => {
  // Available / In-Stock
  assert.equal(isAssetAvailable('available'), true);
  assert.equal(isAssetAvailable('in_stock'), true);

  // Non-available statuses
  assert.equal(isAssetAvailable('checked_out'), false);
  assert.equal(isAssetAvailable('in_use'), false);
  assert.equal(isAssetAvailable('in_transit'), false);
  assert.equal(isAssetAvailable('maintenance'), false);
  assert.equal(isAssetAvailable('needs_repair'), false);
  assert.equal(isAssetAvailable('retired'), false);
  assert.equal(isAssetAvailable('lost'), false);

  // Falsy / Empty inputs
  assert.equal(isAssetAvailable(''), false);
  assert.equal(isAssetAvailable(null), false);
  assert.equal(isAssetAvailable(undefined), false);
});

test('Asset Status Contract - normalizeAssetStatus', () => {
  assert.equal(normalizeAssetStatus('in_stock'), 'available');
  assert.equal(normalizeAssetStatus('available'), 'available');
  assert.equal(normalizeAssetStatus('in_use'), 'checked_out');
  assert.equal(normalizeAssetStatus('needs_repair'), 'maintenance');
  assert.equal(normalizeAssetStatus('checked_out'), 'checked_out');
  assert.equal(normalizeAssetStatus('maintenance'), 'maintenance');
  assert.equal(normalizeAssetStatus('in_transit'), 'in_transit');
  assert.equal(normalizeAssetStatus('retired'), 'retired');
  assert.equal(normalizeAssetStatus(null), 'available');
  assert.equal(normalizeAssetStatus(''), 'available');
});

test('Asset Status Contract - other status predicates', () => {
  // Checked Out
  assert.equal(isAssetCheckedOut('checked_out'), true);
  assert.equal(isAssetCheckedOut('in_use'), true);
  assert.equal(isAssetCheckedOut('available'), false);
  assert.equal(isAssetCheckedOut(null), false);

  // Maintenance
  assert.equal(isAssetInMaintenance('maintenance'), true);
  assert.equal(isAssetInMaintenance('needs_repair'), true);
  assert.equal(isAssetInMaintenance('available'), false);
  assert.equal(isAssetInMaintenance(null), false);

  // In Transit
  assert.equal(isAssetInTransit('in_transit'), true);
  assert.equal(isAssetInTransit('available'), false);
  assert.equal(isAssetInTransit(null), false);

  // Retired
  assert.equal(isAssetRetired('retired'), true);
  assert.equal(isAssetRetired('lost'), true);
  assert.equal(isAssetRetired('available'), false);
  assert.equal(isAssetRetired(null), false);
});

test('Regression Scenario - Custody checkout eligibility', () => {
  const currentAssets = [
    { id: '1', name: 'Drill 1', status: 'available' },
    { id: '2', name: 'Saw 1', status: 'in_stock' }, // legacy DB record
  ];

  const unavailable = currentAssets.filter((a) => !isAssetAvailable(a.status));
  assert.equal(unavailable.length, 0, 'Both available and in_stock must be eligible for checkout');

  const mixedAssets = [
    { id: '1', name: 'Drill 1', status: 'available' },
    { id: '2', name: 'Drill 2', status: 'in_transit' },
    { id: '3', name: 'Drill 3', status: 'maintenance' },
  ];
  const unavailableMixed = mixedAssets.filter((a) => !isAssetAvailable(a.status));
  assert.equal(unavailableMixed.length, 2, 'In-transit and maintenance must be rejected for checkout');
});

test('Regression Scenario - Catalog view filtering and counting', () => {
  const warehouseAssets = [
    { id: '1', name: 'Hammer', status: 'available' },
    { id: '2', name: 'Drill', status: 'in_stock' },
    { id: '3', name: 'Wrench', status: 'checked_out' },
    { id: '4', name: 'Ladder', status: 'maintenance' },
  ];

  const availableCount = warehouseAssets.filter((a) => isAssetAvailable(a.status)).length;
  assert.equal(availableCount, 2, 'Available count must count both available and in_stock');

  const statusFilter = 'available';
  const filtered = warehouseAssets.filter((a) => {
    if (statusFilter === 'available') {
      return isAssetAvailable(a.status);
    }
    return true;
  });

  assert.equal(filtered.length, 2);
  assert.deepEqual(filtered.map((a) => a.id), ['1', '2']);
});

test('Regression Scenario - QuickOnboard rapid dispatch mode', () => {
  const availableAsset = { id: '1', status: 'available' };
  const inStockAsset = { id: '2', status: 'in_stock' };
  const checkedOutAsset = { id: '3', status: 'checked_out' };

  assert.equal(isAssetAvailable(availableAsset.status), true, 'Available asset can be rapid dispatched');
  assert.equal(isAssetAvailable(inStockAsset.status), true, 'Legacy in_stock asset can be rapid dispatched');
  assert.equal(isAssetAvailable(checkedOutAsset.status), false, 'Checked out asset must pause scanner');
});

test('Regression Scenario - Outbound transfer selection includes both statuses', () => {
  const mockAssets = [
    { id: '1', status: 'available', warehouseId: 'wh-1' },
    { id: '2', status: 'in_stock', warehouseId: 'wh-1' },
    { id: '3', status: 'checked_out', warehouseId: 'wh-1' },
  ];

  const candidates = mockAssets.filter((a) => a.warehouseId === 'wh-1' && isAssetAvailable(a.status));
  assert.equal(candidates.length, 2, 'Outbound transfer candidates must include both available and in_stock');
  assert.deepEqual(candidates.map((c) => c.id), ['1', '2']);
});

test('Regression Scenario - Transfer reception changes in_transit to available and enables checkout', () => {
  const inTransitAsset = {
    id: 'asset-trans-01',
    status: 'in_transit',
    current_warehouse_id: 'wh-source',
    current_assigned_worker: null,
    inTransit: true,
  };

  // 1. Before reception: asset is in transit, checkout must be rejected
  const preCheck = evaluateCheckoutEligibility(inTransitAsset);
  assert.equal(preCheck.eligible, false);
  assert.equal(preCheck.code, 'IN_TRANSIT');

  // 2. Physical reception confirmed at target warehouse
  const receivedAsset = applyTransferReceptionTransition(inTransitAsset, 'wh-destination');
  assert.equal(receivedAsset.status, CANONICAL_AVAILABLE_STATUS);
  assert.equal(receivedAsset.current_warehouse_id, 'wh-destination');
  assert.equal(receivedAsset.current_assigned_worker, null);

  // 3. After reception: asset is now fully eligible for checkout
  const postCheck = evaluateCheckoutEligibility(receivedAsset);
  assert.equal(postCheck.eligible, true);
  assert.equal(postCheck.code, 'OK');
});

test('Regression Scenario - Legacy in_stock asset with administrative lock is rejected', () => {
  const lockedInStockAsset = {
    id: 'asset-lock-01',
    status: 'in_stock',
    is_locked: true,
    lock_reason: 'בדיקת מלאי שנתית - כלי נעול זמנית',
  };

  // Status predicate alone considers in_stock available
  assert.equal(isAssetAvailable(lockedInStockAsset.status), true);

  // Full checkout validation MUST reject the locked tool
  const result = evaluateCheckoutEligibility(lockedInStockAsset);
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'ADMINISTRATIVELY_LOCKED');
  assert.ok(result.error?.includes('בדיקת מלאי שנתית'));
});

test('Regression Scenario - in_stock asset with expired safety inspection is rejected', () => {
  const expiredSafetyAsset = {
    id: 'asset-safety-01',
    status: 'in_stock',
    safety_inspection_due: '2026-01-01T00:00:00Z',
  };

  // Status predicate alone considers in_stock available
  assert.equal(isAssetAvailable(expiredSafetyAsset.status), true);

  // Full checkout validation MUST reject due to safety expiration
  const result = evaluateCheckoutEligibility(expiredSafetyAsset, undefined, Date.parse('2026-10-30T12:00:00Z'));
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'SAFETY_INSPECTION_OVERDUE');
  assert.ok(result.error?.includes('בדיקת בטיחות תקופתית'));
});

test('Regression Scenario - in_stock and available assets with active transit or worker assignment are rejected', () => {
  for (const st of ['in_stock', 'available']) {
    // Case A: Flagged in transit despite available/in_stock status
    const inTransitAsset = {
      id: `asset-transit-${st}`,
      status: st,
      inTransit: true,
    };
    const transitResult = evaluateCheckoutEligibility(inTransitAsset);
    assert.equal(transitResult.eligible, false);
    assert.equal(transitResult.code, 'IN_TRANSIT');

    // Case B: Worker assigned despite available/in_stock status
    const assignedAsset = {
      id: `asset-assigned-${st}`,
      status: st,
      current_assigned_worker: 'מוחמד זועבי',
    };
    const assignedResult = evaluateCheckoutEligibility(assignedAsset);
    assert.equal(assignedResult.eligible, false);
    assert.equal(assignedResult.code, 'ALREADY_ASSIGNED');

    // Case C: Belongs to different organization
    const foreignAsset = {
      id: `asset-foreign-${st}`,
      status: st,
      organization_id: 'org-external-001',
    };
    const foreignResult = evaluateCheckoutEligibility(foreignAsset, 'org-active-001');
    assert.equal(foreignResult.eligible, false);
    assert.equal(foreignResult.code, 'ORGANIZATION_MISMATCH');
  }
});

