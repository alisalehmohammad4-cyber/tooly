'use server';

import { revalidatePath } from 'next/cache';
import { supabase, isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';
import { clearDashboardCaches } from '@/app/actions/dashboard';
import {
  CheckoutSchema,
  BulkCheckoutSchema,
  CheckinSchema,
  TransferSchema,
  type CheckoutInput,
  type BulkCheckoutInput,
  type CheckinInput,
  type TransferInput,
  type AssetAccessories,
} from '@/core/assets/custody.schema';
import type { AssetReservation, AssetStatus } from '@/types/domain';
import { appendAuditHistoryEntry } from '@/app/actions/history';
import {
  matchesCodeSuffix,
  pickBestAssetMatch,
} from '@/lib/search/toolDictionary';

export interface ScannedAssetDetails {
  id: string;
  qrCode: string;
  qr_code?: string;
  nfcUid?: string;
  status: AssetStatus;
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
  currentAssignedWorker: string | null;
  current_assigned_worker?: string | null;
  currentWarehouseId: string;
  current_warehouse_id?: string;
  warehouseId?: string;
  warehouseName: string;
  warehouse_name?: string;
  warehouseCode: string;
  warehouse_code?: string;
  toolName: string;
  tool_name?: string;
  brand: string;
  modelNumber: string | null;
  model_number?: string | null;
  version: number;
  expectedReturnDate?: string | null;
  accessories?: AssetAccessories | null;
  // Phase 13 Fleet Control & Safety Lockout fields:
  purchaseDate?: string;
  purchaseCost?: number; // ILS / ₪
  purchase_cost?: number; // ILS / ₪
  warrantyUntil?: string;
  photoUrl?: string;
  safetyInspectionDue?: string; // ISO date
  isLocked?: boolean;
  lockReason?: string;
  reservation?: AssetReservation | null;
  orderNumber?: string | null;
  order_number?: string | null;
  poNumber?: string | null;
  po_number?: string | null;
  supplyLocation?: string | null;
  supply_location?: string | null;
  category?: string;
  categoryName?: string;
  category_name?: string;
  organizationId?: string;
  organization_id?: string;
  lastCheckoutNote?: string | null;
  last_checkout_note?: string | null;
}

export type CustodyActionResult =
  | { success: true; message: string; asset: ScannedAssetDetails }
  | { success: false; error: string };

export type BulkCustodyActionResult =
  | {
      success: true;
      message: string;
      checkedOutCount: number;
      assets: ScannedAssetDetails[];
    }
  | { success: false; error: string };

import { getServerSessionOrgId, getServerSessionUser } from '@/lib/auth/session';
import {
  getMockAssetByQr,
  mutateMockAsset,
  getMockAssets,
  getMockWarehouses,
} from '@/lib/mockStore';

export async function resolveActiveOrganizationId(providedOrgId?: string): Promise<string | null> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || null;
}

// In-memory fallback dataset synchronized with unified mockStore
const FALLBACK_CUSTODY_ASSETS: Record<string, ScannedAssetDetails> = {};

function initCustodyAssets() {
  getMockAssets().forEach((a) => {
    FALLBACK_CUSTODY_ASSETS[a.qrCode] = {
      id: a.id,
      qrCode: a.qrCode,
      status: a.status,
      condition: a.condition,
      currentAssignedWorker: a.currentAssignedWorker,
      currentWarehouseId: a.warehouseId,
      warehouseName: a.warehouseName,
      warehouseCode: a.warehouseCode,
      toolName: a.toolName,
      brand: a.brand,
      modelNumber: a.modelNumber,
      version: a.version,
      purchaseDate: a.purchaseDate,
      purchaseCost: a.purchaseCost,
      warrantyUntil: a.warrantyUntil,
      safetyInspectionDue: a.safetyInspectionDue,
      isLocked: a.isLocked,
      lockReason: a.lockReason,
      expectedReturnDate: a.expectedReturnDate,
      accessories: a.accessories,
      organizationId: a.organizationId,
    };
  });
}
initCustodyAssets();

function getWarehouseMeta(warehouseId: string): { name: string; code: string } {
  const wh = getMockWarehouses().find((w) => w.id === warehouseId);
  if (wh) {
    return { name: wh.name, code: wh.code };
  }
  return { name: 'מחסן שטח פעיל', code: 'WH' };
}

/**
 * Checks whether an asset is restricted by administrative lock or overdue safety inspection.
 */
function checkToolLockout(asset: ScannedAssetDetails): { allowed: boolean; error?: string } {
  if (asset.isLocked) {
    return {
      allowed: false,
      error: `הכלי נעול מנהלית: ${asset.lockReason || 'נעול להוצאה מהמחסן'}`,
    };
  }

  if (asset.safetyInspectionDue) {
    const dueTime = new Date(asset.safetyInspectionDue).getTime();
    if (!isNaN(dueTime) && dueTime < Date.now()) {
      return {
        allowed: false,
        error: '⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית',
      };
    }
  }

  return { allowed: true };
}

interface JoinedAssetData {
  id: string;
  qr_code: string;
  nfc_uid?: string | null;
  status: ScannedAssetDetails['status'];
  condition: ScannedAssetDetails['condition'];
  current_assigned_worker: string | null;
  current_warehouse_id: string;
  version: number;
  purchase_date?: string;
  purchase_cost?: number;
  warranty_until?: string;
  safety_inspection_due?: string;
  is_locked?: boolean;
  lock_reason?: string;
  reservation?: AssetReservation | null;
  po_number?: string | null;
  supply_location?: string | null;
  name?: string | null;
  brand?: string | null;
  model_number?: string | null;
  model?: string | null;
  tag_number?: string | null;
  tool_models: {
    id: string;
    name: string;
    brand: string;
    model_number: string | null;
  } | null;
  warehouses: {
    id: string;
    name: string;
    code: string;
  } | null;
}

function mapJoinedRowToScannedAsset(row: JoinedAssetData): ScannedAssetDetails {
  return {
    id: row.id,
    qrCode: row.qr_code,
    nfcUid: row.nfc_uid || undefined,
    status: row.status,
    condition: row.condition,
    currentAssignedWorker: row.current_assigned_worker,
    currentWarehouseId: row.current_warehouse_id,
    warehouseName: row.warehouses?.name || 'Assigned Facility',
    warehouseCode: row.warehouses?.code || 'FAC',
    toolName: row.name || row.tool_models?.name || 'כלי עבודה',
    brand: row.brand || row.tool_models?.brand || 'כלי',
    modelNumber: row.model_number || row.model || row.tool_models?.model_number || null,
    version: row.version || 1,
    purchaseDate: row.purchase_date,
    purchaseCost: row.purchase_cost,
    purchase_cost: row.purchase_cost,
    warrantyUntil: row.warranty_until,
    safetyInspectionDue: row.safety_inspection_due,
    isLocked: row.is_locked,
    lockReason: row.lock_reason,
    reservation: row.reservation,
    poNumber: row.po_number,
    po_number: row.po_number,
    supplyLocation: row.supply_location,
    supply_location: row.supply_location,
  };
}

async function enrichLastCheckoutNote(
  asset: ScannedAssetDetails | null,
  orgId: string
): Promise<ScannedAssetDetails | null> {
  if (!asset || asset.status !== 'checked_out') return asset;
  if (isSupabaseConfigured()) {
    try {
      const { data: latestCheckout } = await supabase
        .from('custody_ledger')
        .select('notes')
        .eq('asset_id', asset.id)
        .eq('action', 'CHECKOUT')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCheckout?.notes) {
        asset.lastCheckoutNote = latestCheckout.notes;
        asset.last_checkout_note = latestCheckout.notes;
      }
    } catch {
      // Ignore errors in background note resolution
    }
  } else {
    try {
      const { getMockAuditHistory } = await import('@/lib/mockStore');
      const mockHistory = getMockAuditHistory(undefined, orgId).records;
      const checkoutRec = mockHistory.find(
        (r) => (r.assetId === asset.id || r.qrCode === asset.qrCode) && r.action === 'CHECKOUT'
      );
      if (checkoutRec?.notes) {
        asset.lastCheckoutNote = checkoutRec.notes;
        asset.last_checkout_note = checkoutRec.notes;
      }
    } catch {
      // Ignore
    }
  }
  return asset;
}

/**
 * Retrieves full asset details by QR Code, joining tool model and warehouse.
 * 1. First, attempt exact match on qr_code and nfc_uid.
 * 2. If no exact match: perform suffix matching (qr_code ILIKE '%' || input or serial_number ILIKE '%' || input).
 * 3. If multiple match, return the exact active asset matching the facility.
 */
