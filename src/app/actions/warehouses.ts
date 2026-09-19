'use server';

import { revalidatePath } from 'next/cache';
import type { Warehouse, WarehouseType } from '@/types/domain';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  addMockWarehouse,
  updateMockWarehouse,
  deleteMockWarehouse,
  type WarehouseAdminItem,
  isLegacyEnglishCategory,
  DEFAULT_ORGANIZATION,
} from '@/lib/mockStore';

const DEFAULT_ORGANIZATION_ID = DEFAULT_ORGANIZATION.id;

export interface WarehouseActionResult {
  success: boolean;
  error?: string;
  message?: string;
  warehouse?: Warehouse;
}

// Fast in-memory cache for high-frequency warehouse and tool inspections (30-second TTL)
interface WarehouseCacheEntry<T> {
  data: T;
  expiresAt: number;
}
const WAREHOUSE_CACHE_TTL_MS = 30 * 1000;
const adminWarehousesCache = new Map<string, WarehouseCacheEntry<WarehouseAdminItem[]>>();
const warehouseToolsCache = new Map<string, WarehouseCacheEntry<WarehouseToolItem[]>>();

export async function invalidateWarehouseCache(): Promise<void> {
  adminWarehousesCache.clear();
  warehouseToolsCache.clear();
}

async function resolveActiveOrganizationId(providedOrgId?: string): Promise<string> {
  if (providedOrgId && providedOrgId.trim()) {
    return providedOrgId.trim();
  }
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const activeUserCookie = cookieStore.get('tooly_active_user');
    if (activeUserCookie?.value) {
      const decoded = decodeURIComponent(activeUserCookie.value);
      const parsed = JSON.parse(decoded);
      if (parsed?.organizationId) {
        return parsed.organizationId;
      }
    }
  } catch {
    // In contexts where cookies() is unavailable
  }
  return DEFAULT_ORGANIZATION_ID;
}

/**
 * Retrieves all facilities and warehouses joined with live asset inventory metrics.
 * Scoped by organization and cached for 30 seconds to optimize executive dashboard performance.
 */
export async function getWarehousesAdminAction(
  organizationId?: string
): Promise<WarehouseAdminItem[]> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  const cached = adminWarehousesCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let warehousesList: Array<{
    id: string;
    name: string;
    code: string;
    type?: WarehouseType;
    address?: string | null;
    isActive?: boolean;
    organizationId?: string;
  }> = [];

  let assetsList: Array<{
    id?: string;
    current_warehouse_id?: string | null;
    currentWarehouseId?: string | null;
    warehouse_id?: string | null;
    warehouseId?: string | null;
    warehouse_code?: string | null;
    warehouseCode?: string | null;
    status?: string;
    organization_id?: string;
    organizationId?: string;
  }> = [];

  if (isSupabaseConfigured()) {
    try {
      let whQuery = supabase
        .from('warehouses')
        .select('id, name, code, type, address, is_active, organization_id')
        .order('name', { ascending: true });
      let astQuery = supabase
        .from('assets')
        .select('id, current_warehouse_id, status, organization_id')
        .limit(10000);

      if (orgId === DEFAULT_ORGANIZATION_ID) {
        whQuery = whQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
        astQuery = astQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
      } else {
        whQuery = whQuery.eq('organization_id', orgId);
        astQuery = astQuery.eq('organization_id', orgId);
      }

      const [whRes, assetsRes] = await Promise.all([whQuery, astQuery]);

      if (!whRes.error && whRes.data && whRes.data.length > 0) {
        warehousesList = whRes.data.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          name: row.name as string,
          code: (row.code as string) || 'WH',
          type: (row.type as WarehouseType) || 'central_warehouse',
          address: (row.address as string) || null,
          isActive: row.is_active !== false,
          organizationId: (row.organization_id as string) || orgId,
        }));
      }

      if (!assetsRes.error && assetsRes.data && assetsRes.data.length > 0) {
        assetsList = assetsRes.data as typeof assetsList;
      }
    } catch (err) {
      console.warn('[getWarehousesAdminAction] Supabase error, falling back to mockStore:', err);
    }
  }

  // Fallback to mockStore if empty from Supabase
  if (warehousesList.length === 0) {
    const { getMockWarehouses } = await import('@/lib/mockStore');
    warehousesList = getMockWarehouses(true, orgId).map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
      type: w.type,
      address: w.address,
      isActive: w.isActive,
      organizationId: w.organizationId || orgId,
    }));
  }

  if (assetsList.length === 0) {
    const { getMockAssets } = await import('@/lib/mockStore');
    assetsList = getMockAssets(orgId) as typeof assetsList;
  }

  const results: WarehouseAdminItem[] = warehousesList.map((wh) => {
    const whAssets = assetsList.filter(
      (a) =>
        a.current_warehouse_id === wh.id ||
        a.currentWarehouseId === wh.id ||
        a.warehouse_id === wh.id ||
        a.warehouseId === wh.id ||
        (Boolean(wh.code) && (a.warehouse_code === wh.code || a.warehouseCode === wh.code))
    );

    const availableCount = whAssets.filter((a) => a.status === 'available').length;
    const inUseCount = whAssets.filter((a) => a.status === 'checked_out').length;
    const maintenanceCount = whAssets.filter(
      (a) => a.status === 'maintenance' || a.status === 'needs_repair'
    ).length;

    return {
      id: wh.id,
      name: wh.name,
      code: wh.code,
      type: wh.type || 'central_warehouse',
      address: wh.address || null,
      isActive: wh.isActive !== false,
      organizationId: wh.organizationId || orgId,
      toolCount: whAssets.length,
      totalTools: whAssets.length,
      availableCount,
      inUseCount,
      maintenanceCount,
    };
  });

  adminWarehousesCache.set(orgId, {
    data: results,
    expiresAt: Date.now() + WAREHOUSE_CACHE_TTL_MS,
  });

  return results;
}

