import type { Category, Warehouse, WarehouseType, AssetCondition, AppUser } from '@/types/domain';
import type {
  PlantManagerAnalyticsPayload,
  StorekeeperOperationsPayload,
  HighRiskOverdueAsset,
  StorekeeperReturnDue,
  StorekeeperOverdueAsset,
} from '@/app/actions/dashboard';
import type {
  CatalogDataPayload,
  CatalogCategory,
  CatalogAssetItem,
} from '@/app/actions/assets';
import type {
  AuditHistoryPayload,
  AuditHistoryRecord,
  AuditHistoryFilters,
} from '@/app/actions/history';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import {
  matchesCodeSuffix,
  pickBestAssetMatch,
} from '@/lib/search/toolDictionary';

export interface WarehouseAdminItem {
  id: string;
  name: string;
  code: string;
  type: WarehouseType;
  address?: string | null;
  isActive: boolean;
  toolCount: number;
  availableCount: number;
  inUseCount: number;
  maintenanceCount: number;
}

// 1. Authoritative Standardized Warehouses (Empty for Production Operation)
export const MOCK_WAREHOUSES: Warehouse[] = [];

const warehousesStore: Warehouse[] = [];

export function getMockWarehouses(includeInactive = false): Warehouse[] {
  if (includeInactive) return [...warehousesStore];
  return warehousesStore.filter((w) => w.isActive !== false);
}

export function getMockWarehousesAdmin(): WarehouseAdminItem[] {
  return warehousesStore.map((wh) => {
    const whAssets = assetsStore.filter((a) => a.warehouseId === wh.id);
    const availableCount = whAssets.filter((a) => a.status === 'available').length;
    const inUseCount = whAssets.filter((a) => a.status === 'checked_out').length;
    const maintenanceCount = whAssets.filter((a) => a.status === 'maintenance').length;
    return {
      id: wh.id,
      name: wh.name,
      code: wh.code,
      type: wh.type || 'central_warehouse',
      address: wh.address || null,
      isActive: wh.isActive ?? true,
      toolCount: whAssets.length,
      availableCount,
      inUseCount,
      maintenanceCount,
    };
  });
}

export function addMockWarehouse(input: {
  name: string;
  code: string;
  type: WarehouseType;
  address?: string | null;
}): Warehouse {
  const newWh: Warehouse = {
    id: `wh-${input.code.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now().toString(36)}`,
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    type: input.type,
    address: input.address?.trim() || null,
    isActive: true,
  };
  warehousesStore.push(newWh);
  return newWh;
}

export function updateMockWarehouse(
  id: string,
  patch: Partial<Warehouse>
): Warehouse | null {
  const cleanId = (id || '').trim();
  const wh = warehousesStore.find(
    (w) => w.id === cleanId || (w.code && w.code.toUpperCase() === cleanId.toUpperCase())
  );
  if (!wh) return null;
  if (patch.name !== undefined) wh.name = patch.name.trim();
  if (patch.code !== undefined) wh.code = patch.code.trim().toUpperCase();
  if (patch.type !== undefined) wh.type = patch.type;
  if (patch.address !== undefined) wh.address = patch.address?.trim() || null;
  if (patch.isActive !== undefined) wh.isActive = patch.isActive;

  if (patch.name || patch.code) {
    assetsStore.forEach((a) => {
      if (a.warehouseId === wh.id || (wh.code && a.warehouseCode === wh.code)) {
        if (patch.name) a.warehouseName = patch.name.trim();
        if (patch.code) a.warehouseCode = patch.code.trim().toUpperCase();
      }
    });
  }

  return wh;
}

export function deleteMockWarehouse(targetId: string): { success: boolean; error?: string } {
  const cleanId = (targetId || '').trim();
  const targetWh = warehousesStore.find(
    (w) => w.id === cleanId || (w.code && w.code.toUpperCase() === cleanId.toUpperCase())
  );
  if (!targetWh) {
    return { success: false, error: 'המתקן לא נמצא במערכת.' };
  }

  const toolsInWarehouse = assetsStore.filter(
    (a) =>
      a.warehouseId === targetWh.id ||
      a.warehouseId === targetWh.code ||
      (targetWh.code && a.warehouseCode?.toUpperCase() === targetWh.code.toUpperCase())
  );
  if (toolsInWarehouse.length > 0) {
    return {
      success: false,
      error: 'לא ניתן למחוק מחסן המכיל כלי עבודה פעילים. יש להעביר את הכלים תחילה',
    };
  }

  const idx = warehousesStore.findIndex((w) => w.id === targetWh.id);
  if (idx !== -1) {
    warehousesStore.splice(idx, 1);
  }
  return { success: true };
}