export async function getAssetDetailsByQr(
  qrCode: string,
  facilityId?: string,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  const cleanQr = qrCode.trim();
  if (!cleanQr) return null;

  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId || orgId === 'platform-master-superadmin') return null;

  if (isSupabaseConfigured()) {
    try {
      // 1. First, attempt exact match on qr_code, nfc_uid, or id
      let exactQuery = supabase
        .from('assets')
        .select(`
          id,
          qr_code,
          nfc_uid,
          status,
          condition,
          current_assigned_worker,
          current_warehouse_id,
          version,
          purchase_date,
          purchase_cost,
          warranty_until,
          safety_inspection_due,
          is_locked,
          lock_reason,
          reservation,
          po_number,
          supply_location,
          name,
          brand,
          model_number,
          tag_number,
          tool_models:tool_model_id (
            id,
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        `)
        .or(`qr_code.eq.${cleanQr},nfc_uid.eq.${cleanQr},id.eq.${cleanQr}`);

      exactQuery = exactQuery.eq('organization_id', orgId);

      const { data: exactData, error: exactError } = await exactQuery.maybeSingle();

      if (!exactError && exactData) {
        return enrichLastCheckoutNote(
          mapJoinedRowToScannedAsset(exactData as unknown as JoinedAssetData),
          orgId
        );
      }

      // 2. Suffix matching in Supabase: qr_code ILIKE '%' || input
      let suffixQuery = supabase
        .from('assets')
        .select(`
          id,
          qr_code,
          nfc_uid,
          status,
          condition,
          current_assigned_worker,
          current_warehouse_id,
          version,
          purchase_date,
          purchase_cost,
          warranty_until,
          safety_inspection_due,
          is_locked,
          lock_reason,
          reservation,
          po_number,
          supply_location,
          name,
          brand,
          model_number,
          tag_number,
          tool_models:tool_model_id (
            id,
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        `)
        .ilike('qr_code', `%${cleanQr}`);

      suffixQuery = suffixQuery.eq('organization_id', orgId);

      const { data: suffixData, error: suffixError } = await suffixQuery;

      if (!suffixError && suffixData && suffixData.length > 0) {
        const typedRows = suffixData as unknown as JoinedAssetData[];
        const best = pickBestAssetMatch(typedRows, cleanQr, facilityId);
        if (best) {
          return enrichLastCheckoutNote(mapJoinedRowToScannedAsset(best), orgId);
        }
      }
    } catch (err) {
      console.warn('Supabase query error in getAssetDetailsByQr, falling back to mock:', err);
    }
  }

  // Fallback lookup from unified mockStore (with suffix, facility, and organization disambiguation)
  const mockItem = getMockAssetByQr(cleanQr, facilityId, orgId);
  if (mockItem) {
    return enrichLastCheckoutNote(mockItem, orgId);
  }

  // Fallback lookup from local in-memory registry:
  // 1. Exact match
  const normalized = cleanQr.toUpperCase();
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    const a = FALLBACK_CUSTODY_ASSETS[key];
    const matchesOrg = a.organizationId === orgId;
    if (matchesOrg && key.toUpperCase() === normalized) {
      return enrichLastCheckoutNote({ ...a }, orgId);
    }
  }

  // 2. Suffix match in fallback registry
  const fallbackMatches = Object.values(FALLBACK_CUSTODY_ASSETS).filter((a) => {
    const matchesOrg = a.organizationId === orgId;
    return matchesOrg && matchesCodeSuffix(a.qrCode, cleanQr);
  });
  if (fallbackMatches.length > 0) {
    const bestFallback = pickBestAssetMatch(fallbackMatches, cleanQr, facilityId);
    if (bestFallback) {
      return enrichLastCheckoutNote({ ...bestFallback }, orgId);
    }
  }

  return null;
}

/**
 * Retrieves full asset details by NFC UID, strictly scoped to active organization.
 */
export async function getAssetDetailsByNfc(
  nfcUid: string,
  facilityId?: string,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  const cleanUid = nfcUid.trim();
  if (!cleanUid) return null;

  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId || orgId === 'platform-master-superadmin') return null;

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('assets')
        .select(`
          id,
          qr_code,
          nfc_uid,
          status,
          condition,
          current_assigned_worker,
          current_warehouse_id,
          version,
          purchase_date,
          purchase_cost,
          warranty_until,
          safety_inspection_due,
          is_locked,
          lock_reason,
          reservation,
          tool_models:tool_model_id (
            id,
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        `)
        .eq('nfc_uid', cleanUid);

      query = query.eq('organization_id', orgId);

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return mapJoinedRowToScannedAsset(data as unknown as JoinedAssetData);
      }
    } catch (err) {
      console.warn('Supabase query error in getAssetDetailsByNfc:', err);
    }
  }

  return getAssetDetailsByQr(cleanUid, facilityId, orgId);
}

/**
 * Performs atomic bulk checkout of multiple assets to a field worker.
 * Strictly enforces administrative lockout and safety inspection validity.
 */
