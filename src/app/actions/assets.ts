'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { QuickOnboardSchema, type QuickOnboardInput } from '@/core/assets/onboard.schema';

export interface OnboardFormData {
  warehouses: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    icon: string | null;
  }>;
}

export type OnboardAssetResult =
  | { success: true; assetId: string }
  | { success: false; error: string };

/**
 * Queries and returns active warehouses and categories ordered by display_order.
 */
export async function getOnboardFormData(): Promise<OnboardFormData> {
  if (!isSupabaseConfigured()) {
    console.warn('[getOnboardFormData] Supabase is not configured. Returning empty form data.');
    return { warehouses: [], categories: [] };
  }

  const [warehousesResponse, categoriesResponse] = await Promise.all([
    supabase
      .from('warehouses')
      .select('id, name, code')
      .eq('is_active', true),
    supabase
      .from('categories')
      .select('id, name, slug, icon')
      .order('display_order', { ascending: true }),
  ]);

  if (warehousesResponse.error) {
    console.error('Error fetching warehouses:', warehousesResponse.error.message);
    throw new Error(`Failed to load warehouses: ${warehousesResponse.error.message}`);
  }

  if (categoriesResponse.error) {
    console.error('Error fetching categories:', categoriesResponse.error.message);
    throw new Error(`Failed to load categories: ${categoriesResponse.error.message}`);
  }

  return {
    warehouses: warehousesResponse.data ?? [],
    categories: categoriesResponse.data ?? [],
  };
}

/**
 * Checks whether a QR code is already registered in the assets table.
 */
export async function checkQrCodeExists(qrCode: string): Promise<boolean> {
  const sanitizedQr = qrCode.trim();
  if (!sanitizedQr) {
    return false;
  }

  if (!isSupabaseConfigured()) {
    return false;
  }

  const { data, error } = await supabase
    .from('assets')
    .select('id')
    .eq('qr_code', sanitizedQr)
    .maybeSingle();

  if (error) {
    console.error('Error checking QR code existence:', error.message);
    throw new Error(`Failed to check QR code: ${error.message}`);
  }

  return Boolean(data);
}

/**
 * Validates and enrolls an asset into the system.
 */
export async function onboardAsset(rawInput: QuickOnboardInput): Promise<OnboardAssetResult> {
  // 1. Validate input schema
  const parsed = QuickOnboardSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join(', ');
    return { success: false, error: errorMessages };
  }

  const input = parsed.data;

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: 'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  try {
    // 2. Check if QR code is already registered
    const exists = await checkQrCodeExists(input.qrCode);
    if (exists) {
      return {
        success: false,
        error: `QR code "${input.qrCode}" is already registered.`,
      };
    }

    // 3. Find or create tool model
    let toolModelId: string;
    const { data: existingModel, error: findModelError } = await supabase
      .from('tool_models')
      .select('id')
      .eq('category_id', input.categoryId)
      .eq('name', input.toolName)
      .eq('brand', input.brand)
      .maybeSingle();

    if (findModelError) {
      return {
        success: false,
        error: `Failed to query tool model: ${findModelError.message}`,
      };
    }

    if (existingModel) {
      toolModelId = existingModel.id;
    } else {
      const { data: newModel, error: createModelError } = await supabase
        .from('tool_models')
        .insert({
          category_id: input.categoryId,
          name: input.toolName,
          brand: input.brand,
          model_number: input.modelNumber || null,
          is_serialized: true,
        })
        .select('id')
        .single();

      if (createModelError || !newModel) {
        return {
          success: false,
          error: `Failed to create tool model: ${createModelError?.message || 'Unknown error'}`,
        };
      }
      toolModelId = newModel.id;
    }

    // 4. Insert new asset
    const { data: newAsset, error: assetError } = await supabase
      .from('assets')
      .insert({
        tool_model_id: toolModelId,
        qr_code: input.qrCode,
        current_warehouse_id: input.warehouseId,
        status: 'available',
        condition: input.condition,
        version: 1,
      })
      .select('id')
      .single();

    if (assetError || !newAsset) {
      return {
        success: false,
        error: `Failed to register asset: ${assetError?.message || 'Unknown error'}`,
      };
    }

    // 5. Insert audit entry into custody_ledger
    const { error: ledgerError } = await supabase
      .from('custody_ledger')
      .insert({
        asset_id: newAsset.id,
        action: 'CHECKIN',
        performed_by: 'Field Agent',
        notes: 'Initial field enrollment via Quick Onboard',
      });

    if (ledgerError) {
      console.warn('Custody ledger audit log insertion failed:', ledgerError.message);
    }

    return {
      success: true,
      assetId: newAsset.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return {
      success: false,
      error: message,
    };
  }
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  toolCount: number;
}