// 2. Authoritative Standardized Categories (100% Hebrew matching catalog)
export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-weld', name: 'ריתוך והלחמה', slug: 'welding', icon: 'flame', displayOrder: 1 },
  { id: 'cat-lift', name: 'הרמה ושינוע', slug: 'lifting', icon: 'crane', displayOrder: 2 },
  { id: 'cat-cut', name: 'חיתוך וניסור', slug: 'cutting', icon: 'scissors', displayOrder: 3 },
  { id: 'cat-drill', name: 'קידוח והברגה', slug: 'drilling', icon: 'drill', displayOrder: 4 },
  { id: 'cat-meas', name: 'מדידה ופילוס', slug: 'measurement', icon: 'ruler', displayOrder: 5 },
];

export interface UnifiedAssetItem {
  id: string;
  qrCode: string;
  nfcUid?: string;
  serialNumber?: string | null;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  categoryId: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  status: 'available' | 'checked_out' | 'in_transit' | 'maintenance' | 'lost';
  condition: AssetCondition;
  currentAssignedWorker: string | null;
  workerPhone: string | null;
  version: number;
  purchaseCost: number;
  purchaseDate: string;
  warrantyUntil?: string;
  safetyInspectionDue?: string;
  isLocked?: boolean;
  lockReason?: string;
  expectedReturnDate?: string | null;
  accessories?: {
    batteriesCount: number;
    hasCharger: boolean;
    hasCase: boolean;
  } | null;
}

// 3. Authoritative Unified Assets (Empty for Production Operation)
export const MOCK_ASSETS: UnifiedAssetItem[] = [];

// 4. Authoritative Audit History Records (Empty for Production Operation)
export const MOCK_AUDIT_LOGS: AuditHistoryRecord[] = [];

// In-memory persistent arrays for local dev/preview
const assetsStore: UnifiedAssetItem[] = [];
const historyStore: AuditHistoryRecord[] = [];
export const auditStore: AuditHistoryRecord[] = historyStore;

/**
 * Get all assets from the unified mock store.
 */
export function getMockAssets(): UnifiedAssetItem[] {
  return assetsStore;
}

function toScannedAssetDetails(asset: UnifiedAssetItem): ScannedAssetDetails {
  return {
    id: asset.id,
    qrCode: asset.qrCode,
    nfcUid: asset.nfcUid,
    status: asset.status,
    condition: asset.condition,
    currentAssignedWorker: asset.currentAssignedWorker,
    currentWarehouseId: asset.warehouseId,
    warehouseName: asset.warehouseName,
    warehouseCode: asset.warehouseCode,
    toolName: asset.toolName,
    brand: asset.brand,
    modelNumber: asset.modelNumber,
    version: asset.version,
    purchaseDate: asset.purchaseDate,
    purchaseCost: asset.purchaseCost,
    warrantyUntil: asset.warrantyUntil,
    safetyInspectionDue: asset.safetyInspectionDue,
    isLocked: asset.isLocked,
    lockReason: asset.lockReason,
    expectedReturnDate: asset.expectedReturnDate,
    accessories: asset.accessories,
  };
}

/**
 * Get asset by QR code, NFC UID, or suffix resolution from unified mock store.
 * 1. Attempt exact match on qr_code, nfc_uid, or id.
 * 2. If no exact match: perform suffix matching on qr_code, serial_number, and model_number.
 * 3. If multiple match, return the exact active asset matching the facility.
 */
