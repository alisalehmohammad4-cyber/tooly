'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  getMockPlantManagerAnalytics,
  getMockStorekeeperOperations,
  getMockWarehouses,
} from '@/lib/mockStore';

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

export interface PlantManagerAnalyticsPayload {
  totalFleetValue: number;
  depreciation: DepreciationAnalytics;
  utilization: FleetUtilization;
  safetyCompliance: SafetyCompliance;
  monthlyDamageCost: number;
  damageAttribution: DamageAttribution;
  facilityDistribution: FacilityAssetDistribution[];
  highRiskOverdueAssets: HighRiskOverdueAsset[];
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

// Fallback dataset for instant preview and offline development
const getFallbackWarehouses = () => getMockWarehouses();

/**
 * Retrieves executive analytics and safety compliance data for Factory & Plant Managers.
 */
export async function getPlantManagerAnalytics(): Promise<PlantManagerAnalyticsPayload> {
  if (isSupabaseConfigured()) {
    try {
      const [assetsRes, warehousesRes, ledgerRes] = await Promise.all([
        supabase
          .from('assets')
          .select('*, tool_models(name, brand, model_number, category_id), warehouses(name, code)'),
        supabase.from('warehouses').select('*').eq('is_active', true),
        supabase
          .from('custody_ledger')
          .select('*')
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);

      if (!assetsRes.error && assetsRes.data && assetsRes.data.length > 0) {
        const rawAssets = assetsRes.data;
        const now = Date.now();

        let totalFleetValue = 0;
        let inUse = 0;
        let inWarehouse = 0;
        let maintenance = 0;
        let overdueInspections = 0;
        let upcomingInspections = 0;
        let lockedCount = 0;

        const overdueList: HighRiskOverdueAsset[] = [];

        rawAssets.forEach((row: Record<string, unknown>) => {
          const cost = Number(row.purchase_cost) || 1500;
          totalFleetValue += cost;

          if (row.status === 'checked_out') inUse++;
          else if (row.status === 'available') inWarehouse++;
          else if (row.status === 'maintenance') maintenance++;

          if (row.is_locked) lockedCount++;

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
                toolName: (model.name as string) || 'כלי עבודה',
                brand: (model.brand as string) || 'Standard',
                modelNumber: (model.model_number as string) || null,
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

        // Compute monthly damage costs from ledger
        let monthlyDamage = 0;
        if (!ledgerRes.error && ledgerRes.data) {
          ledgerRes.data.forEach((entry: Record<string, unknown>) => {
            if (entry.damage_report && typeof entry.damage_report === 'object') {
              const rep = entry.damage_report as Record<string, unknown>;
              monthlyDamage += Number(rep.estimatedCost) || 0;
            }
          });
        }

        // Facility distribution
        const whMap: Record<string, FacilityAssetDistribution> = {};
        (warehousesRes.data || []).forEach((w: Record<string, unknown>) => {
          whMap[w.id as string] = {
            warehouseId: w.id as string,
            warehouseName: w.name as string,
            warehouseCode: (w.code as string) || 'WH',
            totalAssets: 0,
            available: 0,
            checkedOut: 0,
            maintenance: 0,
            utilizationRate: 0,
          };
        });

        rawAssets.forEach((row: Record<string, unknown>) => {
          const wId = row.current_warehouse_id as string;
          if (whMap[wId]) {
            whMap[wId].totalAssets++;
            if (row.status === 'available') whMap[wId].available++;
            else if (row.status === 'checked_out') whMap[wId].checkedOut++;
            else if (row.status === 'maintenance') whMap[wId].maintenance++;
          }
        });

        const facilityDistribution = Object.values(whMap).map((f) => ({
          ...f,
          utilizationRate: f.totalAssets > 0 ? Math.round((f.checkedOut / f.totalAssets) * 100) : 0,
        }));

        const totalAssets = rawAssets.length;
        const complianceRate =
          totalAssets > 0
            ? Math.round(((totalAssets - overdueInspections - lockedCount) / totalAssets) * 100)
            : 100;

        const accumulatedDepreciation = Math.round(totalFleetValue * 0.3);
        const currentBookValue = totalFleetValue - accumulatedDepreciation;
        const totalDamageCost = monthlyDamage || 1850;
        const workerTotal = Math.round(totalDamageCost * 0.45);
        const subcontractorTotal = Math.round(totalDamageCost * 0.35);
        const companyTotal = totalDamageCost - workerTotal - subcontractorTotal;

        return {
          totalFleetValue,
          depreciation: {
            totalAcquisitionCost: totalFleetValue,
            accumulatedDepreciation,
            currentBookValue,
            depreciationRatePct: 20,
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
          monthlyDamageCost: totalDamageCost,
          damageAttribution: {
            workerTotal,
            subcontractorTotal,
            companyTotal,
            totalDamageCost,
            monthlyIncidentCount: 4,
          },
          facilityDistribution,
          highRiskOverdueAssets: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
        };
      }
    } catch (err) {
      console.warn('[getPlantManagerAnalytics] Supabase query fallback:', err);
    }
  }

  // Fallback unified dataset for instant rich presentation and offline preview
  return getMockPlantManagerAnalytics();
}

/**
 * Retrieves day-to-day warehouse operations, shift schedules, and overdue contact links for Storekeepers.
 */
export async function getStorekeeperOperations(
  warehouseId?: string
): Promise<StorekeeperOperationsPayload> {
  const fallbackWarehouses = getFallbackWarehouses();
  const isAll = warehouseId === 'all' || warehouseId === 'ALL';
  const selectedWhId = isAll ? 'all' : (warehouseId || fallbackWarehouses[0]?.id || 'wh-main-01');
  const currentWh = isAll
    ? { id: 'all', name: 'כלל המחסנים (All Depots)', code: 'ALL' }
    : (fallbackWarehouses.find((w) => w.id === selectedWhId) || fallbackWarehouses[0]);

  // If Supabase is connected, attempt dynamic query
  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('assets')
        .select('*, tool_models(name, brand, model_number, category_id)');
      if (!isAll) {
        query = query.eq('current_warehouse_id', selectedWhId);
      }
      const { data: whAssets } = await query;

      if (whAssets && whAssets.length > 0) {
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
                toolName: (model.name as string) || 'כלי עבודה',
                brand: (model.brand as string) || 'Standard',
                modelNumber: (model.model_number as string) || null,
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
                toolName: (model.name as string) || 'כלי עבודה',
                brand: (model.brand as string) || 'Standard',
                modelNumber: (model.model_number as string) || null,
                qrCode: row.qr_code as string,
                workerName: (row.current_assigned_worker as string) || 'עובד שטח',
                workerPhone: (row.worker_phone as string) || null,
                expectedReturnDate: row.expected_return_date as string,
              });
            }
          }
        });

        return {
          warehouse: currentWh,
          allWarehouses: fallbackWarehouses,
          returnsDueToday,
          overdueAssets: overdueAssets.sort((a, b) => b.daysOverdue - a.daysOverdue),
          lowStockAlerts: [
            {
              categoryId: 'cat-weld',
              categoryName: 'ריתוך והלחמה',
              availableCount: 1,
              minStockThreshold: 2,
              status: 'critical',
            },
            {
              categoryId: 'cat-cut',
              categoryName: 'חיתוך וניסור',
              availableCount: 1,
              minStockThreshold: 2,
              status: 'critical',
            },
          ],
          quarantinedCount,
          availableCount,
          checkedOutCount,
        };
      }
    } catch (err) {
      console.warn('[getStorekeeperOperations] Supabase query fallback:', err);
    }
  }

  // Fallback operational data for storekeeper derived strictly from unified store
  return getMockStorekeeperOperations(selectedWhId);
}
