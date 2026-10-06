'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { clearDashboardCaches } from '@/app/actions/dashboard';
import { getServerSessionOrgId, getServerSessionUser } from '@/lib/auth/session';
import {
  getMockWarehouses,
  getMockAssets,
  mutateMockAsset,
} from '@/lib/mockStore';

export interface PendingTransferItem {
  id: string;
  assetId: string;
  assetName: string;
  assetBrand?: string;
  assetModel?: string | null;
  serialNumber?: string | null;
  qrCode: string;
  tagNumber?: string | null;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  targetWarehouseId: string;
  targetWarehouseName: string;
  requestedBy: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  rejectionReason?: string | null;
  createdAt: string;
}

export interface AvailableTransferAssetItem {
  id: string;
  name: string;
  brand: string;
  modelNumber: string | null;
  qrCode: string;
  tagNumber: string | null;
  serialNumber: string | null;
  currentWarehouseId: string;
  currentWarehouseName: string;
  currentWarehouseCode?: string;
}

// Resilient in-memory store for fallback / offline transfer requests
interface TransferRecord {
  id: string;
  organization_id: string;
  asset_id: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  requested_by: string;
  requested_by_user_id?: string | null;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  rejection_reason?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
  updated_at: string;
}

const inMemoryTransferRequests: TransferRecord[] = [];

async function resolveActiveOrg(providedOrgId?: string): Promise<string | null> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || null;
}

/**
 * 1. createTransferRequestAction
 * Storekeeper submits an inter-site transfer request for Operations Manager approval.
 */
export async function createTransferRequestAction(data: {
  assetId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string; requestId?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();

  const { assetId, sourceWarehouseId, targetWarehouseId, reason } = data;

  if (!assetId || !sourceWarehouseId || !targetWarehouseId) {
    return { success: false, error: 'יש לציין כלי עבודה, מחסן מקור ומחסן יעד' };
  }

  if (sourceWarehouseId === targetWarehouseId) {
    return { success: false, error: 'מחסן המקור ומחסן היעד חייבים להיות שונים' };
  }

  // 1. Verify warehouses belong to active organization
  if (isSupabaseConfigured()) {
    try {
      const { data: whs, error: whErr } = await supabaseAdmin
        .from('warehouses')
        .select('id, name, organization_id')
        .eq('organization_id', orgId)
        .in('id', [sourceWarehouseId, targetWarehouseId]);

      if (whErr || !whs || whs.length < 2) {
        // Double check fallback if one of the warehouses was mock
        const mockSource = getMockWarehouses(true, orgId).find((w) => w.id === sourceWarehouseId);
        const mockTarget = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId);
        if (!mockSource || !mockTarget) {
          return {
            success: false,
            error: 'מחסן מקור או יעד אינו שייך לארגון זה',
          };
        }
      }
    } catch {
      // Fallback verification below
    }
  }

  // 2. Verify asset belongs to active organization
  if (isSupabaseConfigured()) {
    try {
      const { data: asset, error: assetErr } = await supabaseAdmin
        .from('assets')
        .select('id, organization_id, status')
        .eq('id', assetId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (assetErr || !asset) {
        const mockAsset = getMockAssets().find((a) => a.id === assetId && a.organizationId === orgId);
        if (!mockAsset) {
          return { success: false, error: 'כלי העבודה אינו שייך לארגון זה' };
        }
      }
    } catch {
      // Fallback verification
    }
  }

  const requestedBy = user?.fullName || 'מחסנאי מורשה';
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const { error: insertErr } = await supabaseAdmin.from('transfer_requests').insert({
        id: requestId,
        organization_id: orgId,
        asset_id: assetId,
        source_warehouse_id: sourceWarehouseId,
        target_warehouse_id: targetWarehouseId,
        requested_by: requestedBy,
        requested_by_user_id: user?.id || null,
        reason: reason?.trim() || null,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });

      if (insertErr) {
        console.warn('[createTransferRequestAction] Supabase insert error, falling back to memory store:', insertErr);
      }
    } catch (dbEx) {
      console.warn('[createTransferRequestAction] Supabase exception, using memory store:', dbEx);
    }
  }

  // Always keep in-memory sync for resilience
  inMemoryTransferRequests.unshift({
    id: requestId,
    organization_id: orgId,
    asset_id: assetId,
    source_warehouse_id: sourceWarehouseId,
    target_warehouse_id: targetWarehouseId,
    requested_by: requestedBy,
    requested_by_user_id: user?.id || null,
    reason: reason?.trim() || null,
    status: 'PENDING',
    created_at: now,
    updated_at: now,
  });

  return {
    success: true,
    requestId,
  };
}

/**
 * 2. getPendingTransfersAction
 * Fetches pending transfer requests strictly for the active organization with joined asset & warehouse details.
 */