export async function bulkCheckoutAssetAction(
  input: BulkCheckoutInput
): Promise<BulkCustodyActionResult> {
  const parsed = BulkCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }

  const {
    assetIds,
    workerName,
    workerPhone,
    expectedReturnDate,
    accessories,
    signatureData,
    gps,
    notes,
  } = parsed.data;

  const orgId = await resolveActiveOrganizationId();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return {
      success: false,
      error: 'לא נמצא מזהה ארגון מורשה',
    };
  }

  // 1. Pre-validation: Enforce Administrative Lockout & Periodic Safety Inspection Due & Tenant Ownership
  for (const id of assetIds) {
    let targetAsset: ScannedAssetDetails | null = null;
    for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
      if (FALLBACK_CUSTODY_ASSETS[key].id === id) {
        targetAsset = FALLBACK_CUSTODY_ASSETS[key];
        break;
      }
    }
    if (targetAsset) {
      const isOwner = targetAsset.organizationId === orgId;
      if (!isOwner) {
        return {
          success: false,
          error: 'לא ניתן לנפק ציוד שאינו שייך לארגון הפעיל',
        };
      }
      const lockCheck = checkToolLockout(targetAsset);
      if (!lockCheck.allowed) {
        return {
          success: false,
          error: assetIds.length === 1 ? lockCheck.error! : `${targetAsset.toolName} (${targetAsset.qrCode}): ${lockCheck.error}`,
        };
      }
    }

    const anyMockAsset = getMockAssets().find((a) => a.id === id);
    if (anyMockAsset) {
      const isOwner = anyMockAsset.organizationId === orgId;
      if (!isOwner) {
        return {
          success: false,
          error: 'לא ניתן לנפק ציוד שאינו שייך לארגון הפעיל',
        };
      }
    }
  }

  const updatedAssets: ScannedAssetDetails[] = [];

  if (isSupabaseConfigured()) {
    try {
      // 1. Fetch current assets to verify existence, lockout, tenant isolation and facility
      const client = supabaseAdmin || supabase;
      const sessionUser = await getServerSessionUser();
      const performedBy = sessionUser?.fullName || sessionUser?.name || 'מחסנאי ראשי';

      const { data: currentAssets, error: fetchErr } = await client
        .from('assets')
        .select(`
          id,
          version,
          status,
          is_locked,
          lock_reason,
          safety_inspection_due,
          organization_id,
          current_warehouse_id,
          qr_code,
          name,
          brand,
          model_number,
          condition,
          warehouses:current_warehouse_id ( id, name, code ),
          tool_models:tool_model_id ( id, name, brand, model_number )
        `)
        .in('id', assetIds);

      if (fetchErr) {
        return { success: false, error: `Failed to retrieve assets: ${fetchErr.message}` };
      }

      if (!currentAssets || currentAssets.length !== assetIds.length) {
        return {
          success: false,
          error: `Some tools could not be located in database. Found ${currentAssets?.length || 0} of ${assetIds.length}.`,
        };
      }

      // Check tenant ownership & lockouts in DB
      for (const item of currentAssets) {
        const itemOrgId = item.organization_id as string;
        const isOwner = itemOrgId === orgId;
        if (!isOwner) {
          return {
            success: false,
            error: 'לא ניתן לנפק ציוד שאינו שייך לארגון הפעיל',
          };
        }

        if (item.is_locked) {
          return {
            success: false,
            error: `הכלי נעול מנהלית: ${item.lock_reason || 'נעול להוצאה מהמחסן'}`,
          };
        }
        if (item.safety_inspection_due) {
          const dueTime = new Date(item.safety_inspection_due).getTime();
          if (!isNaN(dueTime) && dueTime < Date.now()) {
            return {
              success: false,
              error: '⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית',
            };
          }
        }
      }

      // Check if any asset is not available
      const unavailable = currentAssets.filter((a) => a.status !== 'available');
      if (unavailable.length > 0) {
        return {
          success: false,
          error: `${unavailable.length} כלי/כלים אינם זמינים במלאי לניפוק.`,
        };
      }

      // 2. Update each asset and insert audit ledger entries
      for (const item of currentAssets) {
        const nextVersion = (item.version || 1) + 1;
        const itemAccessories = accessories[item.id] || {
          batteriesCount: 0,
          hasCharger: false,
          hasCase: false,
        };

        const updateQuery = client
          .from('assets')
          .update({
            status: 'checked_out',
            current_assigned_worker: workerName,
            expected_return_date: expectedReturnDate,
            accessories: itemAccessories,
            version: nextVersion,
            organization_id: orgId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        if (orgId) {
          updateQuery.eq('organization_id', orgId);
        }

        const { data: updatedRows, error: updateErr } = await updateQuery.select();

        if (updateErr) {
          console.error("DB Update Failed:", updateErr);
          throw new Error(`Failed to update asset ${item.id}: ${updateErr.message}`);
        }

        if (!updatedRows || updatedRows.length === 0) {
          console.error("Zero rows updated! Potential RLS or organization_id mismatch for asset:", item.id);
          throw new Error("העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו).");
        }

        // Resolve valid warehouse UUID for non-null constraint
        let targetWarehouseId = item.current_warehouse_id;
        if (!targetWarehouseId || !isValidUuid(targetWarehouseId)) {
          const { data: fallbackWh } = await client
            .from('warehouses')
            .select('id')
            .eq('organization_id', orgId)
            .limit(1)
            .maybeSingle();
          targetWarehouseId = fallbackWh?.id || null;
        }

        // Insert into custody_ledger
        const { error: ledgerErr } = await client.from('custody_ledger').insert({
          organization_id: orgId,
          asset_id: item.id,
          action: 'CHECKOUT',
          warehouse_id: targetWarehouseId,
          from_warehouse_id: targetWarehouseId || null,
          to_warehouse_id: targetWarehouseId || null,
          performed_by: performedBy,
          worker_name: workerName,
          target_worker: workerName,
          worker_phone: workerPhone || null,
          signature_svg: signatureData || null,
          signature_data: signatureData || null,
          is_tag_verified: true,
          signed_at: new Date().toISOString(),
          expected_return_date: expectedReturnDate,
          accessories_snapshot: itemAccessories,
          gps_lat: gps?.lat ?? null,
          gps_lng: gps?.lng ?? null,
          notes: notes || `ניפוק לעובד ${workerName}`,
          created_at: new Date().toISOString(),
        });

        if (ledgerErr) {
          console.error('LEDGER INSERT FAILED:', ledgerErr);
          throw new Error('שגיאה ברישום ביומן התנועות: ' + ledgerErr.message);
        }

        const itemObj = item as Record<string, unknown>;
        const whRaw = itemObj.warehouses;
        const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) as Record<string, unknown> || {};
        const tmRaw = itemObj.tool_models;
        const tmObj = (Array.isArray(tmRaw) ? tmRaw[0] : tmRaw) as Record<string, unknown> || {};
        const qr = (itemObj.qr_code as string) || `TOOL-${item.id.slice(0, 6).toUpperCase()}`;
        const itemWhId = (itemObj.current_warehouse_id as string) || 'wh-main-01';

        updatedAssets.push({
          id: item.id,
          qrCode: qr,
          qr_code: qr,
          status: 'checked_out',
          condition: (itemObj.condition as 'excellent' | 'good' | 'needs_repair' | 'retired') || 'good',
          currentAssignedWorker: workerName,
          current_assigned_worker: workerName,
          currentWarehouseId: itemWhId,
          current_warehouse_id: itemWhId,
          warehouseName: (whObj.name as string) || "מחסן ראשי",
          warehouseCode: (whObj.code as string) || 'CDB-01',
          toolName: (itemObj.name as string) || (tmObj.name as string) || 'כלי שנופק',
          brand: (itemObj.brand as string) || (tmObj.brand as string) || 'כלי',
          modelNumber: (itemObj.model_number as string) || (tmObj.model_number as string) || null,
          version: nextVersion,
          expectedReturnDate,
          accessories: itemAccessories,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database bulk checkout error';
      return { success: false, error: msg };
    }
  }

  // 3. Fallback in-memory dataset updates
  for (const id of assetIds) {
    let found = false;
    for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
      if (FALLBACK_CUSTODY_ASSETS[key].id === id) {
        FALLBACK_CUSTODY_ASSETS[key].status = 'checked_out';
        FALLBACK_CUSTODY_ASSETS[key].currentAssignedWorker = workerName;
        FALLBACK_CUSTODY_ASSETS[key].expectedReturnDate = expectedReturnDate;
        FALLBACK_CUSTODY_ASSETS[key].accessories = accessories[id] || {
          batteriesCount: 0,
          hasCharger: false,
          hasCase: false,
        };
        FALLBACK_CUSTODY_ASSETS[key].version += 1;
        mutateMockAsset(
          FALLBACK_CUSTODY_ASSETS[key].qrCode,
          {
            status: 'checked_out',
            currentAssignedWorker: workerName,
            workerPhone: workerPhone || null,
            expectedReturnDate,
            accessories: FALLBACK_CUSTODY_ASSETS[key].accessories,
          },
          {
            action: 'CHECKOUT',
            performedBy: 'מחסנאי',
            targetWorker: workerName,
            workerPhone: workerPhone || null,
            signatureData,
            notes: notes || 'ניפוק כלי עבודה לצוות שטח',
          }
        );
        updatedAssets.push({ ...FALLBACK_CUSTODY_ASSETS[key] });
        found = true;
        break;
      }
    }

    if (!found) {
      updatedAssets.push({
        id,
        qrCode: `TOOL-${id.slice(0, 6).toUpperCase()}`,
        status: 'checked_out',
        condition: 'good',
        currentAssignedWorker: workerName,
        currentWarehouseId: 'wh-main-01',
        warehouseName: "מחסן מרכזי - אגף א'",
        warehouseCode: 'CDB-01',
        toolName: 'כלי שנופק',
        brand: 'כלי',
        modelNumber: null,
        version: 2,
        expectedReturnDate,
        accessories: accessories[id] || {
          batteriesCount: 0,
          hasCharger: false,
          hasCase: false,
        },
      });
    }
  }

  for (const ast of updatedAssets) {
    appendAuditHistoryEntry({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId: ast.id,
      qrCode: ast.qrCode,
      toolName: ast.toolName,
      brand: ast.brand,
      modelNumber: ast.modelNumber,
      action: 'CHECKOUT',
      performedBy: workerName,
      targetWorker: workerName,
      workerPhone: workerPhone || null,
      condition: ast.condition,
      warehouseId: ast.currentWarehouseId,
      warehouseName: ast.warehouseName,
      warehouseCode: ast.warehouseCode,
      notes: notes || `ניפוק לעובד ${workerName}`,
      createdAt: new Date().toISOString(),
      expectedReturnDate,
      signatureData,
      accessoriesSnapshot: accessories[ast.id] || null,
      gps: gps || null,
    });
  }

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[bulkCheckoutAssetAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: `נופקו בהצלחה ${assetIds.length} כלים לעובד ${workerName}`,
    checkedOutCount: assetIds.length,
    assets: updatedAssets,
  };
}

/**
 * Checks out an asset to a designated field worker.
 */
export async function checkoutAssetAction(
  input: CheckoutInput
): Promise<CustodyActionResult> {
  const parsed = CheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }

  const {
    assetId,
    workerName,
    workerPhone,
    expectedReturnDate,
    accessories,
    signatureData,
    gps,
    notes,
  } = parsed.data;

  const defaultReturnDate =
    expectedReturnDate ||
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const dummySignature =
    signatureData ||
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const bulkResult = await bulkCheckoutAssetAction({
    assetIds: [assetId],
    workerName,
    workerPhone,
    expectedReturnDate: defaultReturnDate,
    accessories: accessories ? { [assetId]: accessories } : {},
    signatureData: dummySignature,
    gps,
    notes,
  });

  if (!bulkResult.success) {
    return { success: false, error: bulkResult.error };
  }

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[checkoutAssetAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: `הכלי נופק בהצלחה לעובד ${workerName}`,
    asset: bulkResult.assets[0],
  };
}

/**
 * Checks in an asset back to the warehouse inventory.
 * Supports damage incident reports and GPS coordinate logging.
 */
export async function checkinAssetAction(
  input: CheckinInput
): Promise<CustodyActionResult> {
  const parsed = CheckinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }

  const { assetId, condition, damageReport, gps, notes } = parsed.data;
  
  // If damage is reported, enforce maintenance status
  const isDamaged = damageReport?.isDamaged || condition === 'needs_repair' || condition === 'retired';
  const newStatus: ScannedAssetDetails['status'] = isDamaged ? 'maintenance' : 'available';

  const orgId = await resolveActiveOrganizationId();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }

  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: currentAsset, error: fetchErr } = await client
        .from('assets')
        .select('id, version, organization_id, qr_code, name, brand, model_number, condition, current_warehouse_id, warehouses(name, code)')
        .eq('id', assetId)
        .maybeSingle();

      if (fetchErr) {
        return { success: false, error: fetchErr.message };
      }
      if (!currentAsset) {
        return { success: false, error: 'Asset not found in database.' };
      }

      const itemOrg = currentAsset.organization_id as string;
      const isOwner = itemOrg === orgId;

      if (!isOwner) {
        return {
          success: false,
          error: 'לא ניתן לקלוט ציוד שאינו שייך לארגון הפעיל',
        };
      }

      const nextVersion = (currentAsset.version || 1) + 1;

      const updateQuery = client
        .from('assets')
        .update({
          status: newStatus,
          current_assigned_worker: null,
          condition,
          version: nextVersion,
          organization_id: orgId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId);

      if (orgId) {
        updateQuery.eq('organization_id', orgId);
      }

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: `Failed to check in asset: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated! Potential RLS or organization_id mismatch for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const sessionUser = await getServerSessionUser();
      const performedBy = sessionUser?.fullName || sessionUser?.name || 'מחסנאי שטח';

      // Resolve valid warehouse UUID for non-null constraint
      let targetWarehouseId = currentAsset.current_warehouse_id;
      if (!targetWarehouseId || !isValidUuid(targetWarehouseId)) {
        const { data: fallbackWh } = await client
          .from('warehouses')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        targetWarehouseId = fallbackWh?.id || null;
      }

      // Record audit in custody_ledger
      const actionType = isDamaged ? 'MAINTENANCE' : 'CHECKIN';
      const { error: ledgerErr } = await client.from('custody_ledger').insert({
        asset_id: assetId,
        action: actionType,
        warehouse_id: targetWarehouseId,
        to_warehouse_id: targetWarehouseId,
        from_warehouse_id: targetWarehouseId,
        performed_by: performedBy,
        organization_id: orgId,
        condition_at_return: condition,
        notes: notes || (isDamaged ? `החזרת כלי (תקלה - מצב: ${condition})` : `החזרת כלי למחסן (מצב: ${condition})`),
        damage_report: damageReport || null,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        created_at: new Date().toISOString(),
      });

      if (ledgerErr) {
        console.error('LEDGER INSERT FAILED:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerErr.message };
      }

      const assetObj = currentAsset as Record<string, unknown>;
      const whRaw = assetObj.warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) as Record<string, unknown> || {};
      const qr = (assetObj.qr_code as string) || `TOOL-${currentAsset.id.slice(0, 6).toUpperCase()}`;
      const curWh = targetWarehouseId || (assetObj.current_warehouse_id as string) || 'wh-main-01';

      const returnedAsset: ScannedAssetDetails = {
        id: currentAsset.id,
        qrCode: qr,
        qr_code: qr,
        status: newStatus,
        condition: condition as ScannedAssetDetails['condition'],
        currentAssignedWorker: null,
        current_assigned_worker: null,
        currentWarehouseId: curWh,
        current_warehouse_id: curWh,
        warehouseName: (whObj.name as string) || "מחסן ראשי",
        warehouseCode: (whObj.code as string) || 'CDB-01',
        toolName: (assetObj.name as string) || 'כלי עבודה',
        brand: (assetObj.brand as string) || '',
        modelNumber: (assetObj.model_number as string) || null,
        version: nextVersion,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/history');
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/catalog');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('[checkinAssetAction] revalidatePath warning:', e);
      }

      return {
        success: true,
        message:
          newStatus === 'maintenance'
            ? 'הכלי הוחזר והועבר ישירות לסטטוס בבדיקה / תיקון.'
            : 'הכלי הוחזר למחסן וסומן כזמין במלאי.',
        asset: returnedAsset,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback in-memory asset if present
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].status = newStatus;
      FALLBACK_CUSTODY_ASSETS[key].currentAssignedWorker = null;
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      mutateMockAsset(
        FALLBACK_CUSTODY_ASSETS[key].qrCode,
        {
          status: newStatus,
          currentAssignedWorker: null,
          workerPhone: null,
          condition,
          expectedReturnDate: null,
        },
        {
          action: 'CHECKIN',
          performedBy: 'מחסנאי',
          notes: notes || `החזרת כלי (מצב: ${condition})`,
          damageReport: damageReport || null,
        }
      );
      const updatedAsset = { ...FALLBACK_CUSTODY_ASSETS[key] };
      appendAuditHistoryEntry({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assetId: updatedAsset.id,
        qrCode: updatedAsset.qrCode,
        toolName: updatedAsset.toolName,
        brand: updatedAsset.brand,
        modelNumber: updatedAsset.modelNumber,
        action: 'CHECKIN',
        performedBy: 'מחסנאי',
        targetWorker: null,
        workerPhone: null,
        condition,
        warehouseId: updatedAsset.currentWarehouseId,
        warehouseName: updatedAsset.warehouseName,
        warehouseCode: updatedAsset.warehouseCode,
        notes: notes || `החזרת כלי (מצב: ${condition})`,
        createdAt: new Date().toISOString(),
        damageReport: damageReport || null,
        gps: gps || null,
      });

      try {
        await clearDashboardCaches();
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('[checkinAssetAction] revalidatePath warning:', e);
      }

      return {
        success: true,
        message:
          newStatus === 'maintenance'
            ? 'הכלי הוחזר והועבר ישירות לסטטוס בבדיקה / תיקון.'
            : 'הכלי הוחזר למחסן וסומן כזמין במלאי.',
        asset: updatedAsset,
      };
    }
  }

  const fallbackReturned = {
    id: assetId,
    qrCode: 'TOOL-CHECKIN',
    status: newStatus,
    condition,
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: "מחסן מרכזי - אגף א'",
    warehouseCode: 'CDB-01',
    toolName: 'כלי שהוחזר',
    brand: 'כלי',
    modelNumber: null,
    version: 2,
  };

  appendAuditHistoryEntry({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    assetId: fallbackReturned.id,
    qrCode: fallbackReturned.qrCode,
    toolName: fallbackReturned.toolName,
    brand: fallbackReturned.brand,
    modelNumber: fallbackReturned.modelNumber,
    action: 'CHECKIN',
    performedBy: 'מחסנאי',
    targetWorker: null,
    workerPhone: null,
    condition,
    warehouseId: fallbackReturned.currentWarehouseId,
    warehouseName: fallbackReturned.warehouseName,
    warehouseCode: fallbackReturned.warehouseCode,
    notes: notes || `החזרת כלי (מצב: ${condition})`,
    createdAt: new Date().toISOString(),
    damageReport: damageReport || null,
    gps: gps || null,
  });

  try {
    await clearDashboardCaches();
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[checkinAssetAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי הוחזר למחסן בהצלחה.',
    asset: fallbackReturned,
  };
}

export interface ActiveCheckedOutAssetItem {
  id: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  serialNumber?: string | null;
  categoryName?: string;
  workerName: string;
  workerPhone?: string | null;
  warehouseId: string;
  warehouseName: string;
  expectedReturnDate?: string | null;
  checkedOutAt?: string | null;
  isOverdue: boolean;
  daysOverdue?: number;
  timeSinceCheckoutText?: string;
  condition?: string;
  lastCheckoutNote?: string | null;
  last_checkout_note?: string | null;
}

function formatTimeSinceCheckout(dateStr?: string | null): string {
  if (!dateStr) return 'היום';
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return 'היום';
  const diffMs = Date.now() - time;
  if (diffMs < 0) return 'כרגע';
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return `לפני ${Math.max(1, diffMins)} דקות`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'אתמול';
  if (diffDays === 2) return 'שלשום';
  if (diffDays < 30) return `לפני ${diffDays} ימים`;
  const diffMonths = Math.floor(diffDays / 30);
  return `לפני ${diffMonths} חודשים`;
}

function calculateOverdueDetails(expectedReturnDate?: string | null): {
  isOverdue: boolean;
  daysOverdue: number;
} {
  if (!expectedReturnDate) return { isOverdue: false, daysOverdue: 0 };
  const expTime = new Date(expectedReturnDate).getTime();
  if (isNaN(expTime)) return { isOverdue: false, daysOverdue: 0 };
  const diffMs = Date.now() - expTime;
  if (diffMs > 0) {
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { isOverdue: true, daysOverdue: Math.max(1, days) };
  }
  return { isOverdue: false, daysOverdue: 0 };
}

/**
 * Check-in of an asset from an assigned worker back to the warehouse.
 * Used by storekeepers in manual and barcode check-in workflows.
 */
export async function checkinFromWorkerAction(
  input: CheckinInput
): Promise<CustodyActionResult> {
  return checkinAssetAction(input);
}

/**
 * Check-out of an asset to an assigned worker from the warehouse.
 * Used by storekeepers in manual and barcode checkout workflows.
 */
export async function checkoutToWorkerAction(
  input: CheckoutInput
): Promise<CustodyActionResult> {
  return checkoutAssetAction(input);
}

/**
 * Retrieves all tools currently checked out in the organization for manual return/check-in.
 * Enforces strict multi-tenant isolation by organization_id.
 */
export async function getCheckedOutAssetsForReturnAction(
  warehouseId?: string,
  organizationId?: string
): Promise<ActiveCheckedOutAssetItem[]> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('assets')
        .select(`
          id,
          qr_code,
          name,
          brand,
          model_number,
          serial_number,
          category_name,
          status,
          condition,
          current_assigned_worker,
          expected_return_date,
          current_warehouse_id,
          organization_id,
          updated_at,
          created_at,
          tool_models:tool_model_id (
            id,
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        `)
        .eq('status', 'checked_out');

      query = query.eq('organization_id', orgId);

      if (warehouseId && warehouseId !== 'all') {
        query = query.eq('current_warehouse_id', warehouseId);
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const assetIds = (data as Array<{ id: string }>).map((d) => d.id);

        // Fetch latest CHECKOUT ledger entries to get worker phone, checkout time, and checkout note
        const { data: ledgerEntries } = await supabase
          .from('custody_ledger')
          .select('asset_id, worker_phone, target_worker, created_at, notes')
          .in('asset_id', assetIds)
          .eq('action', 'CHECKOUT')
          .order('created_at', { ascending: false });

        const phoneMap = new Map<string, string>();
        const checkoutTimeMap = new Map<string, string>();
        const noteMap = new Map<string, string>();
        if (ledgerEntries) {
          for (const entry of ledgerEntries) {
            if (entry.asset_id && !phoneMap.has(entry.asset_id) && entry.worker_phone) {
              phoneMap.set(entry.asset_id, entry.worker_phone);
            }
            if (entry.asset_id && !checkoutTimeMap.has(entry.asset_id) && entry.created_at) {
              checkoutTimeMap.set(entry.asset_id, entry.created_at);
            }
            if (entry.asset_id && !noteMap.has(entry.asset_id) && entry.notes) {
              noteMap.set(entry.asset_id, entry.notes);
            }
          }
        }

        interface CheckedOutSupabaseRow {
          id: string;
          name?: string;
          brand?: string;
          model_number?: string | null;
          serial_number?: string | null;
          category_name?: string | null;
          qr_code: string;
          condition: ScannedAssetDetails['condition'];
          current_assigned_worker?: string | null;
          expected_return_date?: string | null;
          current_warehouse_id?: string | null;
          updated_at?: string;
          created_at?: string;
          tool_models?: {
            name?: string;
            brand?: string;
            model_number?: string | null;
          } | null;
          warehouses?: {
            name?: string;
          } | null;
        }

        return (data as unknown as CheckedOutSupabaseRow[]).map((row) => {
          const toolName = row.tool_models?.name || row.name || 'כלי עבודה';
          const brand = row.tool_models?.brand || row.brand || '';
          const modelNumber = row.tool_models?.model_number || row.model_number || null;
          const warehouseName = row.warehouses?.name || 'מחסן שטח';
          const workerName = row.current_assigned_worker || 'עובד שטח';
          const workerPhone = phoneMap.get(row.id) || null;
          const checkedOutAt = checkoutTimeMap.get(row.id) || row.updated_at || row.created_at;
          const { isOverdue, daysOverdue } = calculateOverdueDetails(row.expected_return_date);
          const lastCheckoutNote = noteMap.get(row.id) || null;

          return {
            id: row.id,
            qrCode: row.qr_code,
            toolName,
            brand,
            modelNumber,
            serialNumber: row.serial_number || null,
            categoryName: row.category_name || undefined,
            workerName,
            workerPhone,
            warehouseId: row.current_warehouse_id || '',
            warehouseName,
            expectedReturnDate: row.expected_return_date || null,
            checkedOutAt,
            isOverdue,
            daysOverdue,
            timeSinceCheckoutText: formatTimeSinceCheckout(checkedOutAt),
            condition: row.condition,
            lastCheckoutNote,
            last_checkout_note: lastCheckoutNote,
          };
        });
      }
    } catch (err) {
      console.warn('Error in getCheckedOutAssetsForReturnAction Supabase query:', err);
    }
  }

  // Fallback to unified mock store
  const mockAssets = getMockAssets(orgId);
  const { getMockAuditHistory } = await import('@/lib/mockStore');
  const mockHistory = getMockAuditHistory(undefined, orgId).records;

  return mockAssets
    .filter((a) => {
      const statusMatch = a.status === 'checked_out';
      const whMatch =
        !warehouseId ||
        warehouseId === 'all' ||
        a.warehouseId === warehouseId ||
        a.currentWarehouseId === warehouseId;
      return statusMatch && whMatch;
    })
    .map((a) => {
      const aRec = a as unknown as Record<string, unknown>;
      const { isOverdue, daysOverdue } = calculateOverdueDetails(a.expectedReturnDate);
      const checkedOutAt = (aRec.updatedAt as string) || (aRec.updated_at as string) || null;
      const latestCheckout = mockHistory.find(
        (r) => (r.assetId === a.id || r.qrCode === a.qrCode) && r.action === 'CHECKOUT'
      );
      const lastCheckoutNote = latestCheckout?.notes || (aRec.lastCheckoutNote as string) || null;
      return {
        id: a.id,
        qrCode: a.qrCode,
        toolName: a.toolName,
        brand: a.brand,
        modelNumber: a.modelNumber,
        serialNumber: (aRec.serialNumber as string) || (aRec.serial_number as string) || null,
        categoryName: a.categoryName,
        workerName: a.currentAssignedWorker || 'עובד שטח',
        workerPhone: (aRec.workerPhone as string) || null,
        warehouseId: a.warehouseId || a.currentWarehouseId || '',
        warehouseName: a.warehouseName || 'מחסן שטח',
        expectedReturnDate: a.expectedReturnDate || null,
        checkedOutAt,
        isOverdue,
        daysOverdue,
        timeSinceCheckoutText: formatTimeSinceCheckout(checkedOutAt),
        condition: a.condition,
        lastCheckoutNote,
        last_checkout_note: lastCheckoutNote,
      };
    });
}

function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

async function resolveVerifiedWarehouse(
  warehouseIdOrCode: string | undefined | null,
  orgId: string
): Promise<{ id: string; name: string } | null> {
  if (!warehouseIdOrCode) return null;
  const clean = warehouseIdOrCode.trim();

  // 1. If valid UUID, look up by id
  if (isValidUuid(clean)) {
    const { data: byId } = await supabaseAdmin
      .from('warehouses')
      .select('id, name')
      .eq('id', clean)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (byId) return { id: byId.id, name: byId.name };
  }

  // 2. Look up by code or name
  const { data: byCodeOrName } = await supabaseAdmin
    .from('warehouses')
    .select('id, name')
    .eq('organization_id', orgId)
    .or(`code.eq.${clean},name.eq.${clean}`)
    .maybeSingle();
  if (byCodeOrName) return { id: byCodeOrName.id, name: byCodeOrName.name };

  return null;
}

/**
 * Transfers an asset to a different warehouse/site container.
 */
export async function transferAssetAction(
  input: TransferInput
): Promise<CustodyActionResult> {
  const parsed = TransferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    };
  }

  const { assetId, targetWarehouseId, gps, notes } = parsed.data;
  const orgId = await resolveActiveOrganizationId();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }

  const sessionUser = await getServerSessionUser();
  const performedBy = sessionUser?.fullName || (sessionUser as unknown as { name?: string })?.name || 'מחסנאי שטח';
  const isDirect = Boolean(
    parsed.data.isDirectTransfer ||
    sessionUser?.role === 'chief_operations' ||
    sessionUser?.role === 'general_manager' ||
    sessionUser?.role === 'admin'
  );

  if (isSupabaseConfigured()) {
    try {
      // 1. Resolve destination warehouse strictly as verified UUID
      const targetWh = await resolveVerifiedWarehouse(targetWarehouseId, orgId);
      if (!targetWh) {
        return {
          success: false,
          error: 'לא ניתן להעביר ציוד למתקן שאינו שייך לארגון זה או שמזהה המחסן אינו תקין',
        };
      }

      // 2. Fetch current asset
      const { data: currentAsset, error: fetchErr } = await supabaseAdmin
        .from('assets')
        .select('id, version, organization_id, qr_code, nfc_uid, condition, current_assigned_worker, current_warehouse_id, status, tool_models(name, brand, model_number)')
        .eq('id', assetId)
        .maybeSingle();

      if (fetchErr) {
        return { success: false, error: fetchErr.message };
      }
      if (!currentAsset) {
        return { success: false, error: 'כלי העבודה לא נמצא במסד הנתונים' };
      }

      const assetOrg = currentAsset.organization_id as string;
      if (assetOrg !== orgId) {
        return {
          success: false,
          error: 'לא ניתן להעביר ציוד למתקן שאינו שייך לארגון זה',
        };
      }

      // 3. Resolve source warehouse
      let sourceWh = await resolveVerifiedWarehouse(currentAsset.current_warehouse_id, orgId);
      if (!sourceWh) {
        const { data: firstOrgWh } = await supabaseAdmin
          .from('warehouses')
          .select('id, name')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstOrgWh) {
          sourceWh = { id: firstOrgWh.id, name: firstOrgWh.name };
        }
      }

      const sourceWarehouseUuid = sourceWh?.id || null;
      const sourceSiteName = sourceWh?.name || 'מחסן מקור';
      const targetWarehouseUuid = targetWh.id;
      const targetSiteName = targetWh.name;

      const nextVersion = (currentAsset.version || 1) + 1;
      const newStatus = isDirect ? 'in_stock' : 'in_transit';
      const now = new Date().toISOString();

      // Step A: Update the assets table
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          current_warehouse_id: targetWarehouseUuid,
          status: newStatus,
          current_assigned_worker: null,
          version: nextVersion,
          organization_id: orgId,
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        console.error("Transfer DB Error:", updateErr);
        return { success: false, error: `Failed to transfer asset: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      // Step B: Atomically INSERT an audit movement record into custody_ledger
      const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
        organization_id: orgId,
        asset_id: assetId,
        action: 'TRANSFER',
        warehouse_id: targetWarehouseUuid,
        target_warehouse_id: targetWarehouseUuid,
        from_warehouse_id: sourceWarehouseUuid,
        to_warehouse_id: targetWarehouseUuid,
        target_site_name: targetSiteName,
        performed_by: performedBy,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        notes: notes || `שינוע מ-${sourceSiteName} אל ${targetSiteName}`,
        created_at: now,
      });

      if (ledgerError) {
        console.error('CRITICAL: Failed to write transfer to custody_ledger:', ledgerError);
        return { success: false, error: 'שגיאה ברישום תנועת השינוע ביומן: ' + ledgerError.message };
      }

      const tm = (currentAsset as unknown as { tool_models?: { name?: string; brand?: string; model_number?: string | null } }).tool_models;
      const dbUpdatedAsset: ScannedAssetDetails = {
        id: currentAsset.id,
        qrCode: currentAsset.qr_code,
        nfcUid: currentAsset.nfc_uid || undefined,
        status: newStatus as ScannedAssetDetails['status'],
        condition: (currentAsset.condition as 'excellent' | 'good' | 'needs_repair' | 'retired') || 'good',
        currentAssignedWorker: null,
        currentWarehouseId: targetWarehouseUuid,
        warehouseName: targetSiteName,
        warehouseCode: targetWh.name,
        toolName: (currentAsset as unknown as { name?: string }).name || tm?.name || 'כלי עבודה',
        brand: (currentAsset as unknown as { brand?: string }).brand || tm?.brand || 'כלי',
        modelNumber: (currentAsset as unknown as { model_number?: string }).model_number || tm?.model_number || null,
        version: nextVersion,
      };

      mutateMockAsset(
        currentAsset.qr_code,
        {
          warehouseId: targetWarehouseUuid,
          warehouseName: targetSiteName,
          status: newStatus as ScannedAssetDetails['status'],
        },
        {
          action: 'TRANSFER',
          performedBy,
          notes: notes || (isDirect ? `העברה ישירה למחסן: ${targetSiteName}` : `שינוע למחסן ${targetSiteName}`),
        }
      );

      try {
        await clearDashboardCaches();
        revalidatePath('/history');
        revalidatePath('/catalog');
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
        revalidatePath('/dashboard/chief');
      } catch (e) {
        console.warn('[transferAssetAction] revalidatePath warning:', e);
      }

      return {
        success: true,
        message: isDirect
          ? `הכלי הועבר ישירות אל ${targetSiteName}`
          : `מיקום הכלי עודכן לשינוע אל ${targetSiteName}`,
        asset: dbUpdatedAsset,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // 1. Verify destination warehouse belongs to active organization (offline mock fallback only)
  const mockWh = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId || w.code === targetWarehouseId);
  if (!mockWh) {
    return {
      success: false,
      error: 'לא ניתן להעביר ציוד למתקן שאינו שייך לארגון זה',
    };
  }

  // 2. Verify asset belongs to active organization (offline mock fallback only)
  let isAssetValid = false;
  const mockAsset = getMockAssets().find((a) => a.id === assetId && a.organizationId === orgId);
  if (mockAsset) {
    isAssetValid = true;
  }
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    const fAsset = FALLBACK_CUSTODY_ASSETS[key];
    if (fAsset.id === assetId && fAsset.organizationId === orgId) {
      isAssetValid = true;
      break;
    }
  }

  const targetWhMeta = getWarehouseMeta(targetWarehouseId);
  if (!isAssetValid) {
    return {
      success: false,
      error: 'לא ניתן להעביר ציוד למתקן שאינו שייך לארגון זה',
    };
  }

  // Update fallback in-memory asset if present
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].currentWarehouseId = targetWarehouseId;
      FALLBACK_CUSTODY_ASSETS[key].warehouseName = targetWhMeta.name;
      FALLBACK_CUSTODY_ASSETS[key].warehouseCode = targetWhMeta.code;
      FALLBACK_CUSTODY_ASSETS[key].status = isDirect ? 'available' : 'in_transit';
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      mutateMockAsset(
        FALLBACK_CUSTODY_ASSETS[key].qrCode,
        {
          warehouseId: targetWarehouseId,
          warehouseName: targetWhMeta.name,
          warehouseCode: targetWhMeta.code,
          status: isDirect ? 'available' : 'in_transit',
        },
        {
          action: isDirect ? 'DIRECT_TRANSFER' : 'TRANSFER_INIT',
          performedBy,
          notes: notes || (isDirect ? `העברה ישירה למחסן: ${targetWhMeta.name}` : `העברת כלי למחסן: ${targetWhMeta.name}`),
        }
      );
      try {
        await clearDashboardCaches();
        revalidatePath('/catalog');
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
        revalidatePath('/dashboard/chief');
      } catch (e) {
        console.warn('[transferAssetAction] revalidatePath warning:', e);
      }

      return {
        success: true,
        message: isDirect
          ? `הכלי הועבר ישירות אל ${targetWhMeta.name}`
          : `מיקום הכלי עודכן לשינוע אל ${targetWhMeta.name}`,
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  mutateMockAsset(
    assetId,
    {
      warehouseId: targetWarehouseId,
      warehouseName: targetWhMeta.name,
      warehouseCode: targetWhMeta.code,
      status: isDirect ? 'available' : 'in_transit',
    },
    {
      action: isDirect ? 'DIRECT_TRANSFER' : 'TRANSFER_INIT',
      performedBy,
      notes: notes || (isDirect ? `העברה ישירה למחסן: ${targetWhMeta.name}` : `העברת כלי למחסן: ${targetWhMeta.name}`),
    }
  );

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/chief');
  } catch (e) {
    console.warn('[transferAssetAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: isDirect
      ? `הכלי הועבר ישירות אל ${targetWhMeta.name}`
      : `מיקום הכלי עודכן לשינוע אל ${targetWhMeta.name}`,
    asset: {
      id: assetId,
      qrCode: mockAsset?.qrCode || 'TOOL-CURRENT',
      status: isDirect ? 'available' : 'in_transit',
      condition: 'good',
      currentAssignedWorker: null,
      currentWarehouseId: targetWarehouseId,
      warehouseName: targetWhMeta.name,
      warehouseCode: targetWhMeta.code,
      toolName: mockAsset?.toolName || 'כלי עבודה',
      brand: mockAsset?.brand || 'כלי',
      modelNumber: mockAsset?.modelNumber || null,
      version: (mockAsset?.version || 1) + 1,
    },
  };
}

