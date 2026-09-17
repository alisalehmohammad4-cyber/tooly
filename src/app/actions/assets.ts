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
  getMockAssets,
  getNextAvailableMockTagNumber,
  isLegacyEnglishCategory,
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
 * Strictly filters out legacy English demo categories.
 */
export async function getOnboardFormData(): Promise<OnboardFormData> {
  if (!isSupabaseConfigured()) {
    return {
      warehouses: getMockWarehouses().map((w) => ({ id: w.id, name: w.name, code: w.code })),
      categories: MOCK_CATEGORIES.filter((c) => !isLegacyEnglishCategory(c)).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon ?? null,
      })),
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

  const rawCategories = (categoriesResponse.data ?? []).filter(
    (c) => !isLegacyEnglishCategory(c)
  );

  return {
    warehouses: warehousesResponse.data ?? [],
    categories:
      rawCategories.length > 0
        ? rawCategories
        : MOCK_CATEGORIES.filter((c) => !isLegacyEnglishCategory(c)).map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            icon: c.icon ?? null,
          })),
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

    await invalidateCatalogCache();

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

    await invalidateCatalogCache();

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

// Fast in-memory cache for high-frequency catalog & category requests (30-second TTL)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const CATALOG_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const catalogCache = new Map<string, CacheEntry<CatalogDataPayload>>();

export async function invalidateCatalogCache(): Promise<void> {
  catalogCache.clear();
}

/**
 * Queries all categories with live tool counts and assets.
 * Resolves warehouse and category names smoothly and enriches with catalog counts.
 * Filters returned assets by warehouseId if specified.
 * Cached for 30s to maximize 60fps responsiveness across fleet of 1,016+ assets.
 */