export interface CatalogAssetItem {
  id: string;
  qrCode: string;
  status: 'available' | 'checked_out' | 'in_transit' | 'maintenance' | 'lost';
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
  currentAssignedWorker: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  categoryId: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
}

export interface CatalogDataPayload {
  categories: CatalogCategory[];
  assets: CatalogAssetItem[];
  warehouses: Array<{ id: string; name: string; code: string }>;
  selectedWarehouseId?: string;
}

const FALLBACK_CATALOG_WAREHOUSES = [
  { id: 'wh-main-01', name: "מחסן מרכזי - אגף א'", code: 'CDB-01' },
  { id: 'wh-site-02', name: "אתר בנייה - מכולה ב'", code: 'SCB-02' },
  { id: 'wh-van-03', name: "רכב שירות נייד 05", code: 'MSV-05' },
];

const FALLBACK_CATALOG_CATEGORIES_BASE = [
  { id: 'cat-weld', name: 'ריתוך והלחמה', slug: 'welding', icon: 'flame' },
  { id: 'cat-lift', name: 'הרמה ושינוע', slug: 'lifting', icon: 'crane' },
  { id: 'cat-cut', name: 'חיתוך וניסור', slug: 'cutting', icon: 'scissors' },
  { id: 'cat-drill', name: 'קידוח והברגה', slug: 'drilling', icon: 'drill' },
  { id: 'cat-meas', name: 'מדידה ופילוס', slug: 'measurement', icon: 'ruler' },
];