/**
 * Toggles administrative lock / quarantine on an asset.
 */
export async function toggleAssetLockAction(
  assetId: string,
  isLocked: boolean,
  lockReason?: string
): Promise<CustodyActionResult> {
  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: updatedRows, error: updateErr } = await client
        .from('assets')
        .update({
          is_locked: isLocked,
          lock_reason: isLocked ? lockReason || 'נעול מנהלית' : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId)
        .select('id, name, brand, model_number, qr_code, status, is_locked, lock_reason, condition, current_warehouse_id, current_assigned_worker, version, warehouses(name, code)');

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: updateErr.message };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      await client.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'LOCK_STATUS',
        performed_by: 'מנהל מערכת',
        notes: isLocked ? `נעילת כלי: ${lockReason || 'ללא סיבה'}` : 'שחרור נעילת כלי',
      });

      const row = updatedRows[0];
      const whRaw = (row as Record<string, unknown>).warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) || {};
      const returnAsset: ScannedAssetDetails = {
        id: row.id,
        qrCode: row.qr_code || '',
        status: row.status,
        condition: row.condition || 'good',
        currentAssignedWorker: row.current_assigned_worker || null,
        currentWarehouseId: row.current_warehouse_id,
        warehouseName: whObj.name || 'מחסן ראשי',
        warehouseCode: whObj.code || 'WH',
        toolName: row.name || 'כלי עבודה',
        brand: row.brand || '',
        modelNumber: row.model_number || null,
        version: row.version || 1,
        isLocked: row.is_locked,
        lockReason: row.lock_reason,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('revalidatePath warning:', e);
      }

      return {
        success: true,
        message: isLocked
          ? 'הכלי ננעל בהצלחה להוצאה מהמחסן.'
          : 'נעילת הכלי שוחררה בהצלחה - הכלי זמין להוצאה.',
        asset: returnAsset,
      };
    } catch (err) {
      console.warn('Database error in toggleAssetLockAction:', err);
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback asset
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].isLocked = isLocked;
      FALLBACK_CUSTODY_ASSETS[key].lockReason = isLocked ? lockReason || 'נעול מנהלית' : undefined;
      const target = FALLBACK_CUSTODY_ASSETS[key];
      appendAuditHistoryEntry({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assetId: target.id,
        qrCode: target.qrCode,
        toolName: target.toolName,
        brand: target.brand,
        modelNumber: target.modelNumber,
        action: 'LOCK_STATUS',
        performedBy: 'מנהל מערכת',
        targetWorker: null,
        workerPhone: null,
        condition: target.condition,
        warehouseId: target.currentWarehouseId,
        warehouseName: target.warehouseName,
        warehouseCode: target.warehouseCode,
        notes: isLocked ? `נעילת כלי מנהלית: ${lockReason || 'ללא סיבה'}` : 'שחרור נעילת כלי',
        createdAt: new Date().toISOString(),
      });
      return {
        success: true,
        message: isLocked
          ? 'הכלי ננעל בהצלחה להוצאה מהמחסן.'
          : 'נעילת הכלי שוחררה בהצלחה - הכלי זמין להוצאה.',
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return { success: false, error: 'הכלי לא נמצא במערכת.' };
}