export async function getCatalogData(warehouseId?: string): Promise<CatalogDataPayload> {
  const cacheKey = `catalog_${warehouseId || 'all'}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let warehousesList: Array<{ id: string; name: string; code: string }> = [];
  let categoriesList: Array<{ id: string; name: string; slug: string; icon: string | null }> = [];
  let allAssets: CatalogAssetItem[] = [];

  if (isSupabaseConfigured()) {
    try {
      const [warehousesRes, categoriesRes, assetsRes] = await Promise.all([
        supabase.from('warehouses').select('id, name, code').eq('is_active', true),
        supabase.from('categories').select('id, name, slug, icon').order('display_order', { ascending: true }),
        supabase
          .from('assets')
          .select('id, qr_code, status, condition, current_assigned_worker, current_warehouse_id, warehouse_id, category_id, category_name, tool_name, brand, model_number, purchase_date, purchase_cost, order_number')
          .limit(10000),
      ]);

      if (!warehousesRes.error && warehousesRes.data && warehousesRes.data.length > 0) {
        warehousesList = warehousesRes.data;
      }
      if (!categoriesRes.error && categoriesRes.data && categoriesRes.data.length > 0) {
        categoriesList = (
          categoriesRes.data as Array<{ id: string; name: string; slug: string; icon: string | null }>
        ).filter((c) => !isLegacyEnglishCategory(c));
      }
      if (!assetsRes.error && assetsRes.data && assetsRes.data.length > 0) {
        const warehouseMap = new Map(warehousesList.map((w) => [w.id, w]));
        const categoryMap = new Map(categoriesList.map((c) => [c.id, c]));
        const categoryNameMap = new Map(categoriesList.map((c) => [c.name, c]));
        const mockAssetMap = new Map(getMockAssets().map((a) => [a.qrCode, a]));

        allAssets = (assetsRes.data as Record<string, unknown>[]).map((row) => {
          const qr = (row.qr_code || row.qrCode || '') as string;
          const mockFallback = mockAssetMap.get(qr);

          const whId = (row.current_warehouse_id || row.warehouse_id || row.currentWarehouseId || mockFallback?.currentWarehouseId || '') as string;
          const wh = warehouseMap.get(whId);
          const catId = (row.category_id || row.categoryId || mockFallback?.categoryId || '') as string;
          const catName = (row.category_name || row.categoryName || row.category || mockFallback?.categoryName || '') as string;
          const cat = categoryMap.get(catId) || categoryNameMap.get(catName);

          const toolName = (row.tool_name || row.toolName || row.name || mockFallback?.toolName || 'כלי עבודה') as string;
          const brand = (row.brand || mockFallback?.brand || 'Zatout') as string;
          const worker = (row.current_assigned_worker || row.currentAssignedWorker || mockFallback?.currentAssignedWorker || null) as string | null;
          const orderNum = (row.order_number || row.orderNumber || mockFallback?.orderNumber || null) as string | null;
          const resolvedCatName = cat?.name || catName || mockFallback?.categoryName || 'ציוד כללי';

          return {
            id: (row.id || mockFallback?.id || '') as string,
            qrCode: qr,
            qr_code: qr,
            status: (row.status || mockFallback?.status || 'available') as AssetStatus,
            condition: (row.condition || mockFallback?.condition || 'good') as 'excellent' | 'good' | 'needs_repair' | 'retired',
            currentAssignedWorker: worker,
            current_assigned_worker: worker,
            warehouseId: whId,
            currentWarehouseId: whId,
            current_warehouse_id: whId,
            warehouseName: wh?.name || mockFallback?.warehouseName || (row.warehouse_name as string) || 'מחסן ראשי',
            warehouse_name: wh?.name || mockFallback?.warehouseName || (row.warehouse_name as string) || 'מחסן ראשי',
            warehouseCode: wh?.code || mockFallback?.warehouseCode || (row.warehouse_code as string) || 'WH',
            warehouse_code: wh?.code || mockFallback?.warehouseCode || (row.warehouse_code as string) || 'WH',
            categoryId: cat?.id || catId,
            category_id: cat?.id || catId,
            categoryName: resolvedCatName,
            category_name: resolvedCatName,
            category: resolvedCatName,
            toolName,
            tool_name: toolName,
            brand,
            modelNumber: (row.model_number || row.modelNumber || mockFallback?.modelNumber || null) as string | null,
            model_number: (row.model_number || row.modelNumber || mockFallback?.modelNumber || null) as string | null,
            purchaseDate: (row.purchase_date || row.purchaseDate || mockFallback?.purchaseDate) as string | undefined,
            purchaseCost: Number(row.purchase_cost || row.purchaseCost || mockFallback?.purchaseCost) || 2500,
            orderNumber: orderNum,
            order_number: orderNum,
          };
        });
      }
    } catch (err) {
      console.warn('Supabase error in getCatalogData, falling back to mockStore:', err);
    }
  }

  // Fallback to mockStore if empty
  if (warehousesList.length === 0) {
    warehousesList = getMockWarehouses().map((w) => ({ id: w.id, name: w.name, code: w.code }));
  }
  if (categoriesList.length === 0) {
    categoriesList = MOCK_CATEGORIES.filter((c) => !isLegacyEnglishCategory(c)).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon ?? null,
    }));
  }
  if (allAssets.length === 0) {
    allAssets = getMockAssets().map((a) => ({
      id: a.id,
      qrCode: a.qrCode || a.qr_code || '',
      qr_code: a.qrCode || a.qr_code || '',
      status: a.status,
      condition: a.condition,
      currentAssignedWorker: a.currentAssignedWorker || a.current_assigned_worker || null,
      current_assigned_worker: a.currentAssignedWorker || a.current_assigned_worker || null,
      warehouseId: a.currentWarehouseId || a.current_warehouse_id || a.warehouseId,
      currentWarehouseId: a.currentWarehouseId || a.current_warehouse_id || a.warehouseId,
      current_warehouse_id: a.currentWarehouseId || a.current_warehouse_id || a.warehouseId,
      warehouseName: a.warehouseName || a.warehouse_name || 'מחסן ראשי',
      warehouse_name: a.warehouseName || a.warehouse_name || 'מחסן ראשי',
      warehouseCode: a.warehouseCode || a.warehouse_code || 'WH',
      warehouse_code: a.warehouseCode || a.warehouse_code || 'WH',
      categoryId: a.categoryId || a.category_id || '',
      category_id: a.categoryId || a.category_id || '',
      categoryName: a.category || a.categoryName || a.category_name || '',
      category_name: a.category || a.categoryName || a.category_name || '',
      category: a.category || a.categoryName || a.category_name || '',
      toolName: a.toolName || a.tool_name || 'כלי עבודה',
      tool_name: a.toolName || a.tool_name || 'כלי עבודה',
      brand: a.brand || 'Zatout',
      modelNumber: a.modelNumber || a.model_number || null,
      model_number: a.modelNumber || a.model_number || null,
      purchaseDate: a.purchaseDate,
      purchaseCost: a.purchaseCost,
      orderNumber: a.orderNumber || a.order_number || null,
      order_number: a.orderNumber || a.order_number || null,
    }));
  }

  // 2. Compute toolCount for EACH category:
  // Count of assets where asset.category_name === cat.name || asset.category === cat.name
  const categoriesWithCount: CatalogCategory[] = categoriesList.map((cat) => {
    const toolCount = allAssets.filter(
      (asset) =>
        asset.category_name === cat.name ||
        asset.category === cat.name ||
        asset.categoryName === cat.name
    ).length;

    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      toolCount,
    };
  });

  // Filter returned assets by warehouseId if specified
  const filteredAssets =
    warehouseId && warehouseId !== 'all'
      ? allAssets.filter(
          (a) =>
            a.warehouseId === warehouseId ||
            a.currentWarehouseId === warehouseId ||
            a.current_warehouse_id === warehouseId
        )
      : allAssets;

  const result: CatalogDataPayload = {
    categories: categoriesWithCount,
    assets: filteredAssets,
    warehouses: warehousesList,
    selectedWarehouseId: warehouseId || 'all',
  };

  catalogCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  });

  return result;
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


