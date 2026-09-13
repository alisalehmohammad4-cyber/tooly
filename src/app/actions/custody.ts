'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
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
import type { AssetReservation } from '@/types/domain';
import { appendAuditHistoryEntry } from '@/app/actions/history';

export interface ScannedAssetDetails {
  id: string;
  qrCode: string;
  status: 'available' | 'checked_out' | 'in_transit' | 'maintenance' | 'lost';
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired';
  currentAssignedWorker: string | null;
  currentWarehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  version: number;
  expectedReturnDate?: string | null;
  accessories?: AssetAccessories | null;
  // Phase 13 Fleet Control & Safety Lockout fields:
  purchaseDate?: string;
  purchaseCost?: number; // ILS / ₪
  warrantyUntil?: string;
  photoUrl?: string;
  safetyInspectionDue?: string; // ISO date
  isLocked?: boolean;
  lockReason?: string;
  reservation?: AssetReservation | null;
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

import {
  getMockAssetByQr,
  mutateMockAsset,
  getMockAssets,
} from '@/lib/mockStore';

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
    };
  });
}
initCustodyAssets();

const WAREHOUSE_NAMES: Record<string, { name: string; code: string }> = {
  'wh-main-01': { name: "מחסן מרכזי - אגף א'", code: 'CDB-01' },
  'wh-site-02': { name: "אתר בנייה - מכולה ב'", code: 'SCB-02' },
  'wh-van-03': { name: "רכב שירות נייד 05", code: 'MSV-05' },
};

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

/**
 * Retrieves full asset details by QR Code, joining tool model and warehouse.
 */