/**
 * Renews the periodic safety inspection due date of an asset.
 */
export async function renewSafetyInspectionAction(
  assetId: string,
  nextDueDate: string,
  inspectedBy?: string
): Promise<CustodyActionResult> {
  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: updatedRows, error: updateErr } = await client
        .from('assets')
        .update({
          safety_inspection_due: nextDueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId)
        .select('id, name, brand, model_number, qr_code, status, is_locked, lock_reason, condition, current_warehouse_id, current_assigned_worker, version, safety_inspection_due, warehouses(name, code)');

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: updateErr.message };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      await client.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'SAFETY_INSPECTION',
        performed_by: inspectedBy || 'בודק בטיחות מוסמך',
        notes: `חידוש בדיקת בטיחות תקופתית עד ${nextDueDate}`,
      });

      const row = updatedRows[0];
      const whRaw = (row as Record<string, unknown>).warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) || {};
      const returnAsset: ScannedAssetDetails = {
        id: row.id,
        qrCode: row.qr_code || '',
        status: row.status,
        condition: row.condition || 'good',
        currentAssignedWorker: row.current_assigned_worker || null,
        currentWarehouseId: row.current_warehouse_id,
        warehouseName: whObj.name || 'מחסן ראשי',
        warehouseCode: whObj.code || 'WH',
        toolName: row.name || 'כלי עבודה',
        brand: row.brand || '',
        modelNumber: row.model_number || null,
        version: row.version || 1,
        isLocked: row.is_locked,
        lockReason: row.lock_reason,
        safetyInspectionDue: row.safety_inspection_due,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('revalidatePath warning:', e);
      }

      return {
        success: true,
        message: `תוקף בדיקת הבטיחות חודש בהצלחה עד ${new Date(nextDueDate).toLocaleDateString('he-IL')}.`,
        asset: returnAsset,
      };
    } catch (err) {
      console.warn('Database error in renewSafetyInspectionAction:', err);
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback asset
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].safetyInspectionDue = nextDueDate;
      const target = FALLBACK_CUSTODY_ASSETS[key];
      appendAuditHistoryEntry({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assetId: target.id,
        qrCode: target.qrCode,
        toolName: target.toolName,
        brand: target.brand,
        modelNumber: target.modelNumber,
        action: 'SAFETY_INSPECTION',
        performedBy: inspectedBy || 'בודק בטיחות מוסמך',
        targetWorker: null,
        workerPhone: null,
        condition: target.condition,
        warehouseId: target.currentWarehouseId,
        warehouseName: target.warehouseName,
        warehouseCode: target.warehouseCode,
        notes: `חידוש בדיקת בטיחות תקופתית עד ${new Date(nextDueDate).toLocaleDateString('he-IL')}`,
        createdAt: new Date().toISOString(),
      });
      return {
        success: true,
        message: `תוקף בדיקת הבטיחות חודש בהצלחה עד ${new Date(nextDueDate).toLocaleDateString('he-IL')}.`,
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return { success: false, error: 'הכלי לא נמצא במערכת.' };
}

