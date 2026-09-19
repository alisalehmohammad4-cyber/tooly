'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  getMockPlantManagerAnalytics,
  getMockStorekeeperOperations,
  getMockOrganizationById,
  DEFAULT_ORGANIZATION,
} from '@/lib/mockStore';

const DEFAULT_ORGANIZATION_ID = DEFAULT_ORGANIZATION.id;

export interface FleetUtilization {
  totalAssets: number;
  inUse: number;
  inWarehouse: number;
  maintenance: number;
  utilizationRate: number; // percentage (0 - 100)
}

export interface SafetyCompliance {
  overdueCount: number;
  upcomingInspectionCount: number;
  lockedCount: number;
  complianceRate: number; // percentage (0 - 100)
}

export interface FacilityAssetDistribution {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  totalAssets: number;
  totalTools?: number;
  available: number;
  checkedOut: number;
  maintenance: number;
  utilizationRate: number;
}

export interface HighRiskOverdueAsset {
  assetId: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  qrCode: string;
  workerName: string;
  workerPhone: string | null;
  warehouseName: string;
  expectedReturnDate: string;
  daysOverdue: number;
  purchaseCost: number;
}

export interface DepreciationAnalytics {
  totalAcquisitionCost: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
  depreciationRatePct: number;
}

export interface DamageAttribution {
  workerTotal: number;
  subcontractorTotal: number;
  companyTotal: number;
  totalDamageCost: number;
  monthlyIncidentCount: number;
}

export interface CategoryDistributionItem {
  name: string;
  count: number;
}

export interface PlantManagerAnalyticsPayload {
  organizationName: string;
  organizationPrefix?: string;
  currency?: string;
  totalFleetValue: number;
  depreciation: DepreciationAnalytics;
  utilization: FleetUtilization;
  safetyCompliance: SafetyCompliance;
  monthlyDamageCost: number;
  damageAttribution: DamageAttribution;
  facilityDistribution: FacilityAssetDistribution[];
  highRiskOverdueAssets: HighRiskOverdueAsset[];
  categoryBreakdown?: CategoryDistributionItem[];
}

export interface StorekeeperReturnDue {
  assetId: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  qrCode: string;
  workerName: string;
  workerPhone: string | null;
  expectedReturnDate: string;
  accessoriesSummary?: string;
}

export interface StorekeeperOverdueAsset {
  assetId: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  qrCode: string;
  workerName: string;
  workerPhone: string | null;
  warehouseName: string;
  expectedReturnDate: string;
  daysOverdue: number;
}

export interface LowStockAlert {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  minStockThreshold: number;
  status: 'critical' | 'low';
}

export interface StorekeeperOperationsPayload {
  warehouse: { id: string; name: string; code: string };
  allWarehouses: Array<{ id: string; name: string; code: string }>;
  returnsDueToday: StorekeeperReturnDue[];
  overdueAssets: StorekeeperOverdueAsset[];
  lowStockAlerts: LowStockAlert[];
  quarantinedCount: number;
  availableCount: number;
  checkedOutCount: number;
}



// Fast in-memory cache for executive analytics and warehouse operations (30-second TTL)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const analyticsCache = new Map<string, CacheEntry<PlantManagerAnalyticsPayload>>();
const storekeeperOpsCache = new Map<string, CacheEntry<StorekeeperOperationsPayload>>();

import { getServerSessionOrgId } from '@/lib/auth/session';

async function resolveActiveOrganizationId(providedOrgId?: string): Promise<string | null> {
  return getServerSessionOrgId(providedOrgId);
}

const EMPTY_PLANT_MANAGER_ANALYTICS: PlantManagerAnalyticsPayload = {
  organizationName: 'חברה',
  organizationPrefix: 'TOOL',
  currency: 'ILS',
  totalFleetValue: 0,
  depreciation: {
    totalAcquisitionCost: 0,
    accumulatedDepreciation: 0,
    currentBookValue: 0,
    depreciationRatePct: 0,
  },
  utilization: {
    totalAssets: 0,
    inUse: 0,
    inWarehouse: 0,
    maintenance: 0,
    utilizationRate: 0,
  },
  safetyCompliance: {
    overdueCount: 0,
    upcomingInspectionCount: 0,
    lockedCount: 0,
    complianceRate: 100,
  },
  monthlyDamageCost: 0,
  damageAttribution: {
    workerTotal: 0,
    subcontractorTotal: 0,
    companyTotal: 0,
    totalDamageCost: 0,
    monthlyIncidentCount: 0,
  },
  facilityDistribution: [],
  highRiskOverdueAssets: [],
  categoryBreakdown: [],
};