const FALLBACK_ASSETS: CatalogAssetItem[] = [
  // Welding
  {
    id: 'ast-wld-01',
    qrCode: 'TOOL-WLD-001',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-weld',
    toolName: 'Multimatic 220 AC/DC TIG/MIG Welder',
    brand: 'Miller',
    modelNumber: '907757',
  },
  {
    id: 'ast-wld-02',
    qrCode: 'TOOL-WLD-002',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Carlos Mendez',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    categoryId: 'cat-weld',
    toolName: 'Power MIG 210 MP Multi-Process',
    brand: 'Lincoln Electric',
    modelNumber: 'K3963-1',
  },
  {
    id: 'ast-wld-03',
    qrCode: 'TOOL-WLD-003',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-weld',
    toolName: 'Rebel EMP 205ic Multi-Material System',
    brand: 'ESAB',
    modelNumber: '0558102553',
  },

  // Lifting
  {
    id: 'ast-lft-01',
    qrCode: 'TOOL-LFT-010',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-lift',
    toolName: 'Lodestar Electric Chain Hoist 2-Ton',
    brand: 'CM (Columbus McKinnon)',
    modelNumber: 'LDS-2000',
  },
  {
    id: 'ast-lft-02',
    qrCode: 'TOOL-LFT-011',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Marcus Vance',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    categoryId: 'cat-lift',
    toolName: 'LB Lever Puller Hoist 1.5-Ton',
    brand: 'Harrington',
    modelNumber: 'LB015',
  },
  {
    id: 'ast-lft-03',
    qrCode: 'TOOL-LFT-012',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    categoryId: 'cat-lift',
    toolName: 'Polyester Endless Rigging Sling 5-Ton',
    brand: 'Kito Rigging',
    modelNumber: 'EN-5000',
  },

  // Cutting
  {
    id: 'ast-cut-01',
    qrCode: 'TOOL-CUT-020',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-cut',
    toolName: '14-Inch Portable Cut-Off Saw 15A',
    brand: 'Makita',
    modelNumber: 'LW1401',
  },
  {
    id: 'ast-cut-02',
    qrCode: 'TOOL-CUT-021',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Sami Al-Hassan',
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    categoryId: 'cat-cut',
    toolName: '20V MAX Deep Cut Cordless Band Saw',
    brand: 'DeWalt',
    modelNumber: 'DCS374B',
  },
  {
    id: 'ast-cut-03',
    qrCode: 'TOOL-CUT-022',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    categoryId: 'cat-cut',
    toolName: 'M18 FUEL 8-Inch Metal Cutting Circular Saw',
    brand: 'Milwaukee',
    modelNumber: '2982-20',
  },
  {
    id: 'ast-cut-04',
    qrCode: 'TOOL-CUT-023',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-cut',
    toolName: 'Heavy Duty Marble/Tile Cutter 1250W',
    brand: 'Bosch',
    modelNumber: 'GDC 140',
  },

  // Drilling
  {
    id: 'ast-drl-01',
    qrCode: 'TOOL-DRL-030',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-drill',
    toolName: 'TE 70-ATC/AVR Heavy Rotary Hammer SDS-Max',
    brand: 'Hilti',
    modelNumber: 'TE-70-ATC',
  },
  {
    id: 'ast-drl-02',
    qrCode: 'TOOL-DRL-031',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Tariq Mansour',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    categoryId: 'cat-drill',
    toolName: 'M18 FUEL 1/2" Hammer Drill/Driver',
    brand: 'Milwaukee',
    modelNumber: '2904-20',
  },
  {
    id: 'ast-drl-03',
    qrCode: 'TOOL-DRL-032',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'David Chen',
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-drill',
    toolName: '60V MAX 1-7/8" SDS-MAX Rotary Hammer',
    brand: 'DeWalt',
    modelNumber: 'DCH733X2',
  },
  {
    id: 'ast-drl-04',
    qrCode: 'TOOL-DRL-033',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    categoryId: 'cat-drill',
    toolName: 'Bulldog Xtreme 1-Inch Rotary Hammer SDS-Plus',
    brand: 'Bosch',
    modelNumber: 'GBH2-28L',
  },

  // Measurement
  {
    id: 'ast-mea-01',
    qrCode: 'TOOL-MEA-040',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-meas',
    toolName: 'Rugby 610 Self-Leveling Rotary Laser System',
    brand: 'Leica Geosystems',
    modelNumber: '6005983',
  },
  {
    id: 'ast-mea-02',
    qrCode: 'TOOL-MEA-041',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Zaid Al-Najjar',
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    categoryId: 'cat-meas',
    toolName: '87V Industrial True-RMS Digital Multimeter',
    brand: 'Fluke',
    modelNumber: 'FLUKE-87-5',
  },
  {
    id: 'ast-mea-03',
    qrCode: 'TOOL-MEA-042',
    status: 'available',
    condition: 'good',
    currentAssignedWorker: null,
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    categoryId: 'cat-meas',
    toolName: 'GLM 165-40 Blaze Pro 165-Foot Laser Measure',
    brand: 'Bosch',
    modelNumber: 'GLM165-40',
  },
  {
    id: 'ast-mea-04',
    qrCode: 'TOOL-MEA-043',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    categoryId: 'cat-meas',
    toolName: '8-Inch AOS Absolute Digimatic Caliper IP67',
    brand: 'Mitutoyo',
    modelNumber: '500-753-20',
  },
];