/**
 * Assigns or cancels a project advance reservation on an asset.
 */
export async function reserveAssetAction(
  assetId: string,
  reservation: AssetReservation | null
): Promise<CustodyActionResult> {
  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: updatedRows, error: updateErr } = await client
        .from('assets')
        .update({
          reservation,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId)
        .select('id, name, brand, model_number, qr_code, status, is_locked, lock_reason, condition, current_warehouse_id, current_assigned_worker, version, reservation, warehouses(name, code)');

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: updateErr.message };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      await client.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CHECKIN',
        performed_by: reservation?.reservedBy || 'מנהל פרויקט',
        notes: reservation
          ? `שריון כלי לפרויקט ${reservation.projectName} לתאריך ${reservation.reservedForDate}`
          : 'ביטול שריון כלי',
      });

      const row = updatedRows[0];
      const whRaw = (row as Record<string, unknown>).warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) || {};
      const returnAsset: ScannedAssetDetails = {
        id: row.id,
        qrCode: row.qr_code || '',
        status: row.status,
        condition: row.condition || 'good',
        currentAssignedWorker: row.current_assigned_worker || null,
        currentWarehouseId: row.current_warehouse_id,
        warehouseName: whObj.name || 'מחסן ראשי',
        warehouseCode: whObj.code || 'WH',
        toolName: row.name || 'כלי עבודה',
        brand: row.brand || '',
        modelNumber: row.model_number || null,
        version: row.version || 1,
        isLocked: row.is_locked,
        lockReason: row.lock_reason,
        reservation: row.reservation,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('revalidatePath warning:', e);
      }

      return {
        success: true,
        message: reservation
          ? `הכלי שוריין בהצלחה לפרויקט "${reservation.projectName}".`
          : 'שריון הכלי בוטל בהצלחה.',
        asset: returnAsset,
      };
    } catch (err) {
      console.warn('Database error in reserveAssetAction:', err);
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback asset
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].reservation = reservation;
      return {
        success: true,
        message: reservation
          ? `הכלי שוריין בהצלחה לפרויקט "${reservation.projectName}".`
          : 'שריון הכלי בוטל בהצלחה.',
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return { success: false, error: 'הכלי לא נמצא במערכת.' };
}

