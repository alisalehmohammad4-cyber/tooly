'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { QuickOnboardSchema, type QuickOnboardInput } from '@/core/assets/onboard.schema';
import type { AssetReservation, AssetStatus } from '@/types/domain';
import { appendAuditHistoryEntry } from '@/app/actions/history';
import {
  getMockWarehouses,
  MOCK_CATEGORIES,
  getMockAssetByQr,
  addMockAsset,
  getMockCatalogData,
  getNextAvailableMockTagNumber,
} from '@/lib/mockStore';

export interface OnboardFormData {
  warehouses: Array<{ id: string; name: string; code: string }>;
  categories: Array<{ id: string; name: string; slug: string; icon: string | null }>;
}

export type OnboardAssetResult =
  | { success: true; assetId: string }
  | { success: false; error: string };

/**
 * Queries and returns active warehouses and categories ordered by display_order.
 */
export async function getOnboardFormData(): Promise<OnboardFormData> {
  if (!isSupabaseConfigured()) {
    return {
      warehouses: getMockWarehouses().map((w) => ({ id: w.id, name: w.name, code: w.code })),
      categories: MOCK_CATEGORIES.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon ?? null })),
    };
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
    return Boolean(getMockAssetByQr(sanitizedQr));
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
    const exists = Boolean(getMockAssetByQr(input.qrCode));
    if (exists) {
      return {
        success: false,
        error: `קוד QR "${input.qrCode}" כבר רשום במערכת.`,
      };
    }

    const newAsset = addMockAsset({
      warehouseId: input.warehouseId,
      categoryId: input.categoryId,
      qrCode: input.qrCode,
      nfcUid: input.nfcUid || undefined,
      toolName: input.toolName,
      brand: input.brand,
      modelNumber: input.modelNumber || undefined,
      condition: input.condition,
    });

    return {
      success: true,
      assetId: newAsset.id,
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
        nfc_uid: input.nfcUid || null,
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
        gps_lat: input.gps?.lat ?? null,
        gps_lng: input.gps?.lng ?? null,
      });

    if (ledgerError) {
      console.warn('Custody ledger audit log insertion failed:', ledgerError.message);
    }

    appendAuditHistoryEntry({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: newAsset.id,
      qrCode: input.qrCode,
      toolName: input.toolName,
      brand: input.brand,
      modelNumber: input.modelNumber || null,
      action: 'ONBOARD',
      performedBy: 'רשם ציוד',
      targetWorker: null,
      workerPhone: null,
      condition: input.condition,
      warehouseId: input.warehouseId,
      warehouseName: 'מחסן שיוך',
      warehouseCode: 'WH',
      notes: 'רישום כלי ראשוני במערכת',
      createdAt: new Date().toISOString(),
      gps: input.gps || null,
    });

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
  qr_code?: string;
  status: AssetStatus;
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
  currentAssignedWorker: string | null;
  current_assigned_worker?: string | null;
  warehouseId: string;
  currentWarehouseId?: string;
  current_warehouse_id?: string;
  warehouseName: string;
  warehouse_name?: string;
  warehouseCode: string;
  warehouse_code?: string;
  categoryId: string;
  category_id?: string;
  categoryName?: string;
  category_name?: string;
  category?: string;
  toolName: string;
  tool_name?: string;
  brand: string;
  modelNumber: string | null;
  model_number?: string | null;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyUntil?: string;
  photoUrl?: string;
  safetyInspectionDue?: string;
  isLocked?: boolean;
  lockReason?: string;
  reservation?: AssetReservation | null;
  orderNumber?: string | null;
  order_number?: string | null;
}

export interface CatalogDataPayload {
  categories: CatalogCategory[];
  assets: CatalogAssetItem[];
  warehouses: Array<{ id: string; name: string; code: string }>;
  selectedWarehouseId?: string;
}

function getFallbackCatalog(warehouseId?: string): CatalogDataPayload {
  return getMockCatalogData(warehouseId);
}