const EMPTY_STOREKEEPER_PAYLOAD: StorekeeperOperationsPayload = {
  warehouse: { id: 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' },
  allWarehouses: [],
  returnsDueToday: [],
  overdueAssets: [],
  lowStockAlerts: [],
  quarantinedCount: 0,
  availableCount: 0,
  checkedOutCount: 0,
};

/**
 * Retrieves executive analytics and safety compliance data for Factory & Plant Managers.
 */
export async function getPlantManagerAnalytics(
  organizationId?: string
): Promise<PlantManagerAnalyticsPayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return EMPTY_PLANT_MANAGER_ANALYTICS;
  }
  const cacheKey = `analytics_${orgId}`;
  const cached = analyticsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fetch active organization details (name, serial_prefix, currency)
  let organizationName = orgId === DEFAULT_ORGANIZATION_ID ? 'Sami Zatout Production' : 'חברה';
  let organizationPrefix = 'TOOL';
  let currency = 'ILS';

  if (isSupabaseConfigured()) {
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name, serial_prefix, currency')
        .eq('id', orgId)
        .maybeSingle();

      if (orgData) {
        if (orgData.name) organizationName = orgData.name;
        if (orgData.serial_prefix) organizationPrefix = orgData.serial_prefix;
        if (orgData.currency) currency = orgData.currency;
      }
    } catch (e) {
      console.warn('[getPlantManagerAnalytics] Failed to fetch organization info:', e);
    }
  } else {
    const mockOrg = getMockOrganizationById(orgId);
    if (mockOrg) {
      organizationName = mockOrg.name;
      organizationPrefix = mockOrg.serialPrefix || 'TOOL';
      currency = mockOrg.defaultCurrency || 'ILS';
    }
  }

  if (!isSupabaseConfigured()) {
    const fallbackPayload: PlantManagerAnalyticsPayload = {
      ...getMockPlantManagerAnalytics(orgId),
      organizationName,
      organizationPrefix,
      currency,
    };
    analyticsCache.set(cacheKey, { data: fallbackPayload, expiresAt: Date.now() + 30000 });
    return fallbackPayload;
  }

  try {
    const astQuery = supabase
      .from('assets')
      .select('*, tool_models(name, brand, model_number, category_id), warehouses(name, code)')
      .eq('organization_id', orgId);

    const whQuery = supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    const ledgerQuery = supabase
      .from('custody_ledger')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    const [assetsRes, warehousesRes, ledgerRes] = await Promise.all([
      astQuery.range(0, 999),
      whQuery,
      ledgerQuery,
    ]);

    let rawAssets: Record<string, unknown>[] = [];
    if (!assetsRes.error && assetsRes.data) {
      rawAssets = [...assetsRes.data];
      if (assetsRes.data.length === 1000) {
        let page = 1;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('assets')
            .select('*, tool_models(name, brand, model_number, category_id), warehouses(name, code)')
            .eq('organization_id', orgId)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error || !data || data.length === 0) break;
          rawAssets.push(...data);
          if (data.length < pageSize) break;
          page++;
        }
      }
    }

    const now = Date.now();
    let totalFleetValue = 0;
    let inUse = 0;
    let inWarehouse = 0;
    let maintenance = 0;
    let overdueInspections = 0;
    let upcomingInspections = 0;
    let lockedCount = 0;

    const overdueList: HighRiskOverdueAsset[] = [];
    const catMap: Record<string, number> = {};

    rawAssets.forEach((row: Record<string, unknown>) => {
      const cost = typeof row.purchase_cost === 'number' ? row.purchase_cost : 2500;
      totalFleetValue += cost;

      if (row.status === 'available') inWarehouse++;
      if (row.status === 'checked_out') inUse++;
      if (row.status === 'maintenance' || row.status === 'needs_repair') maintenance++;

      if (row.is_locked) lockedCount++;

      const cat = (row.category_name as string) || (row.category as string) || 'כללי';
      catMap[cat] = (catMap[cat] || 0) + 1;

      if (row.safety_inspection_due) {
        const dueTime = new Date(row.safety_inspection_due as string).getTime();
        if (dueTime < now) {
          overdueInspections++;
        } else if (dueTime < now + 7 * 24 * 60 * 60 * 1000) {
          upcomingInspections++;
        }
      }

      if (row.status === 'checked_out' && row.expected_return_date) {
        const returnTime = new Date(row.expected_return_date as string).getTime();
        if (returnTime < now) {
          const days = Math.max(1, Math.floor((now - returnTime) / (1000 * 60 * 60 * 24)));
          const model = (row.tool_models as Record<string, unknown>) || {};
          const wh = (row.warehouses as Record<string, unknown>) || {};
          overdueList.push({
            assetId: row.id as string,
            toolName: (row.name as string) || (model.name as string) || 'כלי עבודה',
            brand: (row.brand as string) || (model.brand as string) || 'Standard',
            modelNumber: (row.model_number as string) || (model.model_number as string) || null,
            qrCode: row.qr_code as string,
            workerName: (row.current_assigned_worker as string) || 'עובד שטח',
            workerPhone: (row.worker_phone as string) || null,
            warehouseName: (wh.name as string) || 'מחסן',
            expectedReturnDate: row.expected_return_date as string,
            daysOverdue: days,
            purchaseCost: cost,
          });
        }
      }
    });

    const categoryBreakdown: CategoryDistributionItem[] = Object.entries(catMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Compute monthly damage costs from ledger
    let workerTotal = 0;
    let subcontractorTotal = 0;
    let companyTotal = 0;
    let monthlyDamage = 0;
    let monthlyIncidentCount = 0;

    if (!ledgerRes.error && ledgerRes.data) {
      ledgerRes.data.forEach((entry: Record<string, unknown>) => {
        if (entry.damage_report && typeof entry.damage_report === 'object') {
          const rep = entry.damage_report as Record<string, unknown>;
          const cost = Number(rep.estimatedCost) || 0;
          monthlyDamage += cost;
          monthlyIncidentCount++;
          if (rep.chargeParty === 'worker') {
            workerTotal += cost;
          } else if (rep.chargeParty === 'subcontractor') {
            subcontractorTotal += cost;
          } else {
            companyTotal += cost;
          }
        }
      });
    }

    // Facility distribution strictly for tenant warehouses
    const tenantWarehouses = (!warehousesRes.error && warehousesRes.data) ? warehousesRes.data : [];
    const facilityDistribution: FacilityAssetDistribution[] = tenantWarehouses.map(
      (w: Record<string, unknown>) => {
        const wId = w.id as string;
        const wCode = (w.code as string) || '';
        const matchedAssets = rawAssets.filter((row: Record<string, unknown>) => {
          const rowWhId =
            (row.current_warehouse_id as string) ||
            (row.currentWarehouseId as string) ||
            (row.warehouse_id as string) ||
            (row.warehouseId as string);
          const rowWhCode = (row.warehouse_code as string) || (row.warehouseCode as string) || '';
          return rowWhId === wId || (Boolean(wCode) && rowWhCode === wCode);
        });

        const checkedOut = matchedAssets.filter(
          (r: Record<string, unknown>) => r.status === 'checked_out'
        ).length;
        const available = matchedAssets.filter(
          (r: Record<string, unknown>) => r.status === 'available'
        ).length;
        const maintenance = matchedAssets.filter(
          (r: Record<string, unknown>) =>
            r.status === 'maintenance' || r.status === 'needs_repair'
        ).length;

        return {
          warehouseId: wId,
          warehouseName: w.name as string,
          warehouseCode: wCode || 'WH',
          totalAssets: matchedAssets.length,
          totalTools: matchedAssets.length,
          available,
          checkedOut,
          maintenance,
          utilizationRate:
            matchedAssets.length > 0 ? Math.round((checkedOut / matchedAssets.length) * 100) : 0,
        };
      }
    );

    const totalAssets = rawAssets.length;
    const complianceRate =
      totalAssets > 0
        ? Math.round(((totalAssets - overdueInspections - lockedCount) / totalAssets) * 100)
        : 100;

    const accumulatedDepreciation = totalAssets > 0 ? Math.round(totalFleetValue * 0.3) : 0;
    const currentBookValue = totalAssets > 0 ? totalFleetValue - accumulatedDepreciation : 0;
    const depreciationRatePct = totalFleetValue > 0 ? 20 : 0;

    const payload: PlantManagerAnalyticsPayload = {
      organizationName,
      organizationPrefix,
      currency,
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
        utilizationRate: totalAssets > 0 ? Math.round((inUse / totalAssets) * 100) : 0,
      },
      safetyCompliance: {
        overdueCount: overdueInspections,
        upcomingInspectionCount: upcomingInspections,
        lockedCount,
        complianceRate: Math.max(0, complianceRate),
      },
      monthlyDamageCost: monthlyDamage,
      damageAttribution: {
        workerTotal,
        subcontractorTotal,
        companyTotal,
        totalDamageCost: monthlyDamage,
        monthlyIncidentCount,
      },
      facilityDistribution,
      highRiskOverdueAssets: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
      categoryBreakdown,
    };

    analyticsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 30000 });
    return payload;
  } catch (err) {
    console.warn('[getPlantManagerAnalytics] Supabase query error:', err);
    return {
      ...EMPTY_PLANT_MANAGER_ANALYTICS,
      organizationName,
      organizationPrefix,
      currency,
    };
  }
}