export interface ReportDamageInput {
  assetId: string;
  reportedBy: string;
  issueType: string;
  notes?: string;
}

export async function reportAssetDamageAction(
  input: ReportDamageInput
): Promise<CustodyActionResult> {
  const { assetId, reportedBy, issueType, notes } = input;
  const orgId = await resolveActiveOrganizationId();

  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: updatedRows, error: updateErr } = await client
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'needs_repair',
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId)
        .select('id, name, brand, model_number, qr_code, status, condition, current_warehouse_id, current_assigned_worker, version, organization_id, warehouses(name, code)');

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: `שגיאה בעדכון תקלה: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const activeOrg = updatedRows[0]?.organization_id || orgId;
      let targetWarehouseId = updatedRows[0]?.current_warehouse_id;
      if (!targetWarehouseId || !isValidUuid(targetWarehouseId)) {
        const { data: fallbackWh } = await client
          .from('warehouses')
          .select('id')
          .eq('organization_id', activeOrg)
          .limit(1)
          .maybeSingle();
        targetWarehouseId = fallbackWh?.id || null;
      }

      const { error: ledgerErr } = await client.from('custody_ledger').insert({
        organization_id: activeOrg,
        asset_id: assetId,
        action: 'MAINTENANCE',
        warehouse_id: targetWarehouseId,
        from_warehouse_id: targetWarehouseId,
        to_warehouse_id: targetWarehouseId,
        performed_by: reportedBy || 'עובד שטח',
        notes: `דיווח תקלה (${issueType}): ${notes || 'ללא הערות'}`,
        condition_at_return: 'needs_repair',
        created_at: new Date().toISOString(),
      });

      if (ledgerErr) {
        console.error('LEDGER INSERT FAILED:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerErr.message };
      }

      const row = updatedRows[0];
      const whRaw = (row as Record<string, unknown>).warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) || {};
      const returnAsset: ScannedAssetDetails = {
        id: row.id,
        qrCode: row.qr_code || '',
        status: row.status,
        condition: row.condition || 'needs_repair',
        currentAssignedWorker: row.current_assigned_worker || null,
        currentWarehouseId: row.current_warehouse_id,
        warehouseName: whObj.name || 'מחסן ראשי',
        warehouseCode: whObj.code || 'WH',
        toolName: row.name || 'כלי בבדיקה',
        brand: row.brand || '',
        modelNumber: row.model_number || null,
        version: row.version || 1,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/history');
        revalidatePath('/catalog');
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('revalidatePath warning:', e);
      }

      return {
        success: true,
        message: 'דיווח על תקלה נקלט בהצלחה. הכלי הועבר לסטטוס בבדיקה/תיקון.',
        asset: returnAsset,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback in-memory asset
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].status = 'maintenance';
      FALLBACK_CUSTODY_ASSETS[key].condition = 'needs_repair';
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      return {
        success: true,
        message: 'דיווח על תקלה נקלט בהצלחה. הכלי הועבר לסטטוס בבדיקה/תיקון.',
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: 'דיווח על תקלה נקלט בהצלחה.',
    asset: {
      id: assetId,
      qrCode: 'TOOL-REPORTED',
      status: 'maintenance',
      condition: 'needs_repair',
      currentAssignedWorker: null,
      currentWarehouseId: 'wh-main-01',
      warehouseName: 'מחסן מרכזי - תל אביב',
      warehouseCode: 'TLV-01',
      toolName: 'כלי בבדיקה',
      brand: 'כלי',
      modelNumber: null,
      version: 2,
    },
  };
}

export interface RetireAssetInput {
  assetId: string;
  retiredBy: string;
  reason: string;
}

export async function retireAssetAction(
  input: RetireAssetInput
): Promise<CustodyActionResult> {
  const { assetId, retiredBy, reason } = input;
  const orgId = await resolveActiveOrganizationId();

  if (isSupabaseConfigured()) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: updatedRows, error: updateErr } = await client
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'retired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId)
        .select('id, name, brand, model_number, qr_code, status, condition, current_warehouse_id, current_assigned_worker, version, organization_id, warehouses(name, code)');

      if (updateErr) {
        console.error("DB Update Failed:", updateErr);
        return { success: false, error: `שגיאה בהשבתת כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const activeOrg = updatedRows[0]?.organization_id || orgId;
      let targetWarehouseId = updatedRows[0]?.current_warehouse_id;
      if (!targetWarehouseId || !isValidUuid(targetWarehouseId)) {
        const { data: fallbackWh } = await client
          .from('warehouses')
          .select('id')
          .eq('organization_id', activeOrg)
          .limit(1)
          .maybeSingle();
        targetWarehouseId = fallbackWh?.id || null;
      }

      const { error: ledgerErr } = await client.from('custody_ledger').insert({
        organization_id: activeOrg,
        asset_id: assetId,
        action: 'RETIRE',
        warehouse_id: targetWarehouseId,
        from_warehouse_id: targetWarehouseId,
        to_warehouse_id: targetWarehouseId,
        performed_by: retiredBy || 'מנהל מערכת',
        notes: `השבתת כלי וגריעה ממלאי: ${reason}`,
        condition_at_return: 'retired',
        created_at: new Date().toISOString(),
      });

      if (ledgerErr) {
        console.error('LEDGER INSERT FAILED:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerErr.message };
      }

      const row = updatedRows[0];
      const whRaw = (row as Record<string, unknown>).warehouses;
      const whObj = (Array.isArray(whRaw) ? whRaw[0] : whRaw) || {};
      const returnAsset: ScannedAssetDetails = {
        id: row.id,
        qrCode: row.qr_code || '',
        status: row.status,
        condition: row.condition || 'retired',
        currentAssignedWorker: row.current_assigned_worker || null,
        currentWarehouseId: row.current_warehouse_id,
        warehouseName: whObj.name || 'מחסן מרכזי - תל אביב',
        warehouseCode: whObj.code || 'TLV-01',
        toolName: row.name || 'כלי שהושבת',
        brand: row.brand || '',
        modelNumber: row.model_number || null,
        version: row.version || 2,
      };

      try {
        await clearDashboardCaches();
        revalidatePath('/history');
        revalidatePath('/catalog');
        revalidatePath('/dashboard/warehouse');
        revalidatePath('/dashboard/manager');
      } catch (e) {
        console.warn('revalidatePath warning:', e);
      }

      return {
        success: true,
        message: 'הכלי הושבת ונגרע מפעילות בהצלחה.',
        asset: returnAsset,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback in-memory asset
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].status = 'maintenance';
      FALLBACK_CUSTODY_ASSETS[key].condition = 'retired';
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      return {
        success: true,
        message: 'הכלי הושבת ונגרע מפעילות בהצלחה.',
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: 'הכלי הושבת בהצלחה.',
    asset: {
      id: assetId,
      qrCode: 'TOOL-RETIRED',
      status: 'maintenance',
      condition: 'retired',
      currentAssignedWorker: null,
      currentWarehouseId: 'wh-main-01',
      warehouseName: 'מחסן מרכזי - תל אביב',
      warehouseCode: 'TLV-01',
      toolName: 'כלי שהושבת',
      brand: 'כלי',
      modelNumber: null,
      version: 2,
    },
  };
}

/**
 * Dispatches an asset to a construction job site with physical tag verification and digital signature.
 * Enforces strict multi-tenant isolation, administrative lock checks, and audit trail generation.
 */