export async function getPendingTransfersAction(): Promise<PendingTransferItem[]> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  let dbRequests: TransferRecord[] = [];

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('transfer_requests')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (!error && data) {
        dbRequests = data as TransferRecord[];
      }
    } catch (err) {
      console.warn('[getPendingTransfersAction] Supabase query error:', err);
    }
  }

  // Merge with memory requests for this organization
  const memRequests = inMemoryTransferRequests.filter(
    (r) => r.organization_id === orgId && r.status === 'PENDING'
  );

  const mergedMap = new Map<string, TransferRecord>();
  dbRequests.forEach((r) => mergedMap.set(r.id, r));
  memRequests.forEach((r) => {
    if (!mergedMap.has(r.id)) mergedMap.set(r.id, r);
  });

  const pendingList = Array.from(mergedMap.values());
  if (pendingList.length === 0) {
    return [];
  }

  // Batch query assets & warehouses for joined details
  const assetIds = Array.from(new Set(pendingList.map((r) => r.asset_id)));
  const warehouseIds = Array.from(
    new Set(pendingList.flatMap((r) => [r.source_warehouse_id, r.target_warehouse_id]))
  );

  const assetsMap = new Map<string, {
    name: string;
    brand: string;
    model: string | null;
    qrCode: string;
    tagNumber: string | null;
    serialNumber: string | null;
  }>();

  const warehousesMap = new Map<string, string>();

  // Fetch DB assets
  if (isSupabaseConfigured() && assetIds.length > 0) {
    try {
      const { data: dbAssets } = await supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, serial_number, tool_models(name, brand, model_number)')
        .eq('organization_id', orgId)
        .in('id', assetIds);

      if (dbAssets) {
        dbAssets.forEach((a: Record<string, unknown>) => {
          const tm = (a.tool_models as Record<string, unknown>) || {};
          assetsMap.set(a.id as string, {
            name: (a.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (a.brand as string) || (tm.brand as string) || 'Standard',
            model: (a.model_number as string) || (tm.model_number as string) || null,
            qrCode: (a.qr_code as string) || '',
            tagNumber: (a.tag_number as string) || null,
            serialNumber: (a.serial_number as string) || null,
          });
        });
      }
    } catch (err) {
      console.warn('[getPendingTransfersAction] Error fetching assets:', err);
    }
  }

  // Fetch DB warehouses
  if (isSupabaseConfigured() && warehouseIds.length > 0) {
    try {
      const { data: dbWhs } = await supabaseAdmin
        .from('warehouses')
        .select('id, name')
        .eq('organization_id', orgId)
        .in('id', warehouseIds);

      if (dbWhs) {
        dbWhs.forEach((w: Record<string, unknown>) => {
          warehousesMap.set(w.id as string, w.name as string);
        });
      }
    } catch (err) {
      console.warn('[getPendingTransfersAction] Error fetching warehouses:', err);
    }
  }

  // Fallback to mock store for missing assets/warehouses
  const mockAssets = getMockAssets();
  const mockWhs = getMockWarehouses(true, orgId);

  mockWhs.forEach((w) => {
    if (!warehousesMap.has(w.id)) {
      warehousesMap.set(w.id, w.name);
    }
  });

  return pendingList.map((req) => {
    let asset = assetsMap.get(req.asset_id);
    if (!asset) {
      const mAsset = mockAssets.find((a) => a.id === req.asset_id);
      if (mAsset) {
        asset = {
          name: mAsset.toolName || 'כלי עבודה',
          brand: mAsset.brand || 'Standard',
          model: mAsset.modelNumber || null,
          qrCode: mAsset.qrCode || '',
          tagNumber: mAsset.tagNumber || null,
          serialNumber: mAsset.serialNumber || null,
        };
      } else {
        asset = {
          name: 'כלי עבודה',
          brand: 'Standard',
          model: null,
          qrCode: 'N/A',
          tagNumber: null,
          serialNumber: null,
        };
      }
    }

    const sourceName = warehousesMap.get(req.source_warehouse_id) || 'מחסן מקור';
    const targetName = warehousesMap.get(req.target_warehouse_id) || 'מחסן יעד';

    return {
      id: req.id,
      assetId: req.asset_id,
      assetName: asset.name,
      assetBrand: asset.brand,
      assetModel: asset.model,
      serialNumber: asset.serialNumber,
      qrCode: asset.qrCode,
      tagNumber: asset.tagNumber,
      sourceWarehouseId: req.source_warehouse_id,
      sourceWarehouseName: sourceName,
      targetWarehouseId: req.target_warehouse_id,
      targetWarehouseName: targetName,
      requestedBy: req.requested_by,
      reason: req.reason,
      status: req.status,
      rejectionReason: req.rejection_reason,
      createdAt: req.created_at,
    };
  });
}

/**
 * 3. getAvailableAssetsForTransferAction
 * Queries available tools located across other facilities within the active organization.
 */
export async function getAvailableAssetsForTransferAction(
  targetWarehouseId?: string
): Promise<AvailableTransferAssetItem[]> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  const results: AvailableTransferAssetItem[] = [];

  if (isSupabaseConfigured()) {
    try {
      const query = supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, serial_number, current_warehouse_id, status, tool_models(name, brand, model_number), warehouses(id, name, code)')
        .eq('organization_id', orgId)
        .neq('status', 'in_transit')
        .order('created_at', { ascending: false })
        .limit(200);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        data.forEach((row: Record<string, unknown>) => {
          const whId = (row.current_warehouse_id as string) || '';
          if (targetWarehouseId && targetWarehouseId !== 'all' && whId === targetWarehouseId) {
            return;
          }
          const tm = (row.tool_models as Record<string, unknown>) || {};
          const wh = (row.warehouses as Record<string, unknown>) || {};

          results.push({
            id: row.id as string,
            name: (row.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (row.brand as string) || (tm.brand as string) || 'Standard',
            modelNumber: (row.model_number as string) || (tm.model_number as string) || null,
            qrCode: (row.qr_code as string) || '',
            tagNumber: (row.tag_number as string) || null,
            serialNumber: (row.serial_number as string) || null,
            currentWarehouseId: whId,
            currentWarehouseName: (wh.name as string) || 'מחסן אחר',
            currentWarehouseCode: (wh.code as string) || '',
          });
        });
        return results;
      }
    } catch (err) {
      console.warn('[getAvailableAssetsForTransferAction] Supabase query error:', err);
    }
  }

  // Fallback to mock store
  const mockWhs = getMockWarehouses(true, orgId);
  const whMap = new Map<string, { name: string; code: string }>();
  mockWhs.forEach((w) => whMap.set(w.id, { name: w.name, code: w.code }));

  const activeAssets = getMockAssets().filter(
    (a) => (!a.organizationId || a.organizationId === orgId) && a.status !== 'in_transit'
  );

  activeAssets.forEach((a) => {
    const whId = a.currentWarehouseId || a.warehouseId || '';
    if (targetWarehouseId && targetWarehouseId !== 'all' && whId === targetWarehouseId) {
      return;
    }
    const whMeta = whMap.get(whId);
    results.push({
      id: a.id,
      name: a.toolName || 'כלי עבודה',
      brand: a.brand || 'Standard',
      modelNumber: a.modelNumber || null,
      qrCode: a.qrCode || '',
      tagNumber: a.tagNumber || null,
      serialNumber: a.serialNumber || null,
      currentWarehouseId: whId,
      currentWarehouseName: whMeta?.name || a.warehouseName || 'מחסן אחר',
      currentWarehouseCode: whMeta?.code || a.warehouseCode || '',
    });
  });

  return results;
}