export function getMockAssetByQr(
  qrCode: string,
  facilityId?: string
): ScannedAssetDetails | null {
  const clean = qrCode.trim();
  if (!clean) return null;
  const cleanUpper = clean.toUpperCase();

  // 1. Exact match on qr_code, nfc_uid, id, or serial_number
  const exact = assetsStore.find(
    (a) =>
      a.qrCode.toUpperCase() === cleanUpper ||
      a.id.toUpperCase() === cleanUpper ||
      (a.nfcUid && a.nfcUid.toUpperCase() === cleanUpper) ||
      (a.serialNumber && a.serialNumber.toUpperCase() === cleanUpper)
  );
  if (exact) {
    return toScannedAssetDetails(exact);
  }

  // 2. Suffix matching on qr_code, serial_number, and model_number
  const suffixMatches = assetsStore.filter((a) => {
    return (
      matchesCodeSuffix(a.qrCode, clean) ||
      (a.serialNumber && matchesCodeSuffix(a.serialNumber, clean)) ||
      (a.modelNumber && matchesCodeSuffix(a.modelNumber, clean))
    );
  });

  if (suffixMatches.length > 0) {
    // 3. If multiple match, return the exact active asset matching the facility
    const best = pickBestAssetMatch(suffixMatches, clean, facilityId);
    if (best) {
      return toScannedAssetDetails(best);
    }
  }

  return null;
}

/**
 * Mutates an asset in the mock store and appends an audit entry to history.
 */
export function mutateMockAsset(
  qrCode: string,
  mutation: Partial<UnifiedAssetItem>,
  auditDetails?: {
    action: AuditHistoryRecord['action'];
    performedBy: string;
    targetWorker?: string | null;
    workerPhone?: string | null;
    notes?: string | null;
    signatureData?: string | null;
    damageReport?: AuditHistoryRecord['damageReport'];
  }
): ScannedAssetDetails | null {
  const asset = assetsStore.find((a) => a.qrCode === qrCode || a.id === qrCode);
  if (!asset) return null;

  Object.assign(asset, mutation, { version: (asset.version || 1) + 1 });

  // Update warehouse name/code if warehouseId changed
  if (mutation.warehouseId) {
    const wh = warehousesStore.find(
      (w) => w.id === mutation.warehouseId || w.code === mutation.warehouseId
    );
    if (wh) {
      asset.warehouseName = wh.name;
      asset.warehouseCode = wh.code;
    }
  }

  if (auditDetails) {
    const newEntry: AuditHistoryRecord = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: asset.id,
      qrCode: asset.qrCode,
      toolName: asset.toolName,
      brand: asset.brand,
      modelNumber: asset.modelNumber,
      action: auditDetails.action,
      performedBy: auditDetails.performedBy,
      targetWorker: auditDetails.targetWorker ?? asset.currentAssignedWorker,
      workerPhone: auditDetails.workerPhone ?? asset.workerPhone,
      condition: asset.condition,
      warehouseId: asset.warehouseId,
      warehouseName: asset.warehouseName,
      warehouseCode: asset.warehouseCode,
      notes: auditDetails.notes || null,
      createdAt: new Date().toISOString(),
      expectedReturnDate: asset.expectedReturnDate,
      signatureData: auditDetails.signatureData,
      accessoriesSnapshot: asset.accessories,
      damageReport: auditDetails.damageReport,
    };
    historyStore.unshift(newEntry);
  }

  return getMockAssetByQr(asset.qrCode);
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86400 * 1000).toISOString();

/**
 * Onboards a brand new tool into the mock store.
 */
