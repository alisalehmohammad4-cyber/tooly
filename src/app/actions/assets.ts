'use server';

import { revalidatePath } from 'next/cache';
import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { QuickOnboardSchema, type QuickOnboardInput } from '@/core/assets/onboard.schema';
import type { AssetReservation, AssetStatus } from '@/types/domain';
import { appendAuditHistoryEntry } from '@/app/actions/history';
import { getServerSessionOrgId, getServerSessionUser } from '@/lib/auth/session';
import { clearDashboardCaches } from '@/app/actions/dashboard';
import {
  getMockWarehouses,
  getMockCategories,
  getMockAssetByQr,
  addMockAsset,
  mutateMockAsset,
  getMockAssets,
  getMockCatalogData,
  getNextAvailableMockTagNumber,
  getMockOrganization,
  isLegacyEnglishCategory,
  DEFAULT_ORGANIZATION,
} from '@/lib/mockStore';

export interface OnboardFormData {
  warehouses: Array<{ id: string; name: string; code: string }>;
  categories: Array<{ id: string; name: string; slug: string; icon: string | null }>;
}

async function resolveActiveOrganizationId(providedOrgId?: string): Promise<string | null> {
  return getServerSessionOrgId(providedOrgId);
}

function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

export type OnboardAssetResult =
  | { success: true; assetId: string }
  | { success: false; error: string };

/**
 * Queries and returns active warehouses and categories ordered by display_order.
 * Strictly filters out legacy English demo categories.
 */