/**
 * 4. decideTransferRequestAction
 * Operations Manager approves or rejects an inter-site transfer request.
 * If APPROVED: updates asset status to 'in_transit' and logs TRANSFER_INIT in custody_ledger.
 */
export async function decideTransferRequestAction(
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const managerUser = await getServerSessionUser();
  const decidedBy = managerUser?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  let targetRecord: TransferRecord | null = null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('transfer_requests')
        .select('*')
        .eq('id', requestId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!error && data) {
        targetRecord = data as TransferRecord;
      }
    } catch (err) {
      console.warn('[decideTransferRequestAction] Fetch error:', err);
    }
  }

  // Fallback check in memory
  if (!targetRecord) {
    targetRecord = inMemoryTransferRequests.find((r) => r.id === requestId && r.organization_id === orgId) || null;
  }

  if (!targetRecord) {
    return { success: false, error: 'בקשת העברה לא נמצאה' };
  }

  if (decision === 'APPROVED') {
    // 1. Update asset status to 'in_transit' and current_warehouse_id in Supabase
    if (isSupabaseConfigured()) {
      try {
        const assetUpdateQuery = supabaseAdmin
          .from('assets')
          .update({
            current_warehouse_id: targetRecord.target_warehouse_id,
            status: 'in_transit',
            organization_id: orgId,
            updated_at: now,
          })
          .eq('id', targetRecord.asset_id);

        if (orgId) {
          assetUpdateQuery.eq('organization_id', orgId);
        }

        const { data: updatedAssetRows, error: assetUpdateErr } = await assetUpdateQuery.select();

        if (assetUpdateErr) {
          console.error('[decideTransferRequestAction] Asset update error:', assetUpdateErr);
          return { success: false, error: `שגיאה בעדכון כלי: ${assetUpdateErr.message}` };
        }

        if (!updatedAssetRows || updatedAssetRows.length === 0) {
          console.error('[decideTransferRequestAction] Zero rows updated for asset:', targetRecord.asset_id);
          return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
        }

        // 2. Log TRANSFER in custody_ledger
        const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
          asset_id: targetRecord.asset_id,
          action: 'TRANSFER',
          performed_by: decidedBy,
          organization_id: orgId,
          warehouse_id: targetRecord.target_warehouse_id,
          target_warehouse_id: targetRecord.target_warehouse_id,
          from_warehouse_id: targetRecord.source_warehouse_id,
          to_warehouse_id: targetRecord.target_warehouse_id,
          notes: `אושרה בקשת העברה בין אתרים (${requestId})`,
          created_at: now,
        });

        if (ledgerError) {
          console.error('CRITICAL: Failed to write transfer approval to custody_ledger:', ledgerError);
          return { success: false, error: 'שגיאה ברישום תנועת השינוע ביומן: ' + ledgerError.message };
        }
      } catch (err) {
        console.warn('[decideTransferRequestAction] Supabase error during approval:', err);
        const msg = err instanceof Error ? err.message : 'Database error';
        return { success: false, error: msg };
      }
    }

    // In-memory mock asset update
    const targetWhMeta = getMockWarehouses(true, orgId).find((w) => w.id === targetRecord.target_warehouse_id);
    mutateMockAsset(
      targetRecord.asset_id,
      {
        status: 'in_transit',
        warehouseId: targetRecord.target_warehouse_id,
        currentWarehouseId: targetRecord.target_warehouse_id,
        warehouseName: targetWhMeta?.name || 'מחסן יעד',
        warehouseCode: targetWhMeta?.code || '',
      },
      {
        action: 'TRANSFER_INIT',
        performedBy: decidedBy,
        notes: `אושרה העברה בין אתרים`,
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
      console.warn('[decideTransferRequestAction] revalidatePath warning:', e);
    }
  }

  // Update transfer_requests record
  if (isSupabaseConfigured()) {
    try {
      const reqUpdateQuery = supabaseAdmin
        .from('transfer_requests')
        .update({
          status: decision,
          rejection_reason: decision === 'REJECTED' ? (rejectionReason?.trim() || 'נדחה ע"י מנהל תפעול') : null,
          decided_by: decidedBy,
          decided_at: now,
          updated_at: now,
        })
        .eq('id', requestId);

      if (orgId) {
        reqUpdateQuery.eq('organization_id', orgId);
      }

      const { data: updatedReqRows, error: reqErr } = await reqUpdateQuery.select();

      if (reqErr) {
        console.error('[decideTransferRequestAction] Update transfer_requests error:', reqErr);
        return { success: false, error: `שגיאה בעדכון בקשת העברה: ${reqErr.message}` };
      }
    } catch (err) {
      console.warn('[decideTransferRequestAction] Update transfer_requests error:', err);
    }
  }

  // Update in-memory record
  targetRecord.status = decision;
  targetRecord.rejection_reason = decision === 'REJECTED' ? (rejectionReason?.trim() || 'נדחה ע"י מנהל תפעול') : null;
  targetRecord.decided_by = decidedBy;
  targetRecord.decided_at = now;
  targetRecord.updated_at = now;

  return {
    success: true,
    message:
      decision === 'APPROVED'
        ? 'בקשת ההעברה אושרה בהצלחה! הכלי עודכן לסטטוס בשינוע (In-Transit)'
        : 'בקשת ההעברה נדחתה',
  };
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

export interface CompleteTransferParams {
  assetId: string;
  targetWarehouseId?: string;
  notes?: string;
  requestId?: string;
}

export interface CancelTransferParams {
  assetId: string;
  sourceWarehouseId?: string;
  notes?: string;
  requestId?: string;
}

/**
 * 5. completeTransferReceptionAction
 * Storekeeper confirms physical arrival and receives the asset:
 * - Updates asset status from 'in_transit' to 'in_stock'.
 * - Sets asset current_warehouse_id to verified target warehouse UUID.
 * - Writes a "RECEIVE_TRANSFER" entry into custody_ledger with verified warehouse_id UUID.
 * - Updates any associated transfer_requests to 'COMPLETED'.
 */