/**
 * Queries all categories with tool counts and assets directly.
 * Does not require inner joins on tool_models; resolves warehouse and category names smoothly.
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

    // Query assets directly without requiring inner join on tool_models
    let assetQuery = supabase.from('assets').select('*');

    if (warehouseId && warehouseId !== 'all') {
      assetQuery = assetQuery.eq('current_warehouse_id', warehouseId);
    }

    const { data: rawAssets, error: assetErr } = await assetQuery;

    if (
      warehousesRes.error ||
      categoriesRes.error ||
      assetErr ||
      !rawAssets ||
      rawAssets.length === 0
    ) {
      console.warn('Using fallback catalog data due to empty database or query error');
      return getFallbackCatalog(warehouseId);
    }

    const warehousesList = warehousesRes.data ?? [];
    const categoriesList = categoriesRes.data ?? [];

    const warehouseMap = new Map(warehousesList.map((w) => [w.id, w]));
    const categoryMap = new Map(categoriesList.map((c) => [c.id, c]));
    const categoryNameMap = new Map(categoriesList.map((c) => [c.name, c]));

    const mappedAssets: CatalogAssetItem[] = rawAssets.map((row: Record<string, unknown>) => {
      const whId = (row.current_warehouse_id || row.warehouse_id || row.currentWarehouseId || '') as string;
      const wh = warehouseMap.get(whId);
      const catId = (row.category_id || row.categoryId || '') as string;
      const catName = (row.category_name || row.categoryName || row.category || '') as string;
      const cat = categoryMap.get(catId) || categoryNameMap.get(catName);

      const qr = (row.qr_code || row.qrCode || '') as string;
      const toolName = (row.tool_name || row.toolName || row.name || 'כלי עבודה') as string;
      const brand = (row.brand || 'Zatout') as string;
      const worker = (row.current_assigned_worker || row.currentAssignedWorker || null) as string | null;
      const orderNum = (row.order_number || row.orderNumber || null) as string | null;
      const resolvedCatName = cat?.name || catName || 'כללי';

      return {
        id: (row.id || '') as string,
        qrCode: qr,
        qr_code: qr,
        status: (row.status || 'available') as AssetStatus,
        condition: (row.condition || 'good') as 'excellent' | 'good' | 'needs_repair' | 'retired',
        currentAssignedWorker: worker,
        current_assigned_worker: worker,
        warehouseId: whId,
        currentWarehouseId: whId,
        current_warehouse_id: whId,
        warehouseName: wh?.name || (row.warehouse_name as string) || 'מחסן ראשי',
        warehouse_name: wh?.name || (row.warehouse_name as string) || 'מחסן ראשי',
        warehouseCode: wh?.code || (row.warehouse_code as string) || 'WH',
        warehouse_code: wh?.code || (row.warehouse_code as string) || 'WH',
        categoryId: cat?.id || catId,
        category_id: cat?.id || catId,
        categoryName: resolvedCatName,
        category_name: resolvedCatName,
        category: resolvedCatName,
        toolName,
        tool_name: toolName,
        brand,
        modelNumber: (row.model_number || row.modelNumber || null) as string | null,
        model_number: (row.model_number || row.modelNumber || null) as string | null,
        purchaseDate: (row.purchase_date || row.purchaseDate) as string | undefined,
        purchaseCost: Number(row.purchase_cost || row.purchaseCost) || 2500,
        orderNumber: orderNum,
        order_number: orderNum,
      };
    });

    const categoriesWithCount: CatalogCategory[] = categoriesList.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      toolCount: mappedAssets.filter(
        (a) =>
          a.category === cat.name ||
          a.categoryName === cat.name ||
          a.category_name === cat.name ||
          a.categoryId === cat.id ||
          a.category_id === cat.id
      ).length,
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

/**
 * Detects the highest sequential tag number in either live Supabase or mock store.
 * e.g., across all ZR- codes (like ZR-282, ZR-1098) -> returns max + 1 (1099).
 */
export async function getNextAvailableTagNumberAction(
  prefix: string = 'ZR-'
): Promise<number> {
  const cleanPrefix = prefix.trim().toUpperCase();
  let maxNumber = 0;

  // 1. Check mock store assets (contains all 1016 imported Excel assets, max 1098)
  const mockNext = getNextAvailableMockTagNumber(cleanPrefix);
  if (mockNext > 1) {
    maxNumber = Math.max(maxNumber, mockNext - 1);
  }

  // 2. Check live Supabase assets (if configured and has items)
  if (isSupabaseConfigured()) {
    try {
      const isZr = cleanPrefix.startsWith('ZR');
      const prefixPattern = isZr ? 'ZR%' : `${cleanPrefix}%`;
      const { data, error } = await supabase
        .from('assets')
        .select('qr_code')
        .ilike('qr_code', prefixPattern);

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const qr = (row.qr_code || '').trim().toUpperCase();
          const match = isZr ? qr.match(/ZR[-_ ]*(\d+)/i) : qr.match(/(\d+)$/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNumber) {
              maxNumber = val;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching highest QR code from Supabase:', err);
    }
  }

  if (maxNumber > 0) {
    return maxNumber + 1;
  }

  return cleanPrefix.startsWith('ZR') ? 1099 : 1;
}