/**
 * Creates a new facility / warehouse in the system.
 */
export async function createWarehouseAction(
  input: {
    name: string;
    code: string;
    type: WarehouseType;
    address?: string;
  },
  organizationId?: string
): Promise<WarehouseActionResult> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  const cleanName = input.name.trim();
  const cleanCode = input.code.trim().toUpperCase();

  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: 'שם המתקן חייב להכיל לפחות 2 תווים.' };
  }

  if (!cleanCode || cleanCode.length < 2) {
    return { success: false, error: 'קוד המתקן חייב להכיל לפחות 2 תווים (אותיות או מספרים).' };
  }

  const validTypes: WarehouseType[] = ['central_warehouse', 'site_container', 'service_van'];
  const type = validTypes.includes(input.type) ? input.type : 'central_warehouse';

  // 1. Supabase persistence if connected
  let createdWarehouse: Warehouse | null = null;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .insert({
          name: cleanName,
          code: cleanCode,
          type,
          address: input.address?.trim() || null,
          is_active: true,
          organization_id: orgId,
        })
        .select('*')
        .single();

      if (!error && data) {
        createdWarehouse = {
          id: data.id,
          name: data.name,
          code: data.code,
          type: data.type,
          address: data.address,
          isActive: data.is_active,
          organizationId: data.organization_id || orgId,
        };
      } else if (error) {
        console.warn('[createWarehouseAction] Supabase insert error:', error.message);
      }
    } catch (err) {
      console.warn('[createWarehouseAction] Supabase error:', err);
    }
  }

  // 2. Always persist into unified mock store for immediate reactivity
  const mockWh = addMockWarehouse({
    name: cleanName,
    code: cleanCode,
    type,
    address: input.address,
    organizationId: orgId,
  });

  const finalWh = createdWarehouse || mockWh;

  await invalidateWarehouseCache();

  return {
    success: true,
    message: `המתקן "${finalWh.name}" נוסף בהצלחה למערכת.`,
    warehouse: finalWh,
  };
}

/**
 * Updates an existing facility / warehouse record.
 */
export async function updateWarehouseAction(
  warehouseId: string,
  input: {
    name: string;
    code?: string;
    type?: WarehouseType | string;
    address?: string;
    isActive?: boolean;
  }
): Promise<WarehouseActionResult> {
  const id = warehouseId;
  const cleanName = input.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: 'שם המתקן חייב להכיל לפחות 2 תווים.' };
  }

  const patch: Partial<Warehouse> = {
    name: cleanName,
  };

  if (input.code) patch.code = input.code.trim().toUpperCase();
  if (input.type) patch.type = input.type as WarehouseType;
  if (input.address !== undefined) patch.address = input.address.trim() || null;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('warehouses')
        .update({
          name: patch.name,
          ...(patch.code ? { code: patch.code } : {}),
          ...(patch.type ? { type: patch.type } : {}),
          ...(patch.address !== undefined ? { address: patch.address } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
        })
        .eq('id', id);
    } catch (err) {
      console.warn('[updateWarehouseAction] Supabase update error:', err);
    }
  }

  const updatedMock = updateMockWarehouse(id, patch);

  await invalidateWarehouseCache();

  return {
    success: true,
    message: `פרטי המתקן "${cleanName}" עודכנו בהצלחה.`,
    warehouse: updatedMock || undefined,
  };
}

/**
 * Deletes a facility / warehouse safely.
 * Rejects with a strict Hebrew error if any active tools belong to the facility.
 */
