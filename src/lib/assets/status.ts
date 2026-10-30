import type { AssetStatus } from '@/types/domain';

/**
 * The single canonical status representing an unassigned asset
 * physically present in a warehouse, ready for dispatch, checkout, or transfer.
 */
export const CANONICAL_AVAILABLE_STATUS: AssetStatus = 'available';

/**
 * All status strings that represent an available / in-warehouse asset,
 * including the legacy alias 'in_stock' for backwards compatibility.
 */
export const AVAILABLE_STATUSES: readonly string[] = ['available', 'in_stock'];

/**
 * Checks whether an asset status indicates the asset is available in inventory / warehouse
 * and ready for checkout, dispatch, or transfer.
 * Treats canonical 'available' and legacy 'in_stock' as equivalent.
 */
export function isAssetAvailable(status?: string | null): boolean {
  if (!status) return false;
  return status === 'available' || status === 'in_stock';
}

/**
 * Checks whether an asset status indicates the asset is currently checked out to a worker.
 */
export function isAssetCheckedOut(status?: string | null): boolean {
  if (!status) return false;
  return status === 'checked_out' || status === 'in_use';
}

/**
 * Checks whether an asset status indicates the asset is in maintenance or repair.
 */
export function isAssetInMaintenance(status?: string | null): boolean {
  if (!status) return false;
  return status === 'maintenance' || status === 'needs_repair';
}

/**
 * Checks whether an asset status indicates the asset is currently in transit.
 */
export function isAssetInTransit(status?: string | null): boolean {
  return status === 'in_transit';
}

/**
 * Checks whether an asset status indicates the asset is retired or lost.
 */
export function isAssetRetired(status?: string | null): boolean {
  return status === 'retired' || status === 'lost';
}

/**
 * Normalizes legacy status aliases into canonical statuses.
 * e.g., 'in_stock' -> 'available'
 */
export function normalizeAssetStatus(status?: string | null): AssetStatus {
  if (!status) return CANONICAL_AVAILABLE_STATUS;
  if (status === 'in_stock') return 'available';
  if (status === 'in_use') return 'checked_out';
  if (status === 'needs_repair') return 'maintenance';
  return status as AssetStatus;
}

export interface AssetCheckoutEligibilityCheck {
  id?: string;
  status?: string | null;
  organizationId?: string | null;
  organization_id?: string | null;
  isLocked?: boolean | null;
  is_locked?: boolean | null;
  lockReason?: string | null;
  lock_reason?: string | null;
  safetyInspectionDue?: string | null;
  safety_inspection_due?: string | null;
  currentAssignedWorker?: string | null;
  current_assigned_worker?: string | null;
  inTransit?: boolean | null;
}

export interface CheckoutEligibilityResult {
  eligible: boolean;
  code:
    | 'OK'
    | 'ORGANIZATION_MISMATCH'
    | 'ADMINISTRATIVELY_LOCKED'
    | 'SAFETY_INSPECTION_OVERDUE'
    | 'ALREADY_ASSIGNED'
    | 'IN_TRANSIT'
    | 'STATUS_UNAVAILABLE';
  error?: string;
}

/**
 * Validates whether an asset is eligible for checkout according to all business rules:
 * - Active tenant organization match
 * - Administrative lock status
 * - Periodic safety inspection validity
 * - Worker assignment (must not already be assigned)
 * - Transit flag (must not be in transit)
 * - Status availability ('available' or legacy 'in_stock')
 */
export function evaluateCheckoutEligibility(
  asset: AssetCheckoutEligibilityCheck,
  activeOrgId?: string,
  nowMs: number = Date.now()
): CheckoutEligibilityResult {
  const org = asset.organizationId || asset.organization_id;
  if (activeOrgId && org && org !== activeOrgId) {
    return {
      eligible: false,
      code: 'ORGANIZATION_MISMATCH',
      error: 'לא ניתן לנפק ציוד שאינו שייך לארגון הפעיל',
    };
  }

  const isLocked = Boolean(asset.isLocked ?? asset.is_locked);
  if (isLocked) {
    const reason = asset.lockReason || asset.lock_reason || 'נעול להוצאה מהמחסן';
    return {
      eligible: false,
      code: 'ADMINISTRATIVELY_LOCKED',
      error: `הכלי נעול מנהלית: ${reason}`,
    };
  }

  const safetyDue = asset.safetyInspectionDue || asset.safety_inspection_due;
  if (safetyDue) {
    const dueTime = new Date(safetyDue).getTime();
    if (!isNaN(dueTime) && dueTime < nowMs) {
      return {
        eligible: false,
        code: 'SAFETY_INSPECTION_OVERDUE',
        error: '⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית',
      };
    }
  }

  const assignedWorker = asset.currentAssignedWorker || asset.current_assigned_worker;
  if (assignedWorker && assignedWorker.trim().length > 0) {
    return {
      eligible: false,
      code: 'ALREADY_ASSIGNED',
      error: `הכלי כבר משויך לעובד: ${assignedWorker}`,
    };
  }

  if (asset.inTransit || asset.status === 'in_transit') {
    return {
      eligible: false,
      code: 'IN_TRANSIT',
      error: 'הכלי נמצא כעת בשינוע פעיל בין אתרים ולא ניתן לנפקו',
    };
  }

  if (!isAssetAvailable(asset.status)) {
    return {
      eligible: false,
      code: 'STATUS_UNAVAILABLE',
      error: 'הכלי אינו זמין במלאי לניפוק',
    };
  }

  return { eligible: true, code: 'OK' };
}

/**
 * Computes the state update for an asset when physical transfer reception is confirmed.
 * Sets the canonical 'available' status, updates warehouse location, and unassigns any worker.
 */
export function applyTransferReceptionTransition<
  T extends {
    status?: string | null;
    current_warehouse_id?: string | null;
    current_assigned_worker?: string | null;
    inTransit?: boolean | null;
  }
>(
  asset: T,
  targetWarehouseId: string
): T & {
  status: typeof CANONICAL_AVAILABLE_STATUS;
  current_warehouse_id: string;
  current_assigned_worker: null;
  inTransit: false;
} {
  return {
    ...asset,
    status: CANONICAL_AVAILABLE_STATUS,
    current_warehouse_id: targetWarehouseId,
    current_assigned_worker: null,
    inTransit: false,
  };
}