export async function dispatchAssetWithSignatureAction(data: {
  assetId: string;
  targetWarehouseId: string;
  workerName: string;
  workerPhone: string;
  signatureData: string;
  isTagVerified: boolean;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const { assetId, targetWarehouseId, workerName, workerPhone, signatureData, isTagVerified } = data;

  if (!assetId || !targetWarehouseId || !workerName?.trim()) {
    return { success: false, error: 'יש למלא את כל שדות החובה: כלי עבודה, אתר יעד ושם מקבל' };
  }

  if (!signatureData) {
    return { success: false, error: 'חובה לחתום בחתימה דיגיטלית על מנת לאשר הוצאת ציוד' };
  }

  if (!isTagVerified) {
    return { success: false, error: 'חובה לאשר פיזית את תקינות תג ה-QR על גבי הכלי לפני הוצאתו' };
  }

  const orgId = await resolveActiveOrganizationId();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const sessionUser = await getServerSessionUser();
  const performedBy = sessionUser?.fullName || 'מחסנאי מורשה';
  const now = new Date().toISOString();

  // 1. Verify asset belongs to active tenant and is not locked
  let assetName = 'כלי עבודה';
  let qrCode = '';
  let brand = 'כלי';
  let modelNumber: string | null = null;
  let condition: 'excellent' | 'good' | 'needs_repair' | 'retired' = 'good';
  let currentAssetWhId: string | null = null;

  if (isSupabaseConfigured()) {
    try {
      let assetQuery = supabaseAdmin
        .from('assets')
        .select(
          'id, name, brand, model_number, qr_code, current_warehouse_id, status, is_locked, lock_reason, safety_inspection_due, condition, organization_id, tool_models(name, brand, model_number)'
        )
        .eq('id', assetId);

      if (orgId) {
        assetQuery = assetQuery.eq('organization_id', orgId);
      }

      const { data: dbAsset, error: assetErr } = await assetQuery.maybeSingle();

      if (assetErr) {
        return { success: false, error: assetErr.message };
      }
      if (!dbAsset) {
        return { success: false, error: 'כלי העבודה אינו שייך לארגון הפעיל' };
      }
      currentAssetWhId = (dbAsset.current_warehouse_id as string) || null;
      if (dbAsset.is_locked) {
        return {
          success: false,
          error: `הכלי נעול מנהלית: ${dbAsset.lock_reason || 'נעול להוצאה מהמחסן'}`,
        };
      }
      if (dbAsset.safety_inspection_due) {
        const due = new Date(dbAsset.safety_inspection_due).getTime();
        if (!isNaN(due) && due < Date.now()) {
          return {
            success: false,
            error: '⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית',
          };
        }
      }
      const tmRaw = dbAsset.tool_models as unknown;
      const tm = (Array.isArray(tmRaw) ? tmRaw[0] : tmRaw) as Record<string, unknown> || {};
      assetName = (dbAsset.name as string) || (tm.name as string) || 'כלי עבודה';
      qrCode = (dbAsset.qr_code as string) || '';
      brand = (dbAsset.brand as string) || (tm.brand as string) || 'כלי';
      modelNumber = (dbAsset.model_number as string) || (tm.model_number as string) || null;
      condition = (dbAsset.condition as 'excellent' | 'good' | 'needs_repair' | 'retired') || 'good';
    } catch (err) {
      console.warn('[dispatchAssetWithSignatureAction] Asset check warning:', err);
    }
  } else {
    const mockAsset = getMockAssets().find(
      (a) => a.id === assetId && a.organizationId === orgId
    );
    if (!mockAsset) {
      return { success: false, error: 'כלי העבודה אינו קיים או אינו שייך לארגון' };
    }
    assetName = mockAsset.toolName;
    qrCode = mockAsset.qrCode;
    brand = mockAsset.brand;
    modelNumber = mockAsset.modelNumber;
    condition = mockAsset.condition;
  }

  // 2. Verify target warehouse belongs to active tenant
  let targetWarehouseName = 'אתר יעד';
  let targetWarehouseCode = 'FAC';
  if (isSupabaseConfigured()) {
    try {
      const { data: dbWh, error: whErr } = await supabaseAdmin
        .from('warehouses')
        .select('id, name, code, organization_id')
        .eq('id', targetWarehouseId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (whErr || !dbWh) {
        const mockWh = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId);
        if (!mockWh) {
          return { success: false, error: 'אתר היעד אינו שייך לארגון הפעיל' };
        }
        targetWarehouseName = mockWh.name;
        targetWarehouseCode = mockWh.code;
      } else {
        targetWarehouseName = dbWh.name;
        targetWarehouseCode = dbWh.code || 'FAC';
      }
    } catch {
      // Fallback
    }
  } else {
    const mockWh = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId);
    if (mockWh) {
      targetWarehouseName = mockWh.name;
      targetWarehouseCode = mockWh.code;
    }
  }

  // 3. Update asset in Supabase
  if (isSupabaseConfigured()) {
    try {
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          status: 'checked_out',
          current_warehouse_id: targetWarehouseId,
          current_assigned_worker: workerName.trim(),
          organization_id: orgId,
          updated_at: now,
        })
        .eq('id', assetId);

      if (orgId) {
        updateQuery.eq('organization_id', orgId);
      }

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון סטטוס כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset in dispatch:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      // 4. Insert custody_ledger entry
      const fullLedgerRecord: Record<string, unknown> = {
        asset_id: assetId,
        action: 'CHECKOUT',
        organization_id: orgId,
        warehouse_id: targetWarehouseId,
        to_warehouse_id: targetWarehouseId,
        from_warehouse_id: currentAssetWhId || targetWarehouseId,
        target_site_name: targetWarehouseName,
        performed_by: performedBy,
        target_worker: workerName.trim(),
        worker_name: workerName.trim(),
        worker_phone: workerPhone?.trim() || null,
        signature_svg: signatureData,
        signature_data: signatureData,
        is_tag_verified: isTagVerified,
        signed_at: now,
        created_at: now,
        notes: `ניפוק לאתר ${targetWarehouseName} עם אישור תיוג פיזי וחתימה דיגיטלית`,
      };

      const { error: ledgerErr } = await supabaseAdmin
        .from('custody_ledger')
        .insert(fullLedgerRecord);

      if (ledgerErr) {
        console.error('LEDGER INSERT FAILED:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerErr.message };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database exception';
      return { success: false, error: msg };
    }
  }

  // 5. Update fallback in-memory asset & mockStore
  mutateMockAsset(
    assetId,
    {
      status: 'checked_out',
      currentAssignedWorker: workerName.trim(),
      workerPhone: workerPhone?.trim() || null,
      currentWarehouseId: targetWarehouseId,
      warehouseId: targetWarehouseId,
      warehouseName: targetWarehouseName,
      warehouseCode: targetWarehouseCode,
    },
    {
      action: 'CHECKOUT',
      performedBy,
      targetWorker: workerName.trim(),
      workerPhone: workerPhone?.trim() || null,
      signatureData,
      notes: `הוצאה לאתר ${targetWarehouseName} (תג QR פיזי מאומת)`,
    }
  );

  // 6. Append audit history record
  appendAuditHistoryEntry({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assetId,
    qrCode,
    toolName: assetName,
    brand,
    modelNumber,
    action: 'CHECKOUT',
    performedBy,
    targetWorker: workerName.trim(),
    workerPhone: workerPhone?.trim() || null,
    condition,
    warehouseId: targetWarehouseId,
    warehouseName: targetWarehouseName,
    warehouseCode: targetWarehouseCode,
    notes: `הוצאה לאתר ${targetWarehouseName} עם אישור תיוג פיזי וחתימה דיגיטלית`,
    createdAt: now,
    organizationId: orgId || undefined,
    signatureData,
    isTagVerified,
    signedAt: now,
  });

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[dispatchAssetWithSignatureAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: `הכלי ${assetName} נופק בהצלחה לאתר ${targetWarehouseName} עם אישור תיוג וחתימה!`,
  };
}

/**
 * Snaps an OCR parsed candidate tag to an asset in public.assets or mockStore.
 * Checks tag_number = parsedTag, qr_code = parsedTag, or serial_number = parsedTag.
 * Scoped strictly to organization_id = orgId.
 */
export async function snapOcrTagToAssetAction(
  candidateTag: string,
  organizationId?: string,
  facilityId?: string
): Promise<{
  success: boolean;
  asset: ScannedAssetDetails | null;
  message?: string;
}> {
  const cleanTag = candidateTag.trim();
  if (!cleanTag) {
    return { success: false, asset: null, message: 'תגית ריקה' };
  }

  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, asset: null, message: 'לא נמצא מזהה ארגון מורשה' };
  }

  // Check 1: Query getAssetDetailsByQr directly (checks qr_code, id, nfc_uid, suffix)
  const assetByCode = await getAssetDetailsByQr(cleanTag, facilityId, orgId);
  if (assetByCode) {
    return { success: true, asset: assetByCode };
  }

  // Check 2: Try variant without dashes or with dashes (e.g., ZR-1099 vs ZR1099)
  const dashedVariant = cleanTag.includes('-')
    ? cleanTag.replace(/-/g, '')
    : cleanTag.replace(/^([A-Z]{2,6})([0-9]{2,6})$/i, '$1-$2');

  if (dashedVariant && dashedVariant !== cleanTag) {
    const assetByVariant = await getAssetDetailsByQr(dashedVariant, facilityId, orgId);
    if (assetByVariant) {
      return { success: true, asset: assetByVariant };
    }
  }

  // Check 3: If Supabase configured, perform direct query on tag_number
  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('assets')
        .select(`
          id,
          qr_code,
          nfc_uid,
          status,
          condition,
          current_assigned_worker,
          current_warehouse_id,
          version,
          purchase_date,
          purchase_cost,
          warranty_until,
          safety_inspection_due,
          is_locked,
          lock_reason,
          reservation,
          tool_models:tool_model_id (
            id,
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        `)
        .or(`tag_number.eq.${cleanTag},tag_number.eq.${dashedVariant},serial_number.eq.${cleanTag}`);

      query = query.eq('organization_id', orgId);

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        const mapped = mapJoinedRowToScannedAsset(data as unknown as JoinedAssetData);
        return { success: true, asset: mapped };
      }
    } catch (err) {
      console.warn('Supabase query error in snapOcrTagToAssetAction:', err);
    }
  }

  // Check 4: Check mock store via getMockAssetByQr
  const mockItem =
    getMockAssetByQr(cleanTag, facilityId, orgId) ||
    (dashedVariant ? getMockAssetByQr(dashedVariant, facilityId, orgId) : null);

  if (mockItem) {
    return { success: true, asset: mockItem };
  }

  return {
    success: false,
    asset: null,
    message: `לא נמצא כלי התואם לתגית "${cleanTag}".`,
  };
}