/**
 * Retrieves day-to-day warehouse operations, shift schedules, and overdue contact links for Storekeepers.
 */
export async function getStorekeeperOperations(
  warehouseId?: string,
  organizationId?: string
): Promise<StorekeeperOperationsPayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return EMPTY_STOREKEEPER_PAYLOAD;
  }

  const isAll = warehouseId === 'all' || warehouseId === 'ALL';
  const cacheKey = `storekeeper_ops_${orgId}_${warehouseId || 'all'}`;
  const cached = storekeeperOpsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!isSupabaseConfigured()) {
    const fallbackStorekeeper = getMockStorekeeperOperations(warehouseId, orgId);
    storekeeperOpsCache.set(cacheKey, { data: fallbackStorekeeper, expiresAt: Date.now() + 30000 });
    return fallbackStorekeeper;
  }

  try {
    // Fetch tenant warehouses strictly from Supabase
    const { data: tenantWhs } = await supabase
      .from('warehouses')
      .select('id, name, code')
      .eq('is_active', true)
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    const warehousesList = tenantWhs || [];
    const selectedWhId = isAll ? 'all' : (warehouseId || warehousesList[0]?.id || 'all');

    const currentWh = isAll
      ? { id: 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' }
      : (warehousesList.find((w) => w.id === selectedWhId) ||
         warehousesList[0] || { id: selectedWhId || 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' });

    let query = supabase
      .from('assets')
      .select('*, tool_models(name, brand, model_number, category_id)')
      .eq('organization_id', orgId);

    if (!isAll && selectedWhId !== 'all') {
      query = query.eq('current_warehouse_id', selectedWhId);
    }

    const { data: initialAssets } = await query.range(0, 999);
    let whAssets: Record<string, unknown>[] = [];
    if (initialAssets && initialAssets.length > 0) {
      whAssets = [...initialAssets];
      if (initialAssets.length === 1000) {
        let page = 1;
        const pageSize = 1000;
        while (true) {
          let pQuery = supabase
            .from('assets')
            .select('*, tool_models(name, brand, model_number, category_id)')
            .eq('organization_id', orgId);
          if (!isAll && selectedWhId !== 'all') {
            pQuery = pQuery.eq('current_warehouse_id', selectedWhId);
          }
          const { data, error } = await pQuery.range(page * pageSize, (page + 1) * pageSize - 1);
          if (error || !data || data.length === 0) break;
          whAssets.push(...data);
          if (data.length < pageSize) break;
          page++;
        }
      }
    }

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

    whAssets.forEach((row: Record<string, unknown>) => {
      if (row.status === 'available') availableCount++;
      if (row.status === 'checked_out') checkedOutCount++;
      if (row.status === 'maintenance' || row.is_locked) quarantinedCount++;

      const model = (row.tool_models as Record<string, unknown>) || {};

      if (row.status === 'checked_out' && row.expected_return_date) {
        const rTime = new Date(row.expected_return_date as string).getTime();
        if (rTime < now) {
          const days = Math.max(1, Math.floor((now - rTime) / (1000 * 60 * 60 * 24)));
          overdueAssets.push({
            assetId: row.id as string,
            toolName: (row.name as string) || (model.name as string) || 'כלי עבודה',
            brand: (row.brand as string) || (model.brand as string) || 'Standard',
            modelNumber: (row.model_number as string) || (model.model_number as string) || null,
            qrCode: row.qr_code as string,
            workerName: (row.current_assigned_worker as string) || 'עובד שטח',
            workerPhone: (row.worker_phone as string) || null,
            warehouseName: currentWh.name,
            expectedReturnDate: row.expected_return_date as string,
            daysOverdue: days,
          });
        } else if (rTime >= startOfToday.getTime() && rTime <= endOfToday.getTime()) {
          returnsDueToday.push({
            assetId: row.id as string,
            toolName: (row.name as string) || (model.name as string) || 'כלי עבודה',
            brand: (row.brand as string) || (model.brand as string) || 'Standard',
            modelNumber: (row.model_number as string) || (model.model_number as string) || null,
            qrCode: row.qr_code as string,
            workerName: (row.current_assigned_worker as string) || 'עובד שטח',
            workerPhone: (row.worker_phone as string) || null,
            expectedReturnDate: row.expected_return_date as string,
          });
        }
      }
    });

    const opsPayload: StorekeeperOperationsPayload = {
      warehouse: currentWh,
      allWarehouses: warehousesList,
      returnsDueToday,
      overdueAssets: overdueAssets.sort((a, b) => b.daysOverdue - a.daysOverdue),
      lowStockAlerts: [],
      quarantinedCount,
      availableCount,
      checkedOutCount,
    };
    storekeeperOpsCache.set(cacheKey, { data: opsPayload, expiresAt: Date.now() + 30000 });
    return opsPayload;
  } catch (err) {
    console.warn('[getStorekeeperOperations] Supabase query error:', err);
    return EMPTY_STOREKEEPER_PAYLOAD;
  }
}