function getFallbackCatalog(warehouseId?: string): CatalogDataPayload {
  const filteredAssets =
    warehouseId && warehouseId !== 'all'
      ? FALLBACK_ASSETS.filter((a) => a.warehouseId === warehouseId)
      : FALLBACK_ASSETS;

  const categories: CatalogCategory[] = FALLBACK_CATALOG_CATEGORIES_BASE.map((cat) => ({
    ...cat,
    toolCount: filteredAssets.filter((a) => a.categoryId === cat.id).length,
  }));

  return {
    categories,
    assets: filteredAssets,
    warehouses: FALLBACK_CATALOG_WAREHOUSES,
    selectedWarehouseId: warehouseId || 'all',
  };
}

/**
 * Queries all categories with tool counts and assets joined with tool models and warehouses.
 * Filters by warehouseId if specified.
 */
export async function getCatalogData(warehouseId?: string): Promise<CatalogDataPayload> {
  if (!isSupabaseConfigured()) {
    return getFallbackCatalog(warehouseId);
  }

  try {
    const [warehousesRes, categoriesRes] = await Promise.all([
      supabase.from('warehouses').select('id, name, code').eq('is_active', true),
      supabase.from('categories').select('id, name, slug, icon').order('display_order', { ascending: true }),
    ]);

    let assetQuery = supabase.from('assets').select(`
      id,
      qr_code,
      status,
      condition,
      current_assigned_worker,
      current_warehouse_id,
      tool_models:tool_model_id (
        id,
        name,
        brand,
        model_number,
        category_id
      ),
      warehouses:current_warehouse_id (
        id,
        name,
        code
      )
    `);

    if (warehouseId && warehouseId !== 'all') {
      assetQuery = assetQuery.eq('current_warehouse_id', warehouseId);
    }

    const { data: rawAssets, error: assetErr } = await assetQuery;

    if (
      warehousesRes.error ||
      categoriesRes.error ||
      assetErr ||
      !categoriesRes.data ||
      categoriesRes.data.length === 0
    ) {
      console.warn('Using fallback catalog data due to empty database or query error');
      return getFallbackCatalog(warehouseId);
    }

    const warehousesList = warehousesRes.data ?? [];
    const categoriesList = categoriesRes.data ?? [];

    interface RawJoinedAssetRow {
      id: string;
      qr_code: string;
      status: 'available' | 'checked_out' | 'in_transit' | 'maintenance' | 'lost';
      condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
      current_assigned_worker: string | null;
      current_warehouse_id: string;
      tool_models: {
        id: string;
        name: string;
        brand: string;
        model_number: string | null;
        category_id: string;
      } | null;
      warehouses: {
        id: string;
        name: string;
        code: string;
      } | null;
    }

    const mappedAssets: CatalogAssetItem[] = (
      (rawAssets as unknown as RawJoinedAssetRow[]) ?? []
    ).map((row) => ({
      id: row.id,
      qrCode: row.qr_code,
      status: row.status,
      condition: row.condition,
      currentAssignedWorker: row.current_assigned_worker,
      warehouseId: row.current_warehouse_id,
      warehouseName: row.warehouses?.name || 'Unknown Warehouse',
      warehouseCode: row.warehouses?.code || 'N/A',
      categoryId: row.tool_models?.category_id || '',
      toolName: row.tool_models?.name || 'Unknown Tool',
      brand: row.tool_models?.brand || 'Standard',
      modelNumber: row.tool_models?.model_number || null,
    }));

    const categoriesWithCount: CatalogCategory[] = categoriesList.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      toolCount: mappedAssets.filter((a) => a.categoryId === cat.id).length,
    }));

    return {
      categories: categoriesWithCount,
      assets: mappedAssets,
      warehouses: warehousesList,
      selectedWarehouseId: warehouseId || 'all',
    };
  } catch (err) {
    console.error('getCatalogData exception, returning fallback:', err);
    return getFallbackCatalog(warehouseId);
  }
}