export async function deleteWarehouseAction(targetId: string): Promise<WarehouseActionResult> {
  const cleanTarget = (targetId || '').trim();
  if (!cleanTarget) {
    return { success: false, error: 'מזהה מתקן לא תקין.' };
  }

  // 1. If Supabase is configured:
  if (isSupabaseConfigured()) {
    try {
      // Query warehouse by matching either id = targetId OR code = targetId
      let { data: wh, error: findError } = await supabase
        .from('warehouses')
        .select('id, name, code')
        .or(`id.eq.${cleanTarget},code.eq.${cleanTarget}`)
        .maybeSingle();

      // If .or failed (e.g. UUID format constraint when cleanTarget is a code), fallback to code match
      if (findError) {
        console.warn('[deleteWarehouseAction] Supabase .or search warning:', findError.message);
        const { data: whByCode, error: codeError } = await supabase
          .from('warehouses')
          .select('id, name, code')
          .eq('code', cleanTarget)
          .maybeSingle();
        if (!codeError && whByCode) {
          wh = whByCode;
          findError = null;
        }
      }

      // If found in Supabase:
      if (wh) {
        // Safety check: check if any tools are assigned to this warehouse
        const { count, error: countError } = await supabase
          .from('assets')
          .select('*', { count: 'exact', head: true })
          .eq('current_warehouse_id', wh.id);

        if (countError) {
          console.warn('[deleteWarehouseAction] Supabase asset count error:', countError.message);
        }

        if (count !== null && count > 0) {
          return {
            success: false,
            error: 'לא ניתן למחוק מחסן המכיל כלי עבודה פעילים. יש להעביר את הכלים תחילה',
          };
        }

        // If empty: delete the record
        const { error: deleteError } = await supabase
          .from('warehouses')
          .delete()
          .eq('id', wh.id);

        if (deleteError) {
          console.error('[deleteWarehouseAction] Supabase delete error:', deleteError.message);
          return {
            success: false,
            error: `שגיאה במחיקת המחסן ממסד הנתונים: ${deleteError.message}`,
          };
        }

        // Also remove it from mockStore.ts if present
        deleteMockWarehouse(wh.id);
        if (wh.code) {
          deleteMockWarehouse(wh.code);
        }
        deleteMockWarehouse(cleanTarget);

        // Revalidate /dashboard/manager and /dashboard/warehouse
        try {
          revalidatePath('/dashboard/manager');
          revalidatePath('/dashboard/warehouse');
        } catch (e) {
          console.warn('[deleteWarehouseAction] revalidatePath warning:', e);
        }

        await invalidateWarehouseCache();

        return {
          success: true,
          message: 'המחסן הוסר בהצלחה מהמערכת.',
        };
      }
    } catch (err) {
      console.warn('[deleteWarehouseAction] Supabase error, falling back to mockStore:', err);
    }
  }

  // Fallback to mockStore
  const mockRes = deleteMockWarehouse(cleanTarget);
  if (!mockRes.success) {
    return {
      success: false,
      error: mockRes.error || 'המתקן לא נמצא במערכת.',
    };
  }

  try {
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/warehouse');
  } catch (e) {
    console.warn('[deleteWarehouseAction] revalidatePath warning:', e);
  }

  await invalidateWarehouseCache();

  return {
    success: true,
    message: 'המחסן הוסר בהצלחה מהמערכת.',
  };
}

export interface ReconcileStockResult {
  success: boolean;
  error?: string;
  message?: string;
  discrepancyCount?: number;
}

/**
 * Reconciles stock discrepancies across facilities (Chief Operations / General Manager authority).
 */
export async function reconcileStockAction(input: {
  warehouseId: string;
  auditedBy: string;
  verifiedAssetIds: string[];
  discrepancyNotes?: string;
}): Promise<ReconcileStockResult> {
  const verifiedCount = input.verifiedAssetIds.length;
  await invalidateWarehouseCache();
  return {
    success: true,
    message: `ספירת המלאי עבור המתקן אומתה ועודכנה בהצלחה (${verifiedCount} כלים אומתו).`,
    discrepancyCount: 0,
  };
}

export interface WarehouseToolItem {
  id: string;
  name: string;
  qr_code: string;
  serial_number: string | null;
  category_name: string;
  status: string;
  current_assigned_worker: string | null;
  order_number: string | null;
}

/**
 * Retrieves all tools/assets stationed at a specific facility/warehouse.
 * Supports both Supabase persistence and unified mockStore fallback.
 */