export function addMockAsset(newAsset: {
  warehouseId: string;
  categoryId: string;
  qrCode: string;
  nfcUid?: string;
  toolName: string;
  brand: string;
  modelNumber?: string;
  condition: AssetCondition;
  performedBy?: string;
}): ScannedAssetDetails {
  const wh =
    warehousesStore.find((w) => w.id === newAsset.warehouseId || w.code === newAsset.warehouseId) ||
    warehousesStore[0] || {
      id: newAsset.warehouseId || 'wh-default',
      name: 'מחסן ראשי',
      code: 'WH-01',
      type: 'central_warehouse' as WarehouseType,
      address: null,
      isActive: true,
    };

  const asset: UnifiedAssetItem = {
    id: `ast-${Date.now()}`,
    qrCode: newAsset.qrCode.trim(),
    nfcUid: newAsset.nfcUid?.trim() || undefined,
    toolName: newAsset.toolName.trim(),
    brand: newAsset.brand.trim(),
    modelNumber: newAsset.modelNumber?.trim() || null,
    categoryId: newAsset.categoryId,
    warehouseId: wh.id,
    warehouseName: wh.name,
    warehouseCode: wh.code,
    status: 'available',
    condition: newAsset.condition,
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 2500, // Reasonable standard valuation for newly enrolled tools
    purchaseDate: new Date().toISOString().split('T')[0],
    warrantyUntil: daysFromNow(730).split('T')[0],
    safetyInspectionDue: daysFromNow(365).split('T')[0],
    isLocked: false,
  };

  assetsStore.push(asset);

  historyStore.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    assetId: asset.id,
    qrCode: asset.qrCode,
    toolName: asset.toolName,
    brand: asset.brand,
    modelNumber: asset.modelNumber,
    action: 'ONBOARD',
    performedBy: newAsset.performedBy || 'מחסנאי (רישום שטח)',
    targetWorker: null,
    workerPhone: null,
    condition: asset.condition,
    warehouseId: asset.warehouseId,
    warehouseName: asset.warehouseName,
    warehouseCode: asset.warehouseCode,
    notes: 'רישום כלי חדש במערכת באמצעות סורק מהיר',
    createdAt: new Date().toISOString(),
  });

  return getMockAssetByQr(asset.qrCode)!;
}

/**
 * Calculates Plant Manager Analytics strictly and dynamically from the unified store.
 * Zero discrepancies between total valuation and individual asset purchase costs.
 */
