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
  status: AssetStatus;
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
  currentAssignedWorker: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  categoryId: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyUntil?: string;
  photoUrl?: string;
  safetyInspectionDue?: string;
  isLocked?: boolean;
  lockReason?: string;
  reservation?: AssetReservation | null;
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
      status: AssetStatus;
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

/**
 * Detects the highest existing tag/QR serial number matching the prefix
 * across database assets and mock store, and returns the next sequential number.
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


