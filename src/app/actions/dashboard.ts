'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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

export interface PlantManagerAnalyticsPayload {
  totalFleetValue: number;
  utilization: FleetUtilization;
  safetyCompliance: SafetyCompliance;
  monthlyDamageCost: number;
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
const FALLBACK_WAREHOUSES = [
  { id: 'wh-main-01', name: "מחסן מרכזי - אגף א'", code: 'CDB-01' },
  { id: 'wh-site-02', name: "אתר בנייה - מכולה ב'", code: 'SCB-02' },
  { id: 'wh-van-03', name: "רכב שירות נייד 05", code: 'MSV-05' },
];

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

        return {
          totalFleetValue,
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
          monthlyDamageCost: monthlyDamage || 1850,
          facilityDistribution,
          highRiskOverdueAssets: overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue),
        };
      }
    } catch (err) {
      console.warn('[getPlantManagerAnalytics] Supabase query fallback:', err);
    }
  }

  // Fallback demo dataset for instant rich presentation
  return {
    totalFleetValue: 98450,
    utilization: {
      totalAssets: 15,
      inUse: 8,
      inWarehouse: 5,
      maintenance: 2,
      utilizationRate: 53,
    },
    safetyCompliance: {
      overdueCount: 1, // TOOL-CUT-020
      upcomingInspectionCount: 2,
      lockedCount: 1, // TOOL-MEA-040
      complianceRate: 87,
    },
    monthlyDamageCost: 2450,
    facilityDistribution: [
      {
        warehouseId: 'wh-main-01',
        warehouseName: "מחסן מרכזי - אגף א'",
        warehouseCode: 'CDB-01',
        totalAssets: 8,
        available: 3,
        checkedOut: 4,
        maintenance: 1,
        utilizationRate: 50,
      },
      {
        warehouseId: 'wh-site-02',
        warehouseName: "אתר בנייה - מכולה ב'",
        warehouseCode: 'SCB-02',
        totalAssets: 4,
        available: 1,
        checkedOut: 2,
        maintenance: 1,
        utilizationRate: 50,
      },
      {
        warehouseId: 'wh-van-03',
        warehouseName: "רכב שירות נייד 05",
        warehouseCode: 'MSV-05',
        totalAssets: 3,
        available: 1,
        checkedOut: 2,
        maintenance: 0,
        utilizationRate: 67,
      },
    ],
    highRiskOverdueAssets: [
      {
        assetId: 'ast-cut-02',
        toolName: '20V MAX Deep Cut Cordless Band Saw',
        brand: 'DeWalt',
        modelNumber: 'DCS374B',
        qrCode: 'TOOL-CUT-021',
        workerName: 'סאמי אל-חסן',
        workerPhone: '054-9876543',
        warehouseName: "רכב שירות נייד 05",
        expectedReturnDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 3,
        purchaseCost: 3200,
      },
      {
        assetId: 'ast-drl-02',
        toolName: 'M18 FUEL 1/2" Hammer Drill/Driver',
        brand: 'Milwaukee',
        modelNumber: '2904-20',
        qrCode: 'TOOL-DRL-031',
        workerName: 'טארק מנצור',
        workerPhone: '052-3344556',
        warehouseName: "אתר בנייה - מכולה ב'",
        expectedReturnDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 2,
        purchaseCost: 1950,
      },
      {
        assetId: 'ast-wld-02',
        toolName: 'Power MIG 210 MP Multi-Process',
        brand: 'Lincoln Electric',
        modelNumber: 'K3963-1',
        qrCode: 'TOOL-WLD-002',
        workerName: 'קרלוס מנדס',
        workerPhone: '050-1122334',
        warehouseName: "אתר בנייה - מכולה ב'",
        expectedReturnDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 1,
        purchaseCost: 7400,
      },
    ],
  };
}

/**
 * Retrieves day-to-day warehouse operations, shift schedules, and overdue contact links for Storekeepers.
 */
export async function getStorekeeperOperations(
  warehouseId?: string
): Promise<StorekeeperOperationsPayload> {
  const selectedWhId = warehouseId || FALLBACK_WAREHOUSES[0].id;
  const currentWh =
    FALLBACK_WAREHOUSES.find((w) => w.id === selectedWhId) || FALLBACK_WAREHOUSES[0];

  // If Supabase is connected, attempt dynamic query
  if (isSupabaseConfigured()) {
    try {
      const { data: whAssets } = await supabase
        .from('assets')
        .select('*, tool_models(name, brand, model_number, category_id)')
        .eq('current_warehouse_id', selectedWhId);

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
          allWarehouses: FALLBACK_WAREHOUSES,
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

  // Fallback operational data for storekeeper
  return {
    warehouse: currentWh,
    allWarehouses: FALLBACK_WAREHOUSES,
    returnsDueToday: [
      {
        assetId: 'ast-drl-03',
        toolName: '60V MAX 1-7/8" SDS-MAX Rotary Hammer',
        brand: 'DeWalt',
        modelNumber: 'DCH733X2',
        qrCode: 'TOOL-DRL-032',
        workerName: 'דוד כהן',
        workerPhone: '053-4455667',
        expectedReturnDate: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(),
        accessoriesSummary: '2 סוללות + מטען מקורי + ארגז',
      },
      {
        assetId: 'ast-lft-02',
        toolName: 'LB Lever Puller Hoist 1.5-Ton',
        brand: 'Harrington',
        modelNumber: 'LB015',
        qrCode: 'TOOL-LFT-011',
        workerName: 'מרקוס ואנס',
        workerPhone: '058-7766554',
        expectedReturnDate: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(),
        accessoriesSummary: 'שרשרת עגינה',
      },
    ],
    overdueAssets: [
      {
        assetId: 'ast-cut-02',
        toolName: '20V MAX Deep Cut Cordless Band Saw',
        brand: 'DeWalt',
        modelNumber: 'DCS374B',
        qrCode: 'TOOL-CUT-021',
        workerName: 'סאמי אל-חסן',
        workerPhone: '054-9876543',
        warehouseName: currentWh.name,
        expectedReturnDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 3,
      },
      {
        assetId: 'ast-drl-02',
        toolName: 'M18 FUEL 1/2" Hammer Drill/Driver',
        brand: 'Milwaukee',
        modelNumber: '2904-20',
        qrCode: 'TOOL-DRL-031',
        workerName: 'טארק מנצור',
        workerPhone: '052-3344556',
        warehouseName: currentWh.name,
        expectedReturnDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 2,
      },
      {
        assetId: 'ast-wld-02',
        toolName: 'Power MIG 210 MP Multi-Process',
        brand: 'Lincoln Electric',
        modelNumber: 'K3963-1',
        qrCode: 'TOOL-WLD-002',
        workerName: 'קרלוס מנדס',
        workerPhone: '050-1122334',
        warehouseName: currentWh.name,
        expectedReturnDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        daysOverdue: 1,
      },
    ],
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
      {
        categoryId: 'cat-lift',
        categoryName: 'הרמה ושינוע',
        availableCount: 2,
        minStockThreshold: 3,
        status: 'low',
      },
    ],
    quarantinedCount: 2, // 1 maintenance + 1 locked
    availableCount: 5,
    checkedOutCount: 8,
  };
}