export async function completeTransferReceptionAction(
  dataOrRequestId: string | CompleteTransferParams,
  assetIdArg?: string,
  targetWarehouseIdArg?: string,
  notesArg?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  let assetId = '';
  let targetWarehouseId = '';
  let notes: string | undefined;
  let requestId: string | undefined;

  if (typeof dataOrRequestId === 'object' && dataOrRequestId !== null) {
    assetId = dataOrRequestId.assetId || '';
    targetWarehouseId = dataOrRequestId.targetWarehouseId || '';
    notes = dataOrRequestId.notes;
    requestId = dataOrRequestId.requestId;
  } else {
    requestId = dataOrRequestId;
    assetId = assetIdArg || '';
    targetWarehouseId = targetWarehouseIdArg || '';
    notes = notesArg;
  }

  if (!assetId) {
    return { success: false, error: 'יש לציין מזהה כלי עבודה לקליטה' };
  }

  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();
  const receivedBy = user?.fullName || (user as unknown as { name?: string })?.name || 'מחסנאי קולט';
  const now = new Date().toISOString();

  let finalTargetWarehouseId: string | null = null;
  let finalTargetWarehouseName = 'מחסן יעד';

  // 1. Resolve and verify target warehouse strictly using verified UUIDs in Supabase
  if (isSupabaseConfigured()) {
    try {
      // Fetch asset to verify existence, organization, and current_warehouse_id
      const { data: asset, error: assetErr } = await supabaseAdmin
        .from('assets')
        .select('id, current_warehouse_id, organization_id, status, name, qr_code')
        .eq('id', assetId)
        .maybeSingle();

      if (assetErr || !asset) {
        return { success: false, error: 'כלי העבודה לא נמצא במערכת' };
      }

      const activeOrg = asset.organization_id || orgId;

      // Check if provided targetWarehouseId is a valid UUID and exists in warehouses
      let targetWh = await resolveVerifiedWarehouse(targetWarehouseId, activeOrg);
      if (!targetWh) {
        targetWh = await resolveVerifiedWarehouse(asset.current_warehouse_id, activeOrg);
      }
      if (!targetWh) {
        const { data: fallbackWh } = await supabaseAdmin
          .from('warehouses')
          .select('id, name')
          .eq('organization_id', activeOrg)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (fallbackWh) {
          targetWh = { id: fallbackWh.id, name: fallbackWh.name };
        }
      }

      if (!targetWh) {
        return { success: false, error: 'לא נמצא מזהה מחסן יעד תקין (UUID) לקליטת הציוד' };
      }

      finalTargetWarehouseId = targetWh.id;
      finalTargetWarehouseName = targetWh.name;

      // Resolve source warehouse UUID (from transfer_requests or custody_ledger)
      let sourceWh: { id: string; name: string } | null = null;
      if (requestId) {
        const { data: tr } = await supabaseAdmin
          .from('transfer_requests')
          .select('source_warehouse_id')
          .eq('id', requestId)
          .maybeSingle();
        if (tr?.source_warehouse_id) {
          sourceWh = await resolveVerifiedWarehouse(tr.source_warehouse_id, activeOrg);
        }
      }
      if (!sourceWh) {
        const { data: tr } = await supabaseAdmin
          .from('transfer_requests')
          .select('source_warehouse_id')
          .eq('asset_id', assetId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tr?.source_warehouse_id) {
          sourceWh = await resolveVerifiedWarehouse(tr.source_warehouse_id, activeOrg);
        }
      }
      if (!sourceWh) {
        const { data: ledgerPrev } = await supabaseAdmin
          .from('custody_ledger')
          .select('from_warehouse_id, warehouse_id')
          .eq('asset_id', assetId)
          .order('created_at', { ascending: false })
          .limit(3);
        if (ledgerPrev && ledgerPrev.length > 0) {
          const prevId = ledgerPrev[0]?.from_warehouse_id || ledgerPrev[0]?.warehouse_id;
          if (prevId) {
            sourceWh = await resolveVerifiedWarehouse(prevId, activeOrg);
          }
        }
      }

      const sourceWarehouseUuid = sourceWh?.id || null;

      // 2. Update asset in Supabase:
      // Updates asset status from 'in_transit' to 'in_stock'
      // Sets asset current_warehouse_id to the target warehouse UUID
      const assetUpdateQuery = supabaseAdmin
        .from('assets')
        .update({
          current_warehouse_id: finalTargetWarehouseId,
          status: 'in_stock',
          current_assigned_worker: null,
          updated_at: now,
        })
        .eq('id', assetId);

      const { data: updatedAssetRows, error: updateErr } = await assetUpdateQuery.select();

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון כלי: ${updateErr.message}` };
      }

      if (!updatedAssetRows || updatedAssetRows.length === 0) {
        return { success: false, error: 'העדכון נכשל: הכלי לא נמצא (0 שורות עודכנו).' };
      }

      // 3. Write a "RECEIVE_TRANSFER" entry into custody_ledger with verified UUID
      const { error: ledgerErr } = await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'RECEIVE_TRANSFER',
        warehouse_id: finalTargetWarehouseId,
        target_warehouse_id: finalTargetWarehouseId,
        from_warehouse_id: sourceWarehouseUuid,
        to_warehouse_id: finalTargetWarehouseId,
        target_site_name: finalTargetWarehouseName,
        performed_by: receivedBy,
        organization_id: activeOrg,
        notes: notes?.trim() || `אישור הגעה וקליטת ציוד במחסן היעד (${finalTargetWarehouseName})`,
        created_at: now,
      });

      if (ledgerErr) {
        console.error('CRITICAL: Failed to write transfer reception to custody_ledger:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום תנועת קליטת השינוע ביומן: ' + ledgerErr.message };
      }

      // 4. Update transfer_requests record if present
      if (requestId) {
        await supabaseAdmin
          .from('transfer_requests')
          .update({
            status: 'COMPLETED',
            updated_at: now,
          })
          .eq('id', requestId);
      } else {
        await supabaseAdmin
          .from('transfer_requests')
          .update({
            status: 'COMPLETED',
            updated_at: now,
          })
          .eq('asset_id', assetId)
          .eq('status', 'APPROVED');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Fallback in-memory sync
  const targetWhMeta = getMockWarehouses(true, orgId).find((w) => w.id === (finalTargetWarehouseId || targetWarehouseId));
  mutateMockAsset(
    assetId,
    {
      currentWarehouseId: finalTargetWarehouseId || targetWarehouseId,
      warehouseId: finalTargetWarehouseId || targetWarehouseId,
      warehouseName: finalTargetWarehouseName || targetWhMeta?.name || 'מחסן יעד',
      warehouseCode: targetWhMeta?.code || '',
      status: 'in_stock',
    },
    {
      action: 'RECEIVE_TRANSFER',
      performedBy: receivedBy,
      notes: notes || 'קליטת ציוד במחסן היעד',
    }
  );

  if (requestId) {
    const memReq = inMemoryTransferRequests.find((r) => r.id === requestId && r.organization_id === orgId);
    if (memReq) {
      memReq.status = 'COMPLETED';
      memReq.updated_at = now;
    }
  }

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/chief');
  } catch (e) {
    console.warn('[completeTransferReceptionAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי נקלט בהצלחה במחסן היעד וזמין כעת במלאי!',
  };
}

/**
 * 5b. cancelTransferRollbackAction
 * Storekeeper or operations manager cancels an active transfer and rolls it back:
 * - Returns asset status to 'in_stock' at the source warehouse.
 * - Sets current_warehouse_id back to verified source warehouse UUID.
 * - Writes a "CANCEL_TRANSFER" audit record in custody_ledger.
 * - Marks any associated transfer_requests as REJECTED.
 */
export async function cancelTransferRollbackAction(
  dataOrAssetId: string | CancelTransferParams,
  sourceWarehouseIdArg?: string,
  notesArg?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  let assetId = '';
  let sourceWarehouseId = '';
  let notes: string | undefined;
  let requestId: string | undefined;

  if (typeof dataOrAssetId === 'object' && dataOrAssetId !== null) {
    assetId = dataOrAssetId.assetId || '';
    sourceWarehouseId = dataOrAssetId.sourceWarehouseId || '';
    notes = dataOrAssetId.notes;
    requestId = dataOrAssetId.requestId;
  } else {
    assetId = dataOrAssetId;
    sourceWarehouseId = sourceWarehouseIdArg || '';
    notes = notesArg;
  }

  if (!assetId) {
    return { success: false, error: 'יש לציין מזהה כלי עבודה לביטול שינוע' };
  }

  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();
  const performedBy = user?.fullName || 'מחסנאי שטח';
  const now = new Date().toISOString();

  let finalSourceWarehouseId: string | null = null;
  let finalSourceWarehouseName = 'מחסן מקור';

  if (isSupabaseConfigured()) {
    try {
      // 1. Fetch asset to verify existence & active organization
      const { data: asset, error: assetErr } = await supabaseAdmin
        .from('assets')
        .select('id, current_warehouse_id, organization_id, status, name, qr_code')
        .eq('id', assetId)
        .maybeSingle();

      if (assetErr || !asset) {
        return { success: false, error: 'כלי העבודה לא נמצא במערכת' };
      }

      const activeOrg = asset.organization_id || orgId;

      // 2. Resolve source warehouse UUID:
      // a. Check if provided sourceWarehouseId is a valid UUID in warehouses
      if (isValidUuid(sourceWarehouseId)) {
        const { data: wh } = await supabaseAdmin
          .from('warehouses')
          .select('id, name')
          .eq('id', sourceWarehouseId)
          .maybeSingle();
        if (wh) {
          finalSourceWarehouseId = wh.id;
          finalSourceWarehouseName = wh.name;
        }
      }

      // b. Check if transfer_requests recorded a source warehouse
      if (!finalSourceWarehouseId) {
        const { data: tr } = await supabaseAdmin
          .from('transfer_requests')
          .select('source_warehouse_id')
          .eq('asset_id', assetId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tr?.source_warehouse_id && isValidUuid(tr.source_warehouse_id)) {
          const { data: wh } = await supabaseAdmin
            .from('warehouses')
            .select('id, name')
            .eq('id', tr.source_warehouse_id)
            .maybeSingle();
          if (wh) {
            finalSourceWarehouseId = wh.id;
            finalSourceWarehouseName = wh.name;
          }
        }
      }

      // c. Check custody_ledger history for previous warehouse
      if (!finalSourceWarehouseId) {
        const { data: ledgerRows } = await supabaseAdmin
          .from('custody_ledger')
          .select('warehouse_id')
          .eq('asset_id', assetId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (ledgerRows && ledgerRows.length > 0) {
          const prevEntry = ledgerRows.find((r) => r.warehouse_id && r.warehouse_id !== asset.current_warehouse_id);
          const candidateId = prevEntry?.warehouse_id || ledgerRows[0]?.warehouse_id;
          if (isValidUuid(candidateId)) {
            const { data: wh } = await supabaseAdmin
              .from('warehouses')
              .select('id, name')
              .eq('id', candidateId)
              .maybeSingle();
            if (wh) {
              finalSourceWarehouseId = wh.id;
              finalSourceWarehouseName = wh.name;
            }
          }
        }
      }

      // d. Fallback to organization's warehouses list
      if (!finalSourceWarehouseId) {
        const { data: orgWhs } = await supabaseAdmin
          .from('warehouses')
          .select('id, name')
          .eq('organization_id', activeOrg)
          .order('created_at', { ascending: true });

        if (orgWhs && orgWhs.length > 0) {
          const diffWh = orgWhs.find((w) => w.id !== asset.current_warehouse_id);
          const chosen = diffWh || orgWhs[0];
          finalSourceWarehouseId = chosen.id;
          finalSourceWarehouseName = chosen.name;
        }
      }

      // e. Final fallback: asset.current_warehouse_id if valid
      if (!finalSourceWarehouseId && isValidUuid(asset.current_warehouse_id)) {
        finalSourceWarehouseId = asset.current_warehouse_id;
      }

      if (!finalSourceWarehouseId) {
        return { success: false, error: 'לא נמצא מזהה מחסן מקור תקין (UUID) להחזרת הציוד' };
      }

      // 3. Update asset in Supabase:
      // Returns asset status to 'in_stock' at the source warehouse
      const assetUpdateQuery = supabaseAdmin
        .from('assets')
        .update({
          current_warehouse_id: finalSourceWarehouseId,
          status: 'in_stock',
          current_assigned_worker: null,
          updated_at: now,
        })
        .eq('id', assetId);

      const { data: updatedAssetRows, error: updateErr } = await assetUpdateQuery.select();

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון כלי: ${updateErr.message}` };
      }

      if (!updatedAssetRows || updatedAssetRows.length === 0) {
        return { success: false, error: 'העדכון נכשל: הכלי לא נמצא (0 שורות עודכנו).' };
      }

      // 4. Writes a "CANCEL_TRANSFER" audit record in custody_ledger
      const { error: ledgerErr } = await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CANCEL_TRANSFER',
        warehouse_id: finalSourceWarehouseId,
        target_warehouse_id: finalSourceWarehouseId,
        from_warehouse_id: finalSourceWarehouseId,
        to_warehouse_id: finalSourceWarehouseId,
        target_site_name: finalSourceWarehouseName,
        performed_by: performedBy,
        organization_id: activeOrg,
        notes: notes?.trim() || `ביטול שינוע והחזרה למחסן מקור (${finalSourceWarehouseName})`,
        created_at: now,
      });

      if (ledgerErr) {
        console.error('CRITICAL: Failed to write cancel transfer to custody_ledger:', ledgerErr);
        return { success: false, error: 'שגיאה ברישום ביטול השינוע ביומן: ' + ledgerErr.message };
      }

      // 5. Update transfer_requests record if present
      if (requestId) {
        await supabaseAdmin
          .from('transfer_requests')
          .update({
            status: 'REJECTED',
            rejection_reason: 'ביטול שינוע והחזרה למחסן מקור',
            updated_at: now,
          })
          .eq('id', requestId);
      } else {
        await supabaseAdmin
          .from('transfer_requests')
          .update({
            status: 'REJECTED',
            rejection_reason: 'ביטול שינוע והחזרה למחסן מקור',
            updated_at: now,
          })
          .eq('asset_id', assetId)
          .eq('status', 'APPROVED');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Fallback in-memory sync
  const sourceWhMeta = getMockWarehouses(true, orgId).find((w) => w.id === (finalSourceWarehouseId || sourceWarehouseId));
  mutateMockAsset(
    assetId,
    {
      currentWarehouseId: finalSourceWarehouseId || sourceWarehouseId,
      warehouseId: finalSourceWarehouseId || sourceWarehouseId,
      warehouseName: finalSourceWarehouseName || sourceWhMeta?.name || 'מחסן מקור',
      warehouseCode: sourceWhMeta?.code || '',
      status: 'in_stock',
    },
    {
      action: 'CANCEL_TRANSFER',
      performedBy,
      notes: notes || 'ביטול שינוע והחזרה למחסן מקור',
    }
  );

  if (requestId) {
    const memReq = inMemoryTransferRequests.find((r) => r.id === requestId && r.organization_id === orgId);
    if (memReq) {
      memReq.status = 'REJECTED';
      memReq.rejection_reason = 'ביטול שינוע והחזרה למחסן מקור';
      memReq.updated_at = now;
    }
  }

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/chief');
  } catch (e) {
    console.warn('[cancelTransferRollbackAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'השינוע בוטל בהצלחה והכלי הוחזר למחסן המקור!',
  };
}