export async function getOnboardFormData(organizationId?: string): Promise<OnboardFormData> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return { warehouses: [], categories: [] };
  }

  if (!isSupabaseConfigured()) {
    return {
      warehouses: getMockWarehouses(orgId).map((w) => ({ id: w.id, name: w.name, code: w.code })),
      categories: getMockCategories(orgId)
        .filter((c) => !isLegacyEnglishCategory(c))
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon ?? null,
        })),
    };
  }

  let whQuery = supabase.from('warehouses').select('id, name, code').eq('is_active', true);
  let catQuery = supabase.from('categories').select('id, name, slug, icon').order('display_order', { ascending: true });

  whQuery = whQuery.eq('organization_id', orgId);
  catQuery = catQuery.eq('organization_id', orgId);

  const [warehousesResponse, categoriesResponse] = await Promise.all([whQuery, catQuery]);

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
        : getMockCategories(orgId ?? undefined)
            .filter((c) => !isLegacyEnglishCategory(c))
            .map((c) => ({
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
export async function checkQrCodeExists(qrCode: string, organizationId?: string): Promise<boolean> {
  const sanitizedQr = qrCode.trim();
  if (!sanitizedQr) {
    return false;
  }
  const orgId = await resolveActiveOrganizationId(organizationId);

  if (!isSupabaseConfigured()) {
    return Boolean(getMockAssetByQr(sanitizedQr, undefined, orgId ?? undefined));
  }

  try {
    let query = supabase
      .from('assets')
      .select('id')
      .eq('qr_code', sanitizedQr);

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return Boolean(getMockAssetByQr(sanitizedQr, undefined, orgId ?? undefined));
    }
    return Boolean(data);
  } catch {
    return Boolean(getMockAssetByQr(sanitizedQr, undefined, orgId ?? undefined));
  }
}

/**
 * Validates and enrolls an asset into the system.
 */
export async function onboardAsset(
  rawInput: QuickOnboardInput,
  organizationId?: string
): Promise<OnboardAssetResult> {
  const orgId = await resolveActiveOrganizationId(organizationId);

  // 1. Validate input schema
  const parsed = QuickOnboardSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join(', ');
    return { success: false, error: errorMessages };
  }

  const input = parsed.data;

  if (!isSupabaseConfigured()) {
    const exists = Boolean(getMockAssetByQr(input.qrCode, undefined, orgId ?? undefined));
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
      organizationId: orgId ?? undefined,
      poNumber: input.poNumber || input.po_number || undefined,
      supplyLocation: input.supplyLocation || input.supply_location || undefined,
    });

    await invalidateCatalogCache();

    return {
      success: true,
      assetId: newAsset.id,
    };
  }

  try {
    // 2. Check if QR code is already registered
    const exists = await checkQrCodeExists(input.qrCode, orgId ?? undefined);
    if (exists) {
      return {
        success: false,
        error: `QR code "${input.qrCode}" is already registered.`,
      };
    }

    // 3. Find or create tool model
    let toolModelId: string;
    const { data: existingModel, error: findModelError } = await supabaseAdmin
      .from('tool_models')
      .select('id')
      .eq('category_id', input.categoryId)
      .eq('name', input.toolName)
      .eq('brand', input.brand)
      .eq('organization_id', orgId)
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
      const { data: newModel, error: createModelError } = await supabaseAdmin
        .from('tool_models')
        .insert({
          category_id: input.categoryId,
          name: input.toolName,
          brand: input.brand,
          model_number: input.modelNumber || null,
          is_serialized: true,
          organization_id: orgId,
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

    const effectivePo = input.poNumber || input.po_number || null;
    const effectiveSupplyLoc = input.supplyLocation || input.supply_location || null;

    // 4. Insert new asset
    const { data: newAsset, error: assetError } = await supabaseAdmin
      .from('assets')
      .insert({
        tool_model_id: toolModelId,
        qr_code: input.qrCode,
        nfc_uid: input.nfcUid || null,
        current_warehouse_id: input.warehouseId,
        status: 'available',
        condition: input.condition,
        version: 1,
        organization_id: orgId,
        po_number: effectivePo,
        supply_location: effectiveSupplyLoc,
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
    const { error: ledgerError } = await supabaseAdmin
      .from('custody_ledger')
      .insert({
        asset_id: newAsset.id,
        action: 'CHECKIN',
        performed_by: 'Field Agent',
        notes: effectivePo ? `Initial field enrollment (PO: ${effectivePo})` : 'Initial field enrollment via Quick Onboard',
        gps_lat: input.gps?.lat ?? null,
        gps_lng: input.gps?.lng ?? null,
        organization_id: orgId,
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
      organizationId: orgId ?? undefined,
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
  warehouse?: string;
  current_warehouse?: { id: string; name: string; code: string } | null;
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
  poNumber?: string | null;
  po_number?: string | null;
  supplyLocation?: string | null;
  supply_location?: string | null;
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
export async function getCatalogData(
  warehouseId?: string,
  organizationId?: string
): Promise<CatalogDataPayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return {
      categories: [],
      assets: [],
      warehouses: [],
      selectedWarehouseId: warehouseId || 'all',
    };
  }

  const cacheKey = `catalog_${orgId}_${warehouseId || 'all'}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!isSupabaseConfigured()) {
    const data = getMockCatalogData(warehouseId, orgId);
    catalogCache.set(cacheKey, { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
    return data;
  }

  let warehousesList: Array<{ id: string; name: string; code: string }> = [];
  let categoriesList: Array<{ id: string; name: string; slug: string; icon: string | null }> = [];
  let allAssets: CatalogAssetItem[] = [];

  try {
    const whQuery = supabaseAdmin.from('warehouses').select('id, name, code').eq('is_active', true).eq('organization_id', orgId);
    const catQuery = supabaseAdmin.from('categories').select('id, name, slug, icon').eq('organization_id', orgId).order('display_order', { ascending: true });
    const astQuery = supabaseAdmin
      .from('assets')
      .select(`
        *,
        tool_models (*),
        current_warehouse:current_warehouse_id (id, name, code)
      `)
      .eq('organization_id', orgId);

    const [warehousesRes, categoriesRes, firstAssetsRes] = await Promise.all([
      whQuery,
      catQuery,
      astQuery.range(0, 999),
    ]);

    if (!warehousesRes.error && warehousesRes.data && warehousesRes.data.length > 0) {
      warehousesList = warehousesRes.data;
    }
    if (!categoriesRes.error && categoriesRes.data && categoriesRes.data.length > 0) {
      categoriesList = (
        categoriesRes.data as Array<{ id: string; name: string; slug: string; icon: string | null }>
      ).filter((c) => !isLegacyEnglishCategory(c));
    }

    let rawAssetsRows: Record<string, unknown>[] = [];
    if (!firstAssetsRes.error && firstAssetsRes.data) {
      rawAssetsRows = [...firstAssetsRes.data];
      if (firstAssetsRes.data.length === 1000) {
        let page = 1;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin
            .from('assets')
            .select(`
              *,
              tool_models (*),
              current_warehouse:current_warehouse_id (id, name, code)
            `)
            .eq('organization_id', orgId)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error || !data || data.length === 0) break;
          rawAssetsRows.push(...data);
          if (data.length < pageSize) break;
          page++;
        }
      }
    }

    if (rawAssetsRows.length > 0) {
      const warehouseMap = new Map(warehousesList.map((w) => [w.id, w]));
      const categoryMap = new Map(categoriesList.map((c) => [c.id, c]));
      const categoryNameMap = new Map(categoriesList.map((c) => [c.name, c]));
      const mockAssetMap = new Map(getMockAssets(orgId).map((a) => [a.qrCode, a]));

      allAssets = rawAssetsRows.map((asset: any) => {
        const qr = (asset.qr_code || asset.qrCode || '') as string;
        const mockFallback = mockAssetMap.get(qr);

        const currentWh = asset.current_warehouse as { id?: string; name?: string; code?: string } | null | undefined;
        const whId = (currentWh?.id ||
          asset.current_warehouse_id ||
          asset.warehouse_id ||
          asset.currentWarehouseId ||
          mockFallback?.currentWarehouseId ||
          mockFallback?.warehouseId ||
          '') as string;
        const wh = currentWh?.name ? currentWh : warehouseMap.get(whId);

        // Explicit resolved warehouse name: Prioritize joined current_warehouse
        const resolvedWhName =
          asset.current_warehouse?.name ||
          wh?.name ||
          'מתקן כללי';

        const catId = (asset.category_id || asset.categoryId || asset.tool_models?.category_id || mockFallback?.categoryId || '') as string;
        const catName = (asset.category_name || asset.categoryName || asset.category || '') as string;
        const cat = categoryMap.get(catId) || (catName ? categoryNameMap.get(catName) : undefined);

        const worker = (asset.current_assigned_worker ||
          asset.currentAssignedWorker ||
          mockFallback?.currentAssignedWorker ||
          null) as string | null;

        const rawToolName = (asset.tool_name ||
          asset.toolName ||
          asset.name ||
          asset.tool_models?.name ||
          mockFallback?.toolName ||
          '') as string;

        const toolName =
          !rawToolName ||
          rawToolName.trim() === '' ||
          rawToolName.trim().toUpperCase() === 'X' ||
          rawToolName.trim() === '-'
            ? 'ציוד כללי / כלי עבודה'
            : rawToolName.trim();

        const brand = (asset.brand || asset.tool_models?.brand || mockFallback?.brand || 'כללי') as string;
        const modelNumber = (asset.model_number ||
          asset.modelNumber ||
          asset.tool_models?.model_number ||
          mockFallback?.modelNumber ||
          null) as string | null;

        const orderNum = (asset.order_number ||
          asset.orderNumber ||
          mockFallback?.orderNumber ||
          null) as string | null;

        const resolvedCatName = cat?.name || catName || mockFallback?.categoryName || 'ציוד כללי';

        return {
          ...asset,
          id: (asset.id || mockFallback?.id || '') as string,
          qrCode: qr,
          qr_code: qr,
          status: (asset.status || mockFallback?.status || 'available') as AssetStatus,
          condition: (asset.condition || mockFallback?.condition || 'good') as
            | 'excellent'
            | 'good'
            | 'needs_repair'
            | 'retired',
          currentAssignedWorker: worker,
          current_assigned_worker: worker,
          warehouseId: whId,
          currentWarehouseId: whId,
          current_warehouse_id: whId,
          warehouseName: asset.current_warehouse?.name || wh?.name || 'מתקן כללי',
          warehouse_name: asset.current_warehouse?.name || wh?.name || 'מתקן כללי',
          warehouse: asset.current_warehouse?.name || wh?.name || 'מתקן כללי',
          current_warehouse: asset.current_warehouse || (currentWh ? { id: currentWh.id || whId, name: resolvedWhName, code: currentWh.code || '' } : (wh ? { id: wh.id, name: wh.name, code: wh.code } : null)),
          warehouseCode:
            currentWh?.code || wh?.code || mockFallback?.warehouseCode || (asset.warehouse_code as string) || 'WH',
          warehouse_code:
            currentWh?.code || wh?.code || mockFallback?.warehouseCode || (asset.warehouse_code as string) || 'WH',
          categoryId: cat?.id || catId,
          category_id: cat?.id || catId,
          categoryName: resolvedCatName,
          category_name: resolvedCatName,
          category: resolvedCatName,
          toolName,
          tool_name: toolName,
          brand,
          modelNumber,
          model_number: modelNumber,
          purchaseDate: (asset.purchase_date ||
            asset.purchaseDate ||
            mockFallback?.purchaseDate) as string | undefined,
          purchaseCost:
            Number(asset.purchase_cost || asset.purchaseCost || mockFallback?.purchaseCost) || 2500,
          orderNumber: orderNum,
          order_number: orderNum,
          poNumber: (asset.po_number || asset.poNumber || mockFallback?.poNumber || null) as string | null,
          po_number: (asset.po_number || asset.poNumber || mockFallback?.po_number || null) as string | null,
          supplyLocation: (asset.supply_location || asset.supplyLocation || mockFallback?.supplyLocation || null) as string | null,
          supply_location: (asset.supply_location || asset.supplyLocation || mockFallback?.supply_location || null) as string | null,
        };
      });
    }
  } catch (err) {
    console.warn('Supabase error in getCatalogData, falling back to mockStore:', err);
    const data = getMockCatalogData(warehouseId, orgId);
    catalogCache.set(cacheKey, { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
    return data;
  }

  // Fallback to mockStore scoped specifically to orgId if empty from Supabase
  if (warehousesList.length === 0) {
    warehousesList = getMockWarehouses(false, orgId).map((w) => ({ id: w.id, name: w.name, code: w.code }));
  }
  if (categoriesList.length === 0) {
    categoriesList = getMockCategories(orgId)
      .filter((c) => !isLegacyEnglishCategory(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon ?? null,
      }));
  }

  // 2. Compute toolCount for EACH category:
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

  // 3. Filter assets by selected warehouse if requested
  const filteredAssets =
    warehouseId && warehouseId !== 'all'
      ? allAssets.filter((a) => a.warehouseId === warehouseId || a.currentWarehouseId === warehouseId)
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
export async function calculateNextTagNumber(
  orgId?: string | null,
  prefix: string = 'TOOL-'
): Promise<number> {
  const cleanPrefix = prefix.trim().toUpperCase();
  let maxNumber = 0;

  // 1. Check mock store assets
  const mockNext = getNextAvailableMockTagNumber(cleanPrefix, orgId ?? undefined);
  if (mockNext > 1) {
    maxNumber = Math.max(maxNumber, mockNext - 1);
  }

  // 2. Check live Supabase assets (if configured and has items)
  if (isSupabaseConfigured() && orgId) {
    try {
      const isZr = cleanPrefix.startsWith('ZR');
      const prefixPattern = isZr ? 'ZR%' : `${cleanPrefix}%`;
      const { data, error } = await supabaseAdmin
        .from('assets')
        .select('qr_code')
        .eq('organization_id', orgId)
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

  return (cleanPrefix.startsWith('ZR') && orgId === DEFAULT_ORGANIZATION.id) ? 1099 : 1;
}

/**
 * Returns the next available fully-formatted tag identifier for an organization.
 * Fetches dynamic serial_prefix from Supabase or mock store.
 */
export async function getNextAvailableTagNumberAction(customOrgId?: string): Promise<string> {
  const orgId = customOrgId || (await resolveActiveOrganizationId());

  let prefix = 'TOOL-';
  if (isSupabaseConfigured() && orgId) {
    try {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('serial_prefix')
        .eq('id', orgId)
        .single();
      if (org?.serial_prefix) prefix = org.serial_prefix;
    } catch (err) {
      console.warn('Error fetching organization serial_prefix from Supabase:', err);
    }
  } else if (orgId) {
    const mockOrg = getMockOrganization(orgId);
    if (mockOrg?.serialPrefix) prefix = mockOrg.serialPrefix;
  }

  const nextNum = await calculateNextTagNumber(orgId, prefix);
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Direct Tool Status Switcher Action:
 * Allows storekeepers & managers to quickly toggle asset status:
 * - available (זמין במלאי)
 * - checked_out (בשימוש עובד)
 * - maintenance (בתיקון / אחזקה)
 * - retired (מושבת / גריטה)
 * Updates public.assets and writes audit entry to public.custody_ledger.
 */
export async function updateAssetStatusAction(
  assetId: string,
  newStatus: string,
  reason?: string
): Promise<{ success: boolean; error?: string; message?: string; newStatus?: string }> {
  if (!assetId) {
    return { success: false, error: 'מזהה כלי חסר' };
  }

  const validStatuses = ['available', 'in_stock', 'checked_out', 'maintenance', 'retired', 'in_transit'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, error: `סטטוס לא חוקי: ${newStatus}` };
  }

  const orgId = await resolveActiveOrganizationId();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const sessionUser = await getServerSessionUser();
  const performedBy = sessionUser?.fullName || 'מחסנאי / מנהל';
  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
  };

  if (newStatus === 'available' || newStatus === 'in_stock') {
    updateData.current_assigned_worker = null;
  }
  if (newStatus === 'retired') {
    updateData.condition = 'retired';
  } else if (newStatus === 'maintenance') {
    updateData.condition = 'needs_repair';
  }

  if (isSupabaseConfigured() && orgId) {
    try {
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          ...updateData,
          organization_id: orgId,
        })
        .eq('id', assetId);

      if (orgId) {
        updateQuery.eq('organization_id', orgId);
      }

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        console.error('Update Asset Status DB Error:', updateErr);
        return { success: false, error: `שגיאה בעדכון סטטוס כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const actionType =
        newStatus === 'retired'
          ? 'RETIRE'
          : newStatus === 'maintenance'
          ? 'MAINTENANCE'
          : newStatus === 'available' || newStatus === 'in_stock'
          ? 'CHECKIN'
          : 'STATUS_CHANGE';

      let targetWarehouseId = updatedRows[0]?.current_warehouse_id;
      if (!targetWarehouseId || !isValidUuid(targetWarehouseId)) {
        const { data: fallbackWh } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        targetWarehouseId = fallbackWh?.id || null;
      }

      const { error: ledgerErr } = await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        organization_id: orgId,
        action: actionType,
        warehouse_id: targetWarehouseId,
        to_warehouse_id: targetWarehouseId,
        from_warehouse_id: targetWarehouseId,
        performed_by: performedBy,
        condition_at_return: (updatedRows[0] as any)?.condition || null,
        notes: reason || `שינוי סטטוס כלי ישיר ל-${newStatus}`,
        created_at: now,
      });

      if (ledgerErr) {
        console.error('LEDGER INSERT FAILED:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerErr.message };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Synchronize mock store
  mutateMockAsset(
    assetId,
    {
      status: newStatus as AssetStatus,
      ...(newStatus === 'available' ? { currentAssignedWorker: null } : {}),
      ...(newStatus === 'retired' ? { condition: 'retired' } : {}),
      ...(newStatus === 'maintenance' ? { condition: 'needs_repair' } : {}),
    },
    {
      action: newStatus === 'retired' ? 'RETIRE' : newStatus === 'maintenance' ? 'MAINTENANCE_FLAG' : 'CHECKIN',
      performedBy,
      notes: reason || `שינוי סטטוס כלי ישיר ל-${newStatus}`,
    }
  );

  try {
    await clearDashboardCaches();
    revalidatePath('/catalog');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/manager');
    revalidatePath('/history');
  } catch (e) {
    console.warn('[updateAssetStatusAction] revalidatePath warning:', e);
  }

  const statusLabel =
    newStatus === 'available'
      ? 'זמין במלאי'
      : newStatus === 'checked_out'
      ? 'בשימוש עובד'
      : newStatus === 'maintenance'
      ? 'בתיקון / אחזקה'
      : newStatus === 'retired'
      ? 'מושבת / גריטה'
      : newStatus;

  return {
    success: true,
    message: `סטטוס הכלי עודכן בהצלחה ל-${statusLabel}`,
    newStatus,
  };
}