export function getMockPlantManagerAnalytics(): PlantManagerAnalyticsPayload {
  const now = Date.now();
  let totalFleetValue = 0;
  let inUse = 0;
  let inWarehouse = 0;
  let maintenance = 0;
  let overdueInspections = 0;
  let upcomingInspections = 0;
  let lockedCount = 0;

  const overdueList: HighRiskOverdueAsset[] = [];

  // Warehouse breakdown map
  const whMap: Record<
    string,
    {
      warehouseId: string;
      warehouseName: string;
      warehouseCode: string;
      totalAssets: number;
      available: number;
      checkedOut: number;
      maintenance: number;
    }
  > = {};

  warehousesStore.forEach((wh) => {
    whMap[wh.id] = {
      warehouseId: wh.id,
      warehouseName: wh.name,
      warehouseCode: wh.code,
      totalAssets: 0,
      available: 0,
      checkedOut: 0,
      maintenance: 0,
    };
  });

  assetsStore.forEach((asset) => {
    totalFleetValue += asset.purchaseCost;

    if (asset.status === 'checked_out') inUse++;
    else if (asset.status === 'available') inWarehouse++;
    else if (asset.status === 'maintenance') maintenance++;

    if (asset.isLocked) lockedCount++;

    if (asset.safetyInspectionDue) {
      const due = new Date(asset.safetyInspectionDue).getTime();
      if (due < now) overdueInspections++;
      else if (due < now + 7 * 86400 * 1000) upcomingInspections++;
    }

    if (asset.status === 'checked_out' && asset.expectedReturnDate) {
      const returnTime = new Date(asset.expectedReturnDate).getTime();
      if (returnTime < now) {
        const days = Math.max(1, Math.floor((now - returnTime) / (1000 * 60 * 60 * 24)));
        overdueList.push({
          assetId: asset.id,
          toolName: asset.toolName,
          brand: asset.brand,
          modelNumber: asset.modelNumber,
          qrCode: asset.qrCode,
          workerName: asset.currentAssignedWorker || 'עובד שטח',
          workerPhone: asset.workerPhone,
          warehouseName: asset.warehouseName,
          expectedReturnDate: asset.expectedReturnDate,
          daysOverdue: days,
          purchaseCost: asset.purchaseCost,
        });
      }
    }

    if (whMap[asset.warehouseId]) {
      whMap[asset.warehouseId].totalAssets++;
      if (asset.status === 'available') whMap[asset.warehouseId].available++;
      else if (asset.status === 'checked_out') whMap[asset.warehouseId].checkedOut++;
      else if (asset.status === 'maintenance') whMap[asset.warehouseId].maintenance++;
    }
  });

  const facilityDistribution = Object.values(whMap).map((f) => ({
    ...f,
    utilizationRate: f.totalAssets > 0 ? Math.round((f.checkedOut / f.totalAssets) * 100) : 0,
  }));

  const totalAssets = assetsStore.length;
  const utilizationRate = totalAssets > 0 ? Math.round((inUse / totalAssets) * 100) : 0;
  const complianceRate =
    totalAssets > 0
      ? Math.max(0, Math.round(((totalAssets - overdueInspections - lockedCount) / totalAssets) * 100))
      : 100;

  // Depreciation calculation: Straight-line based on asset age (assumed 5-year useful life, 20%/yr)
  let accumulatedDepreciation = 0;
  assetsStore.forEach((asset) => {
    const ageInYears = asset.purchaseDate
      ? Math.max(0.2, (now - new Date(asset.purchaseDate).getTime()) / (365.25 * 86400 * 1000))
      : 1.5;
    const itemDeprec = Math.round(asset.purchaseCost * Math.min(0.85, ageInYears * 0.2));
    accumulatedDepreciation += itemDeprec;
  });

  const currentBookValue = Math.max(0, totalFleetValue - accumulatedDepreciation);
  const depreciationRatePct =
    totalFleetValue > 0 ? Math.round((accumulatedDepreciation / totalFleetValue) * 100) : 0;

  // Monthly damage from damage reports in history
  let workerTotal = 0;
  let subcontractorTotal = 0;
  let companyTotal = 0;
  let monthlyDamageCost = 0;
  let damageIncidentCount = 0;

  historyStore.forEach((log) => {
    if (log.damageReport?.estimatedCost) {
      const cost = log.damageReport.estimatedCost;
      monthlyDamageCost += cost;
      damageIncidentCount++;
      if (log.damageReport.chargeParty === 'worker') {
        workerTotal += cost;
      } else if (log.damageReport.chargeParty === 'subcontractor') {
        subcontractorTotal += cost;
      } else {
        companyTotal += cost;
      }
    }
  });

  return {
    totalFleetValue,
    depreciation: {
      totalAcquisitionCost: totalFleetValue,
      accumulatedDepreciation,
      currentBookValue,
      depreciationRatePct,
    },
    utilization: {
      totalAssets,
      inUse,
      inWarehouse,
      maintenance,
      utilizationRate,
    },
    safetyCompliance: {
      overdueCount: overdueInspections,
      upcomingInspectionCount: upcomingInspections,
      lockedCount,
      complianceRate,
    },
    monthlyDamageCost,
    damageAttribution: {
      workerTotal,
      subcontractorTotal,
      companyTotal,
      totalDamageCost: monthlyDamageCost,
      monthlyIncidentCount: damageIncidentCount,
    },
    facilityDistribution,
    highRiskOverdueAssets: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
  };
}

/**
 * Calculates Storekeeper Operations strictly and dynamically from the unified store.
 * Directly corresponds to the selected warehouse's assets.
 */