/**
 * 6. getIncomingInTransitTransfersAction
 * Fetches approved in-transit transfers heading to a specific warehouse (or all warehouses).
 */
export async function getIncomingInTransitTransfersAction(
  targetWarehouseId?: string
): Promise<PendingTransferItem[]> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  let dbRequests: TransferRecord[] = [];

  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
        .from('transfer_requests')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'APPROVED')
        .order('updated_at', { ascending: false });

      if (targetWarehouseId && targetWarehouseId !== 'all') {
        query = query.eq('target_warehouse_id', targetWarehouseId);
      }

      const { data, error } = await query;
      if (!error && data) {
        dbRequests = data as TransferRecord[];
      }
    } catch (err) {
      console.warn('[getIncomingInTransitTransfersAction] Error:', err);
    }
  }

  const memRequests = inMemoryTransferRequests.filter(
    (r) =>
      r.organization_id === orgId &&
      r.status === 'APPROVED' &&
      (!targetWarehouseId || targetWarehouseId === 'all' || r.target_warehouse_id === targetWarehouseId)
  );

  const mergedMap = new Map<string, TransferRecord>();
  dbRequests.forEach((r) => mergedMap.set(r.id, r));
  memRequests.forEach((r) => {
    if (!mergedMap.has(r.id)) mergedMap.set(r.id, r);
  });

  const list = Array.from(mergedMap.values());
  if (list.length === 0) return [];

  const assetIds = Array.from(new Set(list.map((r) => r.asset_id)));
  const warehouseIds = Array.from(
    new Set(list.flatMap((r) => [r.source_warehouse_id, r.target_warehouse_id]))
  );

  const assetsMap = new Map<string, {
    name: string;
    brand: string;
    model: string | null;
    qrCode: string;
    tagNumber: string | null;
    serialNumber: string | null;
  }>();
  const warehousesMap = new Map<string, string>();

  if (isSupabaseConfigured() && assetIds.length > 0) {
    try {
      const { data: dbAssets } = await supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, serial_number, tool_models(name, brand, model_number)')
        .eq('organization_id', orgId)
        .in('id', assetIds);

      if (dbAssets) {
        dbAssets.forEach((a: Record<string, unknown>) => {
          const tm = (a.tool_models as Record<string, unknown>) || {};
          assetsMap.set(a.id as string, {
            name: (a.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (a.brand as string) || (tm.brand as string) || 'Standard',
            model: (a.model_number as string) || (tm.model_number as string) || null,
            qrCode: (a.qr_code as string) || '',
            tagNumber: (a.tag_number as string) || null,
            serialNumber: (a.serial_number as string) || null,
          });
        });
      }
    } catch {}
  }

  if (isSupabaseConfigured() && warehouseIds.length > 0) {
    try {
      const { data: dbWhs } = await supabaseAdmin
        .from('warehouses')
        .select('id, name')
        .eq('organization_id', orgId)
        .in('id', warehouseIds);

      if (dbWhs) {
        dbWhs.forEach((w: Record<string, unknown>) => warehousesMap.set(w.id as string, w.name as string));
      }
    } catch {}
  }

  const mockAssets = getMockAssets(orgId || undefined);
  const mockWhs = getMockWarehouses(true, orgId || undefined);
  mockWhs.forEach((w) => {
    if (!warehousesMap.has(w.id)) warehousesMap.set(w.id, w.name);
  });

  return list.map((req) => {
    let asset = assetsMap.get(req.asset_id);
    if (!asset) {
      const m = mockAssets.find((a) => a.id === req.asset_id);
      asset = {
        name: m?.toolName || 'כלי עבודה',
        brand: m?.brand || 'Standard',
        model: m?.modelNumber || null,
        qrCode: m?.qrCode || '',
        tagNumber: m?.tagNumber || null,
        serialNumber: m?.serialNumber || null,
      };
    }
    return {
      id: req.id,
      assetId: req.asset_id,
      assetName: asset.name,
      assetBrand: asset.brand,
      assetModel: asset.model,
      serialNumber: asset.serialNumber,
      qrCode: asset.qrCode,
      tagNumber: asset.tagNumber,
      sourceWarehouseId: req.source_warehouse_id,
      sourceWarehouseName: warehousesMap.get(req.source_warehouse_id) || 'מחסן מקור',
      targetWarehouseId: req.target_warehouse_id,
      targetWarehouseName: warehousesMap.get(req.target_warehouse_id) || 'מחסן יעד',
      requestedBy: req.requested_by,
      reason: req.reason,
      status: req.status,
      rejectionReason: req.rejection_reason,
      createdAt: req.created_at,
    };
  });
}