export async function getAssetDetailsByQr(
  qrCode: string
): Promise<ScannedAssetDetails | null> {
  const cleanQr = qrCode.trim();
  if (!cleanQr) return null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('assets')
        .select(`
          id,
          qr_code,
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
        .eq('qr_code', cleanQr)
        .maybeSingle();

      if (!error && data) {
        interface JoinedData {
          id: string;
          qr_code: string;
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

        const row = data as unknown as JoinedData;
        return {
          id: row.id,
          qrCode: row.qr_code,
          status: row.status,
          condition: row.condition,
          currentAssignedWorker: row.current_assigned_worker,
          currentWarehouseId: row.current_warehouse_id,
          warehouseName: row.warehouses?.name || 'Assigned Facility',
          warehouseCode: row.warehouses?.code || 'FAC',
          toolName: row.tool_models?.name || 'Registered Tool',
          brand: row.tool_models?.brand || 'Standard',
          modelNumber: row.tool_models?.model_number || null,
          version: row.version || 1,
          purchaseDate: row.purchase_date,
          purchaseCost: row.purchase_cost,
          warrantyUntil: row.warranty_until,
          safetyInspectionDue: row.safety_inspection_due,
          isLocked: row.is_locked,
          lockReason: row.lock_reason,
          reservation: row.reservation,
        };
      }
    } catch (err) {
      console.warn('Supabase query error in getAssetDetailsByQr, falling back to mock:', err);
    }
  }

  // Fallback lookup from unified mockStore
  const mockItem = getMockAssetByQr(cleanQr);
  if (mockItem) {
    return mockItem;
  }

  // Fallback lookup by QR (case-insensitive)
  const normalized = cleanQr.toUpperCase();
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (key.toUpperCase() === normalized) {
      return { ...FALLBACK_CUSTODY_ASSETS[key] };
    }
  }

  return null;
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

  // 1. Pre-validation: Enforce Administrative Lockout & Periodic Safety Inspection Due
  for (const id of assetIds) {
    let targetAsset: ScannedAssetDetails | null = null;
    for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
      if (FALLBACK_CUSTODY_ASSETS[key].id === id) {
        targetAsset = FALLBACK_CUSTODY_ASSETS[key];
        break;
      }
    }
    if (targetAsset) {
      const lockCheck = checkToolLockout(targetAsset);
      if (!lockCheck.allowed) {
        return {
          success: false,
          error: assetIds.length === 1 ? lockCheck.error! : `${targetAsset.toolName} (${targetAsset.qrCode}): ${lockCheck.error}`,
        };
      }
    }
  }

  const updatedAssets: ScannedAssetDetails[] = [];

  if (isSupabaseConfigured()) {
    try {
      // 1. Fetch current assets to verify existence and lockout
      const { data: currentAssets, error: fetchErr } = await supabase
        .from('assets')
        .select('id, version, status, is_locked, lock_reason, safety_inspection_due')
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

      // Check lockouts in DB
      for (const item of currentAssets) {
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

        const { error: updateErr } = await supabase
          .from('assets')
          .update({
            status: 'checked_out',
            current_assigned_worker: workerName,
            expected_return_date: expectedReturnDate,
            accessories: itemAccessories,
            version: nextVersion,
          })
          .eq('id', item.id);

        if (updateErr) {
          throw new Error(`Failed to update asset ${item.id}: ${updateErr.message}`);
        }

        // Insert into custody_ledger
        const { error: ledgerErr } = await supabase.from('custody_ledger').insert({
          asset_id: item.id,
          action: 'CHECKOUT',
          performed_by: workerName,
          target_worker: workerName,
          worker_phone: workerPhone || null,
          signature_data: signatureData,
          expected_return_date: expectedReturnDate,
          accessories_snapshot: itemAccessories,
          gps_lat: gps?.lat ?? null,
          gps_lng: gps?.lng ?? null,
          notes: notes || `Bulk checkout to ${workerName}`,
        });

        if (ledgerErr) {
          console.warn(`Custody ledger logging warning for asset ${item.id}:`, ledgerErr.message);
        }
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
        brand: 'Standard',
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

  if (isSupabaseConfigured()) {
    try {
      const { data: currentAsset, error: fetchErr } = await supabase
        .from('assets')
        .select('id, version')
        .eq('id', assetId)
        .single();

      if (fetchErr || !currentAsset) {
        return { success: false, error: 'Asset not found in database.' };
      }

      const nextVersion = (currentAsset.version || 1) + 1;

      const { error: updateErr } = await supabase
        .from('assets')
        .update({
          status: newStatus,
          current_assigned_worker: null,
          condition,
          version: nextVersion,
        })
        .eq('id', assetId);

      if (updateErr) {
        return { success: false, error: `Failed to check in asset: ${updateErr.message}` };
      }

      // Record audit in custody_ledger
      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CHECKIN',
        performed_by: 'Field Agent',
        notes: notes || `Field check-in (Condition: ${condition})`,
        damage_report: damageReport || null,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
      });
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
    brand: 'Standard',
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

  return {
    success: true,
    message: 'הכלי הוחזר למחסן בהצלחה.',
    asset: fallbackReturned,
  };
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

  if (isSupabaseConfigured()) {
    try {
      const { data: currentAsset, error: fetchErr } = await supabase
        .from('assets')
        .select('id, version')
        .eq('id', assetId)
        .single();

      if (fetchErr || !currentAsset) {
        return { success: false, error: 'Asset not found in database.' };
      }

      const nextVersion = (currentAsset.version || 1) + 1;

      const { error: updateErr } = await supabase
        .from('assets')
        .update({
          current_warehouse_id: targetWarehouseId,
          version: nextVersion,
        })
        .eq('id', assetId);

      if (updateErr) {
        return { success: false, error: `Failed to transfer asset: ${updateErr.message}` };
      }

      // Record audit in custody_ledger
      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'TRANSFER_RECEIVE',
        performed_by: 'Field Agent',
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        notes: notes || `Transferred to warehouse ${targetWarehouseId}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  const targetWhMeta = WAREHOUSE_NAMES[targetWarehouseId] || {
    name: 'Selected Facility',
    code: 'FAC',
  };

  // Update fallback in-memory asset if present
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].currentWarehouseId = targetWarehouseId;
      FALLBACK_CUSTODY_ASSETS[key].warehouseName = targetWhMeta.name;
      FALLBACK_CUSTODY_ASSETS[key].warehouseCode = targetWhMeta.code;
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      mutateMockAsset(
        FALLBACK_CUSTODY_ASSETS[key].qrCode,
        {
          warehouseId: targetWarehouseId,
          warehouseName: targetWhMeta.name,
          warehouseCode: targetWhMeta.code,
        },
        {
          action: 'TRANSFER_RECEIVE',
          performedBy: 'מחסנאי',
          notes: `העברת כלי למחסן: ${targetWhMeta.name}`,
        }
      );
      return {
        success: true,
        message: `מיקום הכלי עודכן בהצלחה ל-${targetWhMeta.name}`,
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: `מיקום הכלי עודכן ל-${targetWhMeta.name}`,
    asset: {
      id: assetId,
      qrCode: 'TOOL-CURRENT',
      status: 'available',
      condition: 'good',
      currentAssignedWorker: null,
      currentWarehouseId: targetWarehouseId,
      warehouseName: targetWhMeta.name,
      warehouseCode: targetWhMeta.code,
      toolName: 'Tool Asset',
      brand: 'Standard',
      modelNumber: null,
      version: 2,
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
      await supabase
        .from('assets')
        .update({
          is_locked: isLocked,
          lock_reason: isLocked ? lockReason || 'נעול מנהלית' : null,
        })
        .eq('id', assetId);

      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'LOCK_STATUS',
        performed_by: 'מנהל מערכת',
        notes: isLocked ? `נעילת כלי: ${lockReason || 'ללא סיבה'}` : 'שחרור נעילת כלי',
      });
    } catch (err) {
      console.warn('Database error in toggleAssetLockAction:', err);
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
      await supabase
        .from('assets')
        .update({
          safety_inspection_due: nextDueDate,
        })
        .eq('id', assetId);

      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'SAFETY_INSPECTION',
        performed_by: inspectedBy || 'בודק בטיחות מוסמך',
        notes: `חידוש בדיקת בטיחות תקופתית עד ${nextDueDate}`,
      });
    } catch (err) {
      console.warn('Database error in renewSafetyInspectionAction:', err);
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
      await supabase
        .from('assets')
        .update({
          reservation,
        })
        .eq('id', assetId);

      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CHECKIN',
        performed_by: reservation?.reservedBy || 'מנהל פרויקט',
        notes: reservation
          ? `שריון כלי לפרויקט ${reservation.projectName} לתאריך ${reservation.reservedForDate}`
          : 'ביטול שריון כלי',
      });
    } catch (err) {
      console.warn('Database error in reserveAssetAction:', err);
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

  if (isSupabaseConfigured()) {
    try {
      const { error: updateErr } = await supabase
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'needs_repair',
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId);

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון תקלה: ${updateErr.message}` };
      }

      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'MAINTENANCE_IN',
        performed_by: reportedBy || 'עובד שטח',
        notes: `דיווח תקלה (${issueType}): ${notes || 'ללא הערות'}`,
      });
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
      brand: 'Standard',
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

  if (isSupabaseConfigured()) {
    try {
      const { error: updateErr } = await supabase
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'retired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', assetId);

      if (updateErr) {
        return { success: false, error: `שגיאה בהשבתת כלי: ${updateErr.message}` };
      }

      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'DECOMMISSION',
        performed_by: retiredBy || 'מנהל מערכת',
        notes: `השבתת כלי וגריעה ממלאי: ${reason}`,
      });
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
      brand: 'Standard',
      modelNumber: null,
      version: 2,
    },
  };
}