export function getMockStorekeeperOperations(
  warehouseId?: string
): StorekeeperOperationsPayload {
  const isAll = !warehouseId || warehouseId === 'all' || warehouseId.toLowerCase() === 'all';
  const currentWh = isAll
    ? { id: 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' }
    : (warehousesStore.find((w) => w.id === warehouseId || w.code === warehouseId) ||
       warehousesStore[0] || { id: warehouseId || 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' });

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const returnsDueToday: StorekeeperReturnDue[] = [];
  const overdueAssets: StorekeeperOverdueAsset[] = [];
  let availableCount = 0;
  let checkedOutCount = 0;
  let quarantinedCount = 0;

  // Filter tools belonging to this facility
  const whAssets = isAll ? assetsStore : assetsStore.filter((a) => a.warehouseId === currentWh.id);

  whAssets.forEach((asset) => {
    if (asset.status === 'available') availableCount++;
    if (asset.status === 'checked_out') checkedOutCount++;
    if (asset.status === 'maintenance' || asset.isLocked) quarantinedCount++;

    if (asset.status === 'checked_out' && asset.expectedReturnDate) {
      const rTime = new Date(asset.expectedReturnDate).getTime();
      if (rTime < now) {
        const days = Math.max(1, Math.floor((now - rTime) / (1000 * 60 * 60 * 24)));
        overdueAssets.push({
          assetId: asset.id,
          toolName: asset.toolName,
          brand: asset.brand,
          modelNumber: asset.modelNumber,
          qrCode: asset.qrCode,
          workerName: asset.currentAssignedWorker || 'עובד שטח',
          workerPhone: asset.workerPhone,
          warehouseName: currentWh.name,
          expectedReturnDate: asset.expectedReturnDate,
          daysOverdue: days,
        });
      } else if (rTime >= startOfToday.getTime() && rTime <= endOfToday.getTime()) {
        returnsDueToday.push({
          assetId: asset.id,
          toolName: asset.toolName,
          brand: asset.brand,
          modelNumber: asset.modelNumber,
          qrCode: asset.qrCode,
          workerName: asset.currentAssignedWorker || 'עובד שטח',
          workerPhone: asset.workerPhone,
          expectedReturnDate: asset.expectedReturnDate,
          accessoriesSummary: asset.accessories
            ? `${asset.accessories.batteriesCount} סוללות${asset.accessories.hasCharger ? ' + מטען' : ''}${asset.accessories.hasCase ? ' + ארגז' : ''}`
            : undefined,
        });
      }
    }
  });

  // Calculate low stock per category for this facility
  const lowStockAlerts =
    whAssets.length === 0
      ? []
      : MOCK_CATEGORIES.map((cat) => {
          const availInCat = whAssets.filter(
            (a) => a.categoryId === cat.id && a.status === 'available'
          ).length;
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            availableCount: availInCat,
            minStockThreshold: 2,
            status: (availInCat < 2 ? 'critical' : 'low') as 'critical' | 'low',
          };
        }).filter((alert) => alert.availableCount <= alert.minStockThreshold);

  return {
    warehouse: currentWh,
    allWarehouses: getMockWarehouses(),
    returnsDueToday,
    overdueAssets: overdueAssets.sort((a, b) => b.daysOverdue - a.daysOverdue),
    lowStockAlerts,
    quarantinedCount,
    availableCount,
    checkedOutCount,
  };
}

/**
 * Calculates Catalog Data strictly and dynamically from the unified store.
 */
export function getMockCatalogData(warehouseId?: string): CatalogDataPayload {
  const filteredAssets =
    warehouseId && warehouseId !== 'all'
      ? assetsStore.filter((a) => a.warehouseId === warehouseId)
      : assetsStore;

  const catalogAssets: CatalogAssetItem[] = filteredAssets.map((a) => ({
    id: a.id,
    qrCode: a.qrCode,
    status: a.status,
    condition: a.condition,
    currentAssignedWorker: a.currentAssignedWorker,
    warehouseId: a.warehouseId,
    warehouseName: a.warehouseName,
    warehouseCode: a.warehouseCode,
    categoryId: a.categoryId,
    toolName: a.toolName,
    brand: a.brand,
    modelNumber: a.modelNumber,
    purchaseDate: a.purchaseDate,
    purchaseCost: a.purchaseCost,
    warrantyUntil: a.warrantyUntil,
    safetyInspectionDue: a.safetyInspectionDue,
    isLocked: a.isLocked,
    lockReason: a.lockReason,
  }));

  const categories: CatalogCategory[] = MOCK_CATEGORIES.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon ?? null,
    toolCount: catalogAssets.filter((a) => a.categoryId === cat.id).length,
  }));

  return {
    categories,
    assets: catalogAssets,
    warehouses: getMockWarehouses(),
    selectedWarehouseId: warehouseId || 'all',
  };
}

/**
 * Retrieves audit history filtered from the unified history store.
 */