/**
 * 6. getLocalAvailableAssetsForTransferAction
 * Fetches assets currently located in a specific warehouse with status === 'available'
 * for direct outbound transfer by the site storekeeper.
 */
export async function getLocalAvailableAssetsForTransferAction(
  sourceWarehouseId?: string
): Promise<AvailableTransferAssetItem[]> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }
  const results: AvailableTransferAssetItem[] = [];

  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, serial_number, current_warehouse_id, status, tool_models(name, brand, model_number), warehouses(id, name, code)')
        .eq('organization_id', orgId)
        .eq('status', 'available')
        .order('name', { ascending: true })
        .limit(300);

      if (sourceWarehouseId && sourceWarehouseId !== 'all') {
        query = query.eq('current_warehouse_id', sourceWarehouseId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        data.forEach((row: Record<string, unknown>) => {
          const tm = (row.tool_models as Record<string, unknown>) || {};
          const wh = (row.warehouses as Record<string, unknown>) || {};
          results.push({
            id: row.id as string,
            name: (row.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (row.brand as string) || (tm.brand as string) || 'Standard',
            modelNumber: (row.model_number as string) || (tm.model_number as string) || null,
            qrCode: (row.qr_code as string) || '',
            tagNumber: (row.tag_number as string) || null,
            serialNumber: (row.serial_number as string) || null,
            currentWarehouseId: (row.current_warehouse_id as string) || '',
            currentWarehouseName: (wh.name as string) || 'מחסן מקומי',
            currentWarehouseCode: (wh.code as string) || '',
          });
        });
        return results;
      }
    } catch (err) {
      console.warn('[getLocalAvailableAssetsForTransferAction] Supabase error:', err);
    }
  }

  // Fallback to mock store
  const mockWhs = getMockWarehouses(true, orgId);
  const whMap = new Map<string, { name: string; code: string }>();
  mockWhs.forEach((w) => whMap.set(w.id, { name: w.name, code: w.code }));

  const activeAssets = getMockAssets(orgId).filter((a) => {
    const matchesWh =
      !sourceWarehouseId ||
      sourceWarehouseId === 'all' ||
      a.warehouseId === sourceWarehouseId ||
      a.currentWarehouseId === sourceWarehouseId;
    return matchesWh && a.status === 'available';
  });

  return activeAssets.map((a) => {
    const whId = a.warehouseId || a.currentWarehouseId || '';
    const whMeta = whMap.get(whId);
    return {
      id: a.id,
      name: a.toolName || 'כלי עבודה',
      brand: a.brand || 'Standard',
      modelNumber: a.modelNumber || null,
      qrCode: a.qrCode || '',
      tagNumber: a.tagNumber || null,
      serialNumber: a.serialNumber || null,
      currentWarehouseId: whId,
      currentWarehouseName: whMeta?.name || a.warehouseName || 'מחסן מקומי',
      currentWarehouseCode: whMeta?.code || a.warehouseCode || '',
    };
  });
}

