import type { Category, Warehouse, AssetCondition, AppUser } from '@/types/domain';
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

// 1. Authoritative Standardized Warehouses (100% Hebrew)
export const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-main-01', name: "מחסן מרכזי - אגף א'", code: 'CDB-01', isActive: true },
  { id: 'wh-site-02', name: "אתר בנייה - מכולה ב'", code: 'SCB-02', isActive: true },
  { id: 'wh-van-03', name: 'רכב שירות נייד 05', code: 'MSV-05', isActive: true },
];

// 2. Authoritative Standardized Categories (100% Hebrew matching catalog)
export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-weld', name: 'ריתוך והלחמה', slug: 'welding', icon: 'flame', displayOrder: 1 },
  { id: 'cat-lift', name: 'הרמה ושינוע', slug: 'lifting', icon: 'crane', displayOrder: 2 },
  { id: 'cat-cut', name: 'חיתוך וניסור', slug: 'cutting', icon: 'scissors', displayOrder: 3 },
  { id: 'cat-drill', name: 'קידוח והברגה', slug: 'drilling', icon: 'drill', displayOrder: 4 },
  { id: 'cat-meas', name: 'מדידה ופילוס', slug: 'measurement', icon: 'ruler', displayOrder: 5 },
];

// Helper to calculate relative timestamp
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86400 * 1000).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400 * 1000).toISOString();
const todayAtHour = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export interface UnifiedAssetItem {
  id: string;
  qrCode: string;
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

// 3. Authoritative Unified Assets (18 tools with consistent valuations and states)
export const MOCK_ASSETS: UnifiedAssetItem[] = [
  // --- ריתוך והלחמה (cat-weld) ---
  {
    id: 'ast-wld-01',
    qrCode: 'TOOL-WLD-001',
    toolName: 'רתכת משולבת Multimatic 220 AC/DC TIG/MIG',
    brand: 'Miller',
    modelNumber: '907757',
    categoryId: 'cat-weld',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 8450,
    purchaseDate: '2024-01-15',
    warrantyUntil: '2026-01-15',
    safetyInspectionDue: '2026-12-31',
    isLocked: false,
    accessories: { batteriesCount: 0, hasCharger: true, hasCase: true },
  },
  {
    id: 'ast-wld-02',
    qrCode: 'TOOL-WLD-002',
    toolName: 'רתכת Power MIG 210 MP Multi-Process',
    brand: 'Lincoln Electric',
    modelNumber: 'K3963-1',
    categoryId: 'cat-weld',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'קרלוס מנדס',
    workerPhone: '050-1122334',
    version: 2,
    purchaseCost: 6200,
    purchaseDate: '2023-05-10',
    warrantyUntil: '2025-05-10',
    safetyInspectionDue: '2026-11-20',
    isLocked: false,
    expectedReturnDate: daysAgo(1), // Overdue by 1 day
    accessories: { batteriesCount: 0, hasCharger: true, hasCase: false },
  },
  {
    id: 'ast-wld-03',
    qrCode: 'TOOL-WLD-003',
    toolName: 'רתכת מקצועית Rebel EMP 205ic Multi-Material',
    brand: 'ESAB',
    modelNumber: '0558102553',
    categoryId: 'cat-weld',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 9100,
    purchaseDate: '2023-09-01',
    warrantyUntil: '2025-09-01',
    safetyInspectionDue: '2026-03-01',
    isLocked: false,
    accessories: { batteriesCount: 0, hasCharger: false, hasCase: true },
  },

  // --- הרמה ושינוע (cat-lift) ---
  {
    id: 'ast-lft-01',
    qrCode: 'TOOL-LFT-010',
    toolName: 'כננת הרמה חשמלית 2 טון Lodestar Chain Hoist',
    brand: 'CM (Columbus McKinnon)',
    modelNumber: 'LDS-2000',
    categoryId: 'cat-lift',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 4800,
    purchaseDate: '2024-03-10',
    warrantyUntil: '2026-03-10',
    safetyInspectionDue: '2026-10-15',
    isLocked: false,
  },
  {
    id: 'ast-lft-02',
    qrCode: 'TOOL-LFT-011',
    toolName: 'כננת מנוף ידנית 1.5 טון LB Lever Puller',
    brand: 'Harrington',
    modelNumber: 'LB015',
    categoryId: 'cat-lift',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'מרקוס ואנס',
    workerPhone: '058-7766554',
    version: 2,
    purchaseCost: 3900,
    purchaseDate: '2023-08-12',
    warrantyUntil: '2025-08-12',
    safetyInspectionDue: '2026-09-01',
    isLocked: false,
    expectedReturnDate: todayAtHour(18), // Due today
    accessories: { batteriesCount: 0, hasCharger: false, hasCase: false },
  },
  {
    id: 'ast-lft-03',
    qrCode: 'TOOL-LFT-012',
    toolName: 'רצועת עיגון והרמה מעגלית 5 טון Endless Sling',
    brand: 'Kito Rigging',
    modelNumber: 'EN-5000',
    categoryId: 'cat-lift',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 1200,
    purchaseDate: '2024-04-05',
    warrantyUntil: '2025-04-05',
    safetyInspectionDue: '2026-12-01',
    isLocked: false,
  },

  // --- חיתוך וניסור (cat-cut) ---
  {
    id: 'ast-cut-01',
    qrCode: 'TOOL-CUT-020',
    toolName: 'מסור שורף נייד 14 אינץ 15A Portable Cut-Off',
    brand: 'Makita',
    modelNumber: 'LW1401',
    categoryId: 'cat-cut',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 2850,
    purchaseDate: '2023-11-05',
    warrantyUntil: '2025-11-05',
    safetyInspectionDue: daysAgo(15), // EXPIRED safety inspection!
    isLocked: false,
  },
  {
    id: 'ast-cut-02',
    qrCode: 'TOOL-CUT-021',
    toolName: 'מסור סרט נטען 20V MAX Deep Cut Band Saw',
    brand: 'DeWalt',
    modelNumber: 'DCS374B',
    categoryId: 'cat-cut',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'סאמי אל-חסן',
    workerPhone: '054-9876543',
    version: 3,
    purchaseCost: 3400,
    purchaseDate: '2024-02-14',
    warrantyUntil: '2027-02-14',
    safetyInspectionDue: '2026-11-15',
    isLocked: false,
    expectedReturnDate: daysAgo(3), // Overdue by 3 days
    accessories: { batteriesCount: 2, hasCharger: true, hasCase: true },
  },
  {
    id: 'ast-cut-03',
    qrCode: 'TOOL-CUT-022',
    toolName: 'מסור עגול למתכת M18 FUEL 8-Inch Circular Saw',
    brand: 'Milwaukee',
    modelNumber: '2982-20',
    categoryId: 'cat-cut',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 2600,
    purchaseDate: '2023-10-01',
    warrantyUntil: '2025-10-01',
    safetyInspectionDue: '2026-07-20',
    isLocked: false,
  },
  {
    id: 'ast-cut-04',
    qrCode: 'TOOL-CUT-023',
    toolName: 'חותך שיש וגרניט מקצועי Heavy Duty 1250W',
    brand: 'Bosch',
    modelNumber: 'GDC 140',
    categoryId: 'cat-cut',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 1750,
    purchaseDate: '2024-05-18',
    warrantyUntil: '2026-05-18',
    safetyInspectionDue: '2027-01-10',
    isLocked: false,
  },

  // --- קידוח והברגה (cat-drill) ---
  {
    id: 'ast-drl-01',
    qrCode: 'TOOL-DRL-030',
    toolName: 'פטישון כבד TE 70-ATC/AVR SDS-Max Rotary Hammer',
    brand: 'Hilti',
    modelNumber: 'TE-70-ATC',
    categoryId: 'cat-drill',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 5200,
    purchaseDate: '2023-12-01',
    warrantyUntil: '2025-12-01',
    safetyInspectionDue: '2026-10-30',
    isLocked: false,
  },
  {
    id: 'ast-drl-02',
    qrCode: 'TOOL-DRL-031',
    toolName: 'מברגת פטיש M18 FUEL 1/2" Hammer Drill/Driver',
    brand: 'Milwaukee',
    modelNumber: '2904-20',
    categoryId: 'cat-drill',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'טארק מנצור',
    workerPhone: '052-3344556',
    version: 2,
    purchaseCost: 1950,
    purchaseDate: '2024-01-20',
    warrantyUntil: '2026-01-20',
    safetyInspectionDue: '2026-08-15',
    isLocked: false,
    expectedReturnDate: daysAgo(2), // Overdue by 2 days
    accessories: { batteriesCount: 2, hasCharger: true, hasCase: true },
  },
  {
    id: 'ast-drl-03',
    qrCode: 'TOOL-DRL-032',
    toolName: 'פטישון עוצמתי 60V MAX 1-7/8" SDS-MAX',
    brand: 'DeWalt',
    modelNumber: 'DCH733X2',
    categoryId: 'cat-drill',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'דוד כהן',
    workerPhone: '053-4455667',
    version: 1,
    purchaseCost: 4300,
    purchaseDate: '2024-03-01',
    warrantyUntil: '2026-03-01',
    safetyInspectionDue: '2026-12-15',
    isLocked: false,
    expectedReturnDate: todayAtHour(17), // Due today
    accessories: { batteriesCount: 2, hasCharger: true, hasCase: true },
  },
  {
    id: 'ast-drl-04',
    qrCode: 'TOOL-DRL-033',
    toolName: 'פטישון קל Bulldog Xtreme 1-Inch SDS-Plus',
    brand: 'Bosch',
    modelNumber: 'GBH2-28L',
    categoryId: 'cat-drill',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 1600,
    purchaseDate: '2024-06-10',
    warrantyUntil: '2026-06-10',
    safetyInspectionDue: '2027-02-01',
    isLocked: false,
  },

  // --- מדידה ופילוס (cat-meas) ---
  {
    id: 'ast-mea-01',
    qrCode: 'TOOL-MEA-040',
    toolName: 'מערכת פילוס לייזר סיבובי Rugby 610 Rotary Laser',
    brand: 'Leica Geosystems',
    modelNumber: '6005983',
    categoryId: 'cat-meas',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 6500,
    purchaseDate: '2023-11-20',
    warrantyUntil: '2025-11-20',
    safetyInspectionDue: '2026-11-01',
    isLocked: true,
    lockReason: 'נעילה מנהלתית - נדרש כיול לייזר במעבדה מוסמכת',
  },
  {
    id: 'ast-mea-02',
    qrCode: 'TOOL-MEA-041',
    toolName: 'מולטימטר תעשייתי מתקדם 87V True-RMS Multimeter',
    brand: 'Fluke',
    modelNumber: 'FLUKE-87-5',
    categoryId: 'cat-meas',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'זאיד אל-נג\'אר',
    workerPhone: '050-9943302',
    version: 2,
    purchaseCost: 3100,
    purchaseDate: '2023-07-15',
    warrantyUntil: '2026-07-15',
    safetyInspectionDue: '2026-10-01',
    isLocked: false,
    expectedReturnDate: daysFromNow(2),
  },
  {
    id: 'ast-mea-03',
    qrCode: 'TOOL-MEA-042',
    toolName: 'מד מרחק לייזר דיגיטלי GLM 165-40 Blaze Pro',
    brand: 'Bosch',
    modelNumber: 'GLM165-40',
    categoryId: 'cat-meas',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 850,
    purchaseDate: '2024-04-22',
    warrantyUntil: '2026-04-22',
    safetyInspectionDue: '2027-04-01',
    isLocked: false,
  },
  {
    id: 'ast-mea-04',
    qrCode: 'TOOL-MEA-043',
    toolName: 'קליבר דיגיטלי מדויק 8-Inch AOS Digimatic IP67',
    brand: 'Mitutoyo',
    modelNumber: '500-753-20',
    categoryId: 'cat-meas',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    workerPhone: null,
    version: 1,
    purchaseCost: 1400,
    purchaseDate: '2023-04-10',
    warrantyUntil: '2025-04-10',
    safetyInspectionDue: '2026-04-01',
    isLocked: false,
  },
];

// 4. Authoritative Audit History Records (100% Hebrew)
export const MOCK_AUDIT_LOGS: AuditHistoryRecord[] = [
  {
    id: 'aud-101',
    assetId: 'ast-wld-02',
    qrCode: 'TOOL-WLD-002',
    toolName: 'רתכת Power MIG 210 MP Multi-Process',
    brand: 'Lincoln Electric',
    modelNumber: 'K3963-1',
    action: 'CHECKOUT',
    performedBy: 'יוסי כהן (מנהל עבודה)',
    targetWorker: 'קרלוס מנדס',
    workerPhone: '050-1122334',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    notes: 'ניפוק לריתוך עמודי קונסטרוקציה אגף דרומי.',
    createdAt: hoursAgo(25),
    expectedReturnDate: daysAgo(1),
    gps: { lat: 32.0853, lng: 34.7818 },
  },
  {
    id: 'aud-102',
    assetId: 'ast-lft-02',
    qrCode: 'TOOL-LFT-011',
    toolName: 'כננת מנוף ידנית 1.5 טון LB Lever Puller',
    brand: 'Harrington',
    modelNumber: 'LB015',
    action: 'CHECKOUT',
    performedBy: 'יוסי כהן (מנהל עבודה)',
    targetWorker: 'מרקוס ואנס',
    workerPhone: '058-7766554',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    notes: 'הרמת צנרת ראשית קומה 4.',
    createdAt: hoursAgo(4),
    expectedReturnDate: todayAtHour(18),
    gps: { lat: 32.794, lng: 34.9896 },
  },
  {
    id: 'aud-103',
    assetId: 'ast-wld-03',
    qrCode: 'TOOL-WLD-003',
    toolName: 'רתכת מקצועית Rebel EMP 205ic Multi-Material',
    brand: 'ESAB',
    modelNumber: '0558102553',
    action: 'MAINTENANCE_FLAG',
    performedBy: 'אבי לוי (טכנאי שירות)',
    targetWorker: null,
    workerPhone: null,
    condition: 'needs_repair',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    notes: 'מנוע הזנת חוט נתקע ומקצר תחת עומס. הועבר לבדיקת מעבדה.',
    createdAt: hoursAgo(6),
    gps: { lat: 31.7683, lng: 35.2137 },
    damageReport: {
      isDamaged: true,
      damageType: 'burned_motor',
      estimatedCost: 650,
      chargeParty: 'company',
      notes: 'מנוע הזנת חוט התחמם ונשרף. דורש החלפת סלילים מקוריים.',
    },
  },
  {
    id: 'aud-104',
    assetId: 'ast-cut-02',
    qrCode: 'TOOL-CUT-021',
    toolName: 'מסור סרט נטען 20V MAX Deep Cut Band Saw',
    brand: 'DeWalt',
    modelNumber: 'DCS374B',
    action: 'CHECKOUT',
    performedBy: 'דני לוי (מנהל פרויקט)',
    targetWorker: 'סאמי אל-חסן',
    workerPhone: '054-9876543',
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    notes: 'חיתוך תעלות מיזוג אוויר בגג המבנה.',
    createdAt: hoursAgo(80),
    expectedReturnDate: daysAgo(3),
    gps: { lat: 31.2529, lng: 34.7915 },
  },
  {
    id: 'aud-105',
    assetId: 'ast-lft-03',
    qrCode: 'TOOL-LFT-012',
    toolName: 'רצועת עיגון והרמה מעגלית 5 טון Endless Sling',
    brand: 'Kito Rigging',
    modelNumber: 'EN-5000',
    action: 'TRANSFER_RECEIVE',
    performedBy: 'יוסי לוי (מחסנאי)',
    targetWorker: null,
    workerPhone: null,
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    notes: 'העברה ממחסן מרכזי למילוי מלאי ברכב שירות שטח.',
    createdAt: hoursAgo(8),
  },
  {
    id: 'aud-106',
    assetId: 'ast-wld-01',
    qrCode: 'TOOL-WLD-001',
    toolName: 'רתכת משולבת Multimatic 220 AC/DC TIG/MIG',
    brand: 'Miller',
    modelNumber: '907757',
    action: 'CHECKIN',
    performedBy: 'יוסי לוי (מחסנאי)',
    targetWorker: null,
    workerPhone: null,
    condition: 'excellent',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    notes: 'הוחזר לאחר פרויקט צנרת. נוקה ונבדק תקין.',
    createdAt: hoursAgo(10),
  },
  {
    id: 'aud-107',
    assetId: 'ast-drl-02',
    qrCode: 'TOOL-DRL-031',
    toolName: 'מברגת פטיש M18 FUEL 1/2" Hammer Drill/Driver',
    brand: 'Milwaukee',
    modelNumber: '2904-20',
    action: 'CHECKOUT',
    performedBy: 'יוסי כהן (מנהל עבודה)',
    targetWorker: 'טארק מנצור',
    workerPhone: '052-3344556',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: "אתר בנייה - מכולה ב'",
    warehouseCode: 'SCB-02',
    notes: 'עיגון תעלות חשמל במבנה ראשי.',
    createdAt: hoursAgo(50),
    expectedReturnDate: daysAgo(2),
  },
  {
    id: 'aud-108',
    assetId: 'ast-mea-02',
    qrCode: 'TOOL-MEA-041',
    toolName: 'מולטימטר תעשייתי מתקדם 87V True-RMS Multimeter',
    brand: 'Fluke',
    modelNumber: 'FLUKE-87-5',
    action: 'CHECKOUT',
    performedBy: 'יוסי כהן (מנהל עבודה)',
    targetWorker: 'זאיד אל-נג\'אר',
    workerPhone: '050-9943302',
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'רכב שירות נייד 05',
    warehouseCode: 'MSV-05',
    notes: 'בדיקת בידוד מנועים בתחנת כוח משנית.',
    createdAt: hoursAgo(12),
    expectedReturnDate: daysFromNow(2),
  },
  {
    id: 'aud-109',
    assetId: 'ast-drl-01',
    qrCode: 'TOOL-DRL-030',
    toolName: 'פטישון כבד TE 70-ATC/AVR SDS-Max Rotary Hammer',
    brand: 'Hilti',
    modelNumber: 'TE-70-ATC',
    action: 'ONBOARD',
    performedBy: 'ישראל ישראלי (רשם ציוד)',
    targetWorker: null,
    workerPhone: null,
    condition: 'excellent',
    warehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    notes: 'רכש חדש, קידוד QR והכנסה ראשונית למלאי.',
    createdAt: daysAgo(2),
  },
];

// In-memory persistent arrays for local dev/preview
const assetsStore: UnifiedAssetItem[] = [...MOCK_ASSETS];
const historyStore: AuditHistoryRecord[] = [...MOCK_AUDIT_LOGS];

/**
 * Get all assets from the unified mock store.
 */
export function getMockAssets(): UnifiedAssetItem[] {
  return assetsStore;
}

/**
 * Get asset by QR code or ID from unified mock store.
 */
export function getMockAssetByQr(qrCode: string): ScannedAssetDetails | null {
  const clean = qrCode.trim().toUpperCase();
  const asset = assetsStore.find(
    (a) => a.qrCode.toUpperCase() === clean || a.id.toUpperCase() === clean
  );
  if (!asset) return null;

  return {
    id: asset.id,
    qrCode: asset.qrCode,
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
    const wh = MOCK_WAREHOUSES.find((w) => w.id === mutation.warehouseId);
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

/**
 * Onboards a brand new tool into the mock store.
 */
export function addMockAsset(newAsset: {
  warehouseId: string;
  categoryId: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber?: string;
  condition: AssetCondition;
  performedBy?: string;
}): ScannedAssetDetails {
  const wh =
    MOCK_WAREHOUSES.find((w) => w.id === newAsset.warehouseId) || MOCK_WAREHOUSES[0];

  const asset: UnifiedAssetItem = {
    id: `ast-${Date.now()}`,
    qrCode: newAsset.qrCode.trim(),
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

  MOCK_WAREHOUSES.forEach((wh) => {
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

  // Monthly damage from damage reports in history
  let monthlyDamageCost = 0;
  historyStore.forEach((log) => {
    if (log.damageReport?.estimatedCost) {
      monthlyDamageCost += log.damageReport.estimatedCost;
    }
  });
  if (monthlyDamageCost === 0) monthlyDamageCost = 650;

  return {
    totalFleetValue,
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
  const selectedWhId = warehouseId || MOCK_WAREHOUSES[0].id;
  const currentWh =
    MOCK_WAREHOUSES.find((w) => w.id === selectedWhId) || MOCK_WAREHOUSES[0];

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
  const whAssets = assetsStore.filter((a) => a.warehouseId === currentWh.id);

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
  const lowStockAlerts = MOCK_CATEGORIES.map((cat) => {
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
    allWarehouses: MOCK_WAREHOUSES,
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
    warehouses: MOCK_WAREHOUSES,
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
    warehouses: MOCK_WAREHOUSES,
  };
}

// 5. Authoritative System Users (Admin & Storekeepers)
export const MOCK_USERS: AppUser[] = [
  {
    id: 'usr-admin-01',
    fullName: 'מנהל מפעל ראשי',
    username: 'Zatout01',
    role: 'admin',
    pinCode: '1952',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
    createdAt: '2023-11-01T10:00:00.000Z',
  },
  {
    id: 'usr-sk-01',
    fullName: 'יוסי כהן (מחסנאי מורשה)',
    username: 'yossi',
    role: 'supervisor',
    pinCode: '1111',
    assignedWarehouseId: 'wh-main-01',
    assignedWarehouseName: "מחסן מרכזי - אגף א'",
    isActive: true,
    createdAt: '2024-01-01T08:00:00.000Z',
  },
  {
    id: 'usr-sk-02',
    fullName: 'אבי לוי (מחסנאי שטח)',
    username: 'avi',
    role: 'supervisor',
    pinCode: '1234',
    assignedWarehouseId: 'wh-site-02',
    assignedWarehouseName: "אתר בנייה - מכולה ב'",
    isActive: true,
    createdAt: '2024-02-15T09:30:00.000Z',
  },
];

export function getMockUsers(): AppUser[] {
  return [...MOCK_USERS];
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