export function getMockAuditHistory(filters?: AuditHistoryFilters): AuditHistoryPayload {
  let items = [...historyStore];

  if (filters?.action && filters.action !== 'all') {
    items = items.filter((item) => item.action === filters.action);
  }

  if (filters?.warehouseId && filters.warehouseId !== 'all') {
    items = items.filter((item) => item.warehouseId === filters.warehouseId);
  }

  if (filters?.searchQuery?.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    items = items.filter(
      (item) =>
        item.toolName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.qrCode.toLowerCase().includes(q) ||
        (item.targetWorker && item.targetWorker.toLowerCase().includes(q)) ||
        (item.performedBy && item.performedBy.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
    );
  }

  return {
    records: items,
    totalCount: items.length,
    warehouses: getMockWarehouses(),
  };
}

// 5. Authoritative System Users (Authentic General Manager user only)
export const MOCK_USERS: AppUser[] = [
  {
    id: 'usr-gm-01',
    fullName: 'מנהל כללי',
    username: 'Zatout01',
    role: 'general_manager',
    pinCode: '1952',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כלל המפעל והפרויקטים',
    isActive: true,
    createdAt: '2023-11-01T10:00:00.000Z',
  },
];

export function getMockUsers(): AppUser[] {
  return [...MOCK_USERS];
}

export function addMockUser(user: AppUser): AppUser {
  const existingIdx = MOCK_USERS.findIndex(
    (u) => u.id === user.id || (user.username && u.username?.toLowerCase() === user.username.toLowerCase())
  );
  if (existingIdx !== -1) {
    MOCK_USERS[existingIdx] = { ...user };
  } else {
    MOCK_USERS.push({ ...user });
  }
  return user;
}

export function deleteMockUser(userId: string): { success: boolean; error?: string } {
  if (userId === 'usr-gm-01' || userId.toLowerCase() === 'zatout01') {
    return { success: false, error: 'לא ניתן למחוק את משתמש מנהל המערכת הראשי' };
  }
  const idx = MOCK_USERS.findIndex(
    (u) => u.id === userId || u.username?.toLowerCase() === userId.toLowerCase()
  );
  if (idx === -1) {
    return { success: false, error: 'המשתמש לא נמצא במערכת' };
  }
  MOCK_USERS.splice(idx, 1);
  return { success: true };
}

export function updateMockUserWarehouse(
  userId: string,
  newWarehouseId: string
): { success: boolean; error?: string; user?: AppUser } {
  const user = MOCK_USERS.find(
    (u) => u.id === userId || u.username?.toLowerCase() === userId.toLowerCase()
  );
  if (!user) {
    return { success: false, error: 'המשתמש לא נמצא במערכת' };
  }
  const wh = getMockWarehouses().find((w) => w.id === newWarehouseId);
  user.assignedWarehouseId = newWarehouseId;
  user.assignedWarehouseName = wh ? wh.name : 'מחסן שטח פעיל';
  return { success: true, user };
}

export function getMockUserByCredentials(identifier: string, secret?: string): AppUser | null {
  const cleanId = identifier.trim().toLowerCase();
  const cleanSecret = (secret || '').trim();

  // 1. Direct PIN
  if (!cleanSecret && cleanId.length >= 4) {
    const byPin = MOCK_USERS.find((u) => u.pinCode === cleanId);
    if (byPin) return byPin;
  }

  // 2. Username / Name / PIN match
  const user = MOCK_USERS.find(
    (u) =>
      u.username?.toLowerCase() === cleanId ||
      u.fullName.toLowerCase() === cleanId ||
      u.pinCode === cleanId
  );

  if (!user) return null;

  if (
    user.pinCode === cleanSecret ||
    user.pinCode === cleanId ||
    (user.username?.toLowerCase() === 'zatout01' && (cleanSecret === '1952' || cleanId === '1952'))
  ) {
    return user;
  }

  return null;
}

/**
 * Scans all existing mock asset QR codes and extracts the maximum integer suffix
 * matching the given prefix. Returns max + 1 (defaulting to 1 if no matches).
 * e.g., from TOOL-WLD-001 or TOOL-0043 -> extracts max number.
 */
export function getNextAvailableMockTagNumber(prefix: string = 'TOOL-'): number {
  const cleanPrefix = prefix.trim().toUpperCase();
  let maxNumber = 0;

  for (const asset of assetsStore) {
    const qr = (asset.qrCode || '').trim().toUpperCase();
    if (qr.startsWith(cleanPrefix) || cleanPrefix === '' || qr.includes(cleanPrefix)) {
      // Extract trailing digits
      const match = qr.match(/(\d+)$/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > maxNumber) {
          maxNumber = val;
        }
      }
    }
  }

  return maxNumber > 0 ? maxNumber + 1 : 1;
}