/**
 * 7. directStorekeeperTransferAction
 * Allows site storekeepers to directly dispatch equipment from their current warehouse
 * to another site without requiring prior manager approval:
 * - Validates that the asset is currently in the storekeeper's warehouse and available.
 * - Updates public.assets status to 'in_transit'.
 * - Logs TRANSFER_INIT in public.custody_ledger.
 * - Pre-creates an approved transfer_requests record so destination site and chief tracker see the route.
 * - Calls revalidatePath('/dashboard/warehouse').
 */
export async function directStorekeeperTransferAction(data: {
  assetId: string;
  targetWarehouseId: string;
  transporterNotes?: string;
  sourceWarehouseId?: string;
}): Promise<{ success: boolean; error?: string; message?: string; transferId?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const sessionUser = await getServerSessionUser();
  const performedBy = sessionUser?.fullName || (sessionUser as unknown as { name?: string })?.name || 'מחסנאי שטח';
  const now = new Date().toISOString();

  const { assetId, targetWarehouseId, transporterNotes } = data;
  if (!assetId || !targetWarehouseId) {
    return { success: false, error: 'יש לבחור כלי עבודה ומחסן יעד' };
  }

  // 1. Fetch current asset details to check availability and find source warehouse
  let sourceWhId = data.sourceWarehouseId || '';
  let sourceWhName = 'מחסן מקור';
  let targetWarehouseUuid = targetWarehouseId;
  let targetWarehouseName = 'מחסן יעד';

  if (isSupabaseConfigured()) {
    try {
      // Resolve target warehouse strictly as verified UUID
      const targetWh = await resolveVerifiedWarehouse(targetWarehouseId, orgId);
      if (!targetWh) {
        return { success: false, error: 'לא נמצא מחסן יעד מורשה בארגון זה (UUID לא תקין)' };
      }
      targetWarehouseUuid = targetWh.id;
      targetWarehouseName = targetWh.name;

      const { data: asset, error: fetchErr } = await supabaseAdmin
        .from('assets')
        .select('id, current_warehouse_id, status, name, qr_code, organization_id')
        .eq('id', assetId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (fetchErr) {
        return { success: false, error: fetchErr.message };
      }
      if (!asset) {
        return { success: false, error: 'כלי העבודה לא נמצא במערכת הארגון' };
      }
      if (asset.status !== 'available' && asset.status !== 'in_stock') {
        return { success: false, error: 'לא ניתן לשנע כלי שאינו במצב זמין במחסן (Available)' };
      }

      // Resolve source warehouse strictly as verified UUID
      let sourceWh = await resolveVerifiedWarehouse(data.sourceWarehouseId || asset.current_warehouse_id, orgId);
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

      if (sourceWh) {
        sourceWhId = sourceWh.id;
        sourceWhName = sourceWh.name;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  } else {
    const m = getMockAssets(orgId).find((a) => a.id === assetId);
    if (!m) {
      return { success: false, error: 'כלי העבודה לא נמצא במערכת' };
    }
    if (m.status !== 'available' && m.status !== 'in_stock') {
      return { success: false, error: 'לא ניתן לשנע כלי שאינו במצב זמין במחסן (Available)' };
    }
    sourceWhId = m.warehouseId || m.currentWarehouseId || sourceWhId;
  }

  if (sourceWhId && sourceWhId === targetWarehouseUuid) {
    return { success: false, error: 'מחסן המקור ומחסן היעד חייבים להיות שונים' };
  }

  const requestId = `trans-dir-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 2. Step A: Update assets table and Step B: Atomically INSERT an audit movement record into custody_ledger
  if (isSupabaseConfigured()) {
    try {
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          current_warehouse_id: targetWarehouseUuid,
          status: 'in_transit',
          current_assigned_worker: null,
          organization_id: orgId,
          updated_at: now,
        })
        .eq('id', assetId);

      if (orgId) {
        updateQuery.eq('organization_id', orgId);
      }

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        console.error("Transfer DB Error:", updateErr);
        return { success: false, error: `שגיאה בעדכון כלי ומחסן: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for direct transfer asset:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
        organization_id: orgId,
        asset_id: assetId,
        action: 'TRANSFER',
        warehouse_id: targetWarehouseUuid,
        target_warehouse_id: targetWarehouseUuid,
        from_warehouse_id: sourceWhId || null,
        to_warehouse_id: targetWarehouseUuid,
        target_site_name: targetWarehouseName,
        performed_by: performedBy,
        notes: transporterNotes
          ? `שינוע מ-${sourceWhName} אל ${targetWarehouseName}. הערות: ${transporterNotes}`
          : `שינוע מ-${sourceWhName} אל ${targetWarehouseName}`,
        created_at: now,
      });

      if (ledgerError) {
        console.error('CRITICAL: Failed to write transfer to custody_ledger:', ledgerError);
        return { success: false, error: 'שגיאה ברישום תנועת השינוע ביומן: ' + ledgerError.message };
      }

      // Insert pre-approved transfer_requests record so receiving site & chief tracker see the route
      const { error: trErr } = await supabaseAdmin.from('transfer_requests').insert({
        id: requestId,
        organization_id: orgId,
        asset_id: assetId,
        source_warehouse_id: sourceWhId || targetWarehouseUuid,
        target_warehouse_id: targetWarehouseUuid,
        requested_by: performedBy,
        requested_by_user_id: sessionUser?.id || null,
        decided_by: performedBy,
        decided_at: now,
        reason: transporterNotes ? `העברה ישירה ע"י מחסנאי: ${transporterNotes}` : 'העברה ישירה ע"י מחסנאי',
        status: 'APPROVED',
        created_at: now,
        updated_at: now,
      });

      if (trErr) {
        console.error('Failed to create transfer_requests record:', trErr);
        return { success: false, error: `שגיאה ברישום בקשת שינוע: ${trErr.message}` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // 3. Fallback / Synchronize in-memory stores
  inMemoryTransferRequests.unshift({
    id: requestId,
    organization_id: orgId,
    asset_id: assetId,
    source_warehouse_id: sourceWhId || targetWarehouseUuid,
    target_warehouse_id: targetWarehouseUuid,
    requested_by: performedBy,
    requested_by_user_id: sessionUser?.id || null,
    reason: transporterNotes ? `העברה ישירה ע"י מחסנאי: ${transporterNotes}` : 'העברה ישירה ע"י מחסנאי',
    status: 'APPROVED',
    decided_by: performedBy,
    decided_at: now,
    created_at: now,
    updated_at: now,
  });

  mutateMockAsset(
    assetId,
    {
      status: 'in_transit',
      warehouseId: targetWarehouseId,
      currentWarehouseId: targetWarehouseId,
    },
    {
      action: 'TRANSFER_INIT',
      performedBy,
      notes: `העברה ישירה ע"י מחסנאי לאתר יעד: ${transporterNotes || 'ללא'}`,
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
    console.warn('[directStorekeeperTransferAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי שולח בהצלחה ועודכן בסטטוס בשינוע לאתר היעד (In-Transit)!',
    transferId: requestId,
  };
}