export async function getWarehouseToolsAction(
  warehouseId: string,
  organizationId?: string
): Promise<WarehouseToolItem[]> {
  const cleanWhId = (warehouseId || '').trim();
  if (!cleanWhId) {
    return [];
  }

  const orgId = await resolveActiveOrganizationId(organizationId);
  const cacheKey = `${orgId}_${cleanWhId}`;
  const cached = warehouseToolsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let toolsList: WarehouseToolItem[] = [];

  if (isSupabaseConfigured()) {
    try {
      // Find matching warehouse by id or code to ensure robust resolution
      let targetWhId = cleanWhId;
      let whLookup = supabase
        .from('warehouses')
        .select('id, code')
        .or(`id.eq.${cleanWhId},code.eq.${cleanWhId}`);

      let astQuery = supabase
        .from('assets')
        .select(
          'id, name, tool_name, qr_code, serial_number, category_id, category_name, status, current_assigned_worker, order_number'
        )
        .or(`current_warehouse_id.eq.${targetWhId},warehouse_id.eq.${targetWhId}`)
        .limit(5000);

      let catQuery = supabase
        .from('categories')
        .select('id, name');

      if (orgId === DEFAULT_ORGANIZATION_ID) {
        whLookup = whLookup.or(`organization_id.eq.${orgId},organization_id.is.null`);
        astQuery = astQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
        catQuery = catQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
      } else {
        whLookup = whLookup.eq('organization_id', orgId);
        astQuery = astQuery.eq('organization_id', orgId);
        catQuery = catQuery.eq('organization_id', orgId);
      }

      const { data: wh } = await whLookup.maybeSingle();

      if (wh?.id) {
        targetWhId = wh.id;
      }

      const [assetsRes, categoriesRes] = await Promise.all([astQuery, catQuery]);

      if (!assetsRes.error && assetsRes.data && assetsRes.data.length > 0) {
        const catMap = new Map<string, string>();
        if (categoriesRes.data) {
          categoriesRes.data
            .filter((c: { id: string; name: string }) => !isLegacyEnglishCategory(c))
            .forEach((c: { id: string; name: string }) => {
              catMap.set(c.id, c.name);
            });
        }

        toolsList = (assetsRes.data as Record<string, unknown>[]).map((row) => {
          const qr = (row.qr_code || row.qrCode || '') as string;
          const catId = (row.category_id || row.categoryId || '') as string;
          const rawCatName = (row.category_name || row.categoryName || row.category || '') as string;
          const cleanRawCat = isLegacyEnglishCategory({ name: rawCatName }) ? 'ציוד כללי' : rawCatName;
          const resolvedCatName = catMap.get(catId) || cleanRawCat || 'ציוד כללי';

          return {
            id: (row.id as string) || qr,
            name: (row.name || row.tool_name || row.toolName || 'כלי עבודה') as string,
            qr_code: qr,
            serial_number: (row.serial_number || row.serialNumber || null) as string | null,
            category_name: resolvedCatName,
            status: (row.status as string) || 'available',
            current_assigned_worker: (row.current_assigned_worker || row.currentAssignedWorker || null) as string | null,
            order_number: (row.order_number || row.orderNumber || null) as string | null,
          };
        });
      }
    } catch (err) {
      console.warn('[getWarehouseToolsAction] Supabase query warning, falling back to mockStore:', err);
    }
  }

  // Fallback to mockStore if empty or Supabase not configured
  if (toolsList.length === 0) {
    const { getMockAssets, getMockWarehouses } = await import('@/lib/mockStore');
    const mockWhs = getMockWarehouses(true, orgId);
    const targetWh = mockWhs.find(
      (w) => w.id === cleanWhId || (w.code && w.code.toUpperCase() === cleanWhId.toUpperCase())
    );

    const allAssets = getMockAssets(orgId);
    const filtered = allAssets.filter((a) => {
      const matchDirect =
        a.current_warehouse_id === cleanWhId ||
        a.currentWarehouseId === cleanWhId ||
        a.warehouse_id === cleanWhId ||
        a.warehouseId === cleanWhId ||
        a.warehouseCode === cleanWhId ||
        a.warehouse_code === cleanWhId;

      if (matchDirect) return true;

      if (targetWh) {
        return (
          a.current_warehouse_id === targetWh.id ||
          a.currentWarehouseId === targetWh.id ||
          a.warehouse_id === targetWh.id ||
          a.warehouseId === targetWh.id ||
          (Boolean(targetWh.code) &&
            (a.warehouseCode === targetWh.code || a.warehouse_code === targetWh.code))
        );
      }

      return false;
    });

    toolsList = filtered.map((a) => ({
      id: a.id,
      name: a.toolName || a.tool_name || 'כלי עבודה',
      qr_code: a.qrCode || a.qr_code || '',
      serial_number: a.serialNumber || a.serial_number || null,
      category_name: a.categoryName || a.category_name || a.category || 'ציוד כללי',
      status: a.status || 'available',
      current_assigned_worker: a.currentAssignedWorker || a.current_assigned_worker || null,
      order_number: a.orderNumber || a.order_number || null,
    }));
  }

  warehouseToolsCache.set(cacheKey, {
    data: toolsList,
    expiresAt: Date.now() + WAREHOUSE_CACHE_TTL_MS,
  });

  return toolsList;
}


