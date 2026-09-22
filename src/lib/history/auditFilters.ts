import type { DamageReport, GpsCoordinates } from '@/types/domain';

export type AuditActionType =
  | 'CHECKOUT'
  | 'CHECKIN'
  | 'TRANSFER_INIT'
  | 'TRANSFER_RECEIVE'
  | 'MAINTENANCE_FLAG'
  | 'ONBOARD'
  | 'LOCK_STATUS'
  | 'SAFETY_INSPECTION';

export interface AuditHistoryRecord {
  id: string;
  assetId: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  action: AuditActionType;
  performedBy: string;
  targetWorker: string | null;
  workerPhone: string | null;
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired' | null;
  warehouseId: string | null;
  warehouseName: string;
  warehouseCode: string;
  notes: string | null;
  createdAt: string;
  organizationId?: string;
  expectedReturnDate?: string | null;
  signatureData?: string | null;
  isTagVerified?: boolean | null;
  signedAt?: string | null;
  accessoriesSnapshot?: {
    batteriesCount: number;
    hasCharger: boolean;
    hasCase: boolean;
  } | null;
  gps?: GpsCoordinates | null;
  damageReport?: DamageReport | null;
}

export type AuditDateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';

export interface AuditHistoryFilters {
  action?: string;
  actionType?: 'ALL' | 'CHECKOUT' | 'CHECKIN' | 'TRANSFER_INIT' | 'TRANSFER_RECEIVE' | 'MAINTENANCE_FLAG' | string;
  warehouseId?: string;
  searchQuery?: string;
  hasSignature?: boolean;
  dateRange?: AuditDateRange;
  startDate?: string;
  endDate?: string;
}

export interface AuditHistoryPayload {
  records: AuditHistoryRecord[];
  totalCount: number;
  warehouses: Array<{ id: string; name: string; code: string }>;
}

/**
 * Validates whether a record's createdAt timestamp falls within the specified date range.
 */
export function isWithinDateRange(
  dateStr: string,
  dateRange?: AuditDateRange,
  startDate?: string,
  endDate?: string
): boolean {
  if (!dateRange || dateRange === 'all') return true;

  const recordTime = new Date(dateStr).getTime();
  if (isNaN(recordTime)) return true;

  const now = new Date();

  if (dateRange === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return recordTime >= startOfToday;
  }

  if (dateRange === 'yesterday') {
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return recordTime >= startOfYesterday && recordTime < startOfToday;
  }

  if (dateRange === 'week') {
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0).getTime();
    return recordTime >= weekAgo;
  }

  if (dateRange === 'month') {
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0).getTime();
    return recordTime >= monthAgo;
  }

  if (dateRange === 'custom') {
    let valid = true;
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      valid = valid && recordTime >= s.getTime();
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      valid = valid && recordTime <= e.getTime();
    }
    return valid;
  }

  return true;
}

/**
 * Multi-field smart search across:
 * - Tool Tag Number (e.g. numeric "960" matches qrCode or tag_number)
 * - Worker Name & Worker Phone
 * - Performed By (Supervisor/Storekeeper)
 * - Notes & Remarks
 * - Tool Name, Brand & Model Number
 */
export function matchesSmartSearch(record: AuditHistoryRecord, query?: string): boolean {
  if (!query || !query.trim()) return true;

  const q = query.toLowerCase().trim();

  // 1. Tool Tag Number / QR (handles numeric e.g. "960" matching "ZR-0960" or "960")
  if (record.qrCode && record.qrCode.toLowerCase().includes(q)) return true;

  // 2. Worker Name & Worker Phone
  if (record.targetWorker && record.targetWorker.toLowerCase().includes(q)) return true;
  if (record.workerPhone && record.workerPhone.toLowerCase().includes(q)) return true;

  // 3. Performed By (Supervisor / Storekeeper)
  if (record.performedBy && record.performedBy.toLowerCase().includes(q)) return true;

  // 4. Notes & Remarks
  if (record.notes && record.notes.toLowerCase().includes(q)) return true;

  // 5. Tool Model, Name & Brand
  if (record.toolName && record.toolName.toLowerCase().includes(q)) return true;
  if (record.brand && record.brand.toLowerCase().includes(q)) return true;
  if (record.modelNumber && record.modelNumber.toLowerCase().includes(q)) return true;

  // 6. Facility / Warehouse name & code
  if (record.warehouseName && record.warehouseName.toLowerCase().includes(q)) return true;
  if (record.warehouseCode && record.warehouseCode.toLowerCase().includes(q)) return true;

  return false;
}

/**
 * Comprehensive in-memory filter matching all AuditHistoryFilters options.
 */
export function filterAuditHistoryRecords(
  records: AuditHistoryRecord[],
  filters?: AuditHistoryFilters
): AuditHistoryRecord[] {
  if (!filters) return records;

  let result = records;

  // 1. Action Type Filter
  const targetAction =
    filters.actionType && filters.actionType !== 'ALL' && filters.actionType !== 'all'
      ? filters.actionType
      : filters.action && filters.action !== 'all' && filters.action !== 'ALL'
      ? filters.action
      : undefined;

  if (targetAction) {
    if (targetAction === 'TRANSFERS') {
      result = result.filter(
        (r) => r.action === 'TRANSFER_INIT' || r.action === 'TRANSFER_RECEIVE'
      );
    } else {
      result = result.filter((r) => r.action === targetAction);
    }
  }

  // 2. Warehouse Filter
  if (filters.warehouseId && filters.warehouseId !== 'all') {
    result = result.filter((r) => r.warehouseId === filters.warehouseId);
  }

  // 3. Digital Signature Verification Filter
  if (filters.hasSignature === true) {
    result = result.filter((r) => Boolean(r.signatureData));
  }

  // 4. Date Range Filter
  if (filters.dateRange && filters.dateRange !== 'all') {
    result = result.filter((r) =>
      isWithinDateRange(r.createdAt, filters.dateRange, filters.startDate, filters.endDate)
    );
  }

  // 5. Multi-field Smart Search
  if (filters.searchQuery && filters.searchQuery.trim()) {
    result = result.filter((r) => matchesSmartSearch(r, filters.searchQuery));
  }

  return result;
}
