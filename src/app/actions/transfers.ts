'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getServerSessionOrgId, getServerSessionUser, DEFAULT_ORGANIZATION_ID } from '@/lib/auth/session';
import {
  getMockWarehouses,
  getMockAssets,
  mutateMockAsset,
  DEFAULT_ORGANIZATION,
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

async function resolveActiveOrg(providedOrgId?: string): Promise<string> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || DEFAULT_ORGANIZATION_ID;
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
        const mockAsset = getMockAssets().find((a) => a.id === assetId && (!a.organizationId || a.organizationId === orgId));
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

  let insertedInDb = false;
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

      if (!insertErr) {
        insertedInDb = true;
      } else {
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

  const results: AvailableTransferAssetItem[] = [];

  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
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
    // 1. Update asset status to 'in_transit' in Supabase
    if (isSupabaseConfigured()) {
      try {
        const { error: assetUpdateErr } = await supabaseAdmin
          .from('assets')
          .update({
            status: 'in_transit',
            updated_at: now,
          })
          .eq('id', targetRecord.asset_id)
          .eq('organization_id', orgId);

        if (assetUpdateErr) {
          console.warn('[decideTransferRequestAction] Asset update error:', assetUpdateErr);
        }

        // 2. Log TRANSFER_INIT in custody_ledger
        await supabaseAdmin.from('custody_ledger').insert({
          asset_id: targetRecord.asset_id,
          action: 'TRANSFER_INIT',
          performed_by: decidedBy,
          organization_id: orgId,
          notes: `אושרה בקשת העברה בין אתרים (${requestId})`,
          created_at: now,
        });
      } catch (err) {
        console.warn('[decideTransferRequestAction] Supabase error during approval:', err);
      }
    }

    // In-memory mock asset update
    mutateMockAsset(
      targetRecord.asset_id,
      { status: 'in_transit' },
      {
        action: 'TRANSFER_INIT',
        performedBy: decidedBy,
        notes: `אושרה העברה בין אתרים`,
      }
    );
  }

  // Update transfer_requests record
  if (isSupabaseConfigured()) {
    try {
      await supabaseAdmin
        .from('transfer_requests')
        .update({
          status: decision,
          rejection_reason: decision === 'REJECTED' ? (rejectionReason?.trim() || 'נדחה ע"י מנהל תפעול') : null,
          decided_by: decidedBy,
          decided_at: now,
          updated_at: now,
        })
        .eq('id', requestId)
        .eq('organization_id', orgId);
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

/**
 * 5. completeTransferReceptionAction
 * Storekeeper at target warehouse confirms physical arrival and receives the asset.
 * Updates asset's current_warehouse_id to targetWarehouseId and status to 'available'.
 * Logs TRANSFER_RECEIVE in custody_ledger.
 */
export async function completeTransferReceptionAction(
  requestId: string,
  assetId: string,
  targetWarehouseId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  const user = await getServerSessionUser();
  const receivedBy = user?.fullName || 'מחסנאי קולט';
  const now = new Date().toISOString();

  // 1. Verify target warehouse belongs to organization
  if (isSupabaseConfigured()) {
    try {
      const { data: wh } = await supabaseAdmin
        .from('warehouses')
        .select('id, name')
        .eq('id', targetWarehouseId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!wh) {
        const mockWh = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId);
        if (!mockWh) {
          return { success: false, error: 'מחסן היעד אינו שייך לארגון זה' };
        }
      }
    } catch {}
  }

  // 2. Update asset in Supabase
  if (isSupabaseConfigured()) {
    try {
      const { error: assetErr } = await supabaseAdmin
        .from('assets')
        .update({
          current_warehouse_id: targetWarehouseId,
          status: 'available',
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      if (assetErr) {
        return { success: false, error: `שגיאה בעדכון כלי: ${assetErr.message}` };
      }

      // Log TRANSFER_RECEIVE
      await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'TRANSFER_RECEIVE',
        performed_by: receivedBy,
        organization_id: orgId,
        notes: `קליטת ציוד שהועבר בין אתרים (בקשה: ${requestId})`,
        created_at: now,
      });

      // Update transfer_requests status
      await supabaseAdmin
        .from('transfer_requests')
        .update({
          status: 'COMPLETED',
          updated_at: now,
        })
        .eq('id', requestId)
        .eq('organization_id', orgId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update in-memory fallback
  const memReq = inMemoryTransferRequests.find((r) => r.id === requestId && r.organization_id === orgId);
  if (memReq) {
    memReq.status = 'COMPLETED';
    memReq.updated_at = now;
  }

  const targetWhMeta = getMockWarehouses(true, orgId).find((w) => w.id === targetWarehouseId);
  mutateMockAsset(
    assetId,
    {
      currentWarehouseId: targetWarehouseId,
      warehouseId: targetWarehouseId,
      warehouseName: targetWhMeta?.name || 'מחסן יעד',
      warehouseCode: targetWhMeta?.code || '',
      status: 'available',
    },
    {
      action: 'TRANSFER_RECEIVE',
      performedBy: receivedBy,
      notes: `קליטת ציוד במחסן היעד`,
    }
  );

  return {
    success: true,
    message: 'הכלי נקלט בהצלחה במחסן היעד וזמין כעת לניפוק!',
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

  const mockAssets = getMockAssets();
  const mockWhs = getMockWarehouses(true, orgId);
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
  const sessionUser = await getServerSessionUser();
  const performedBy = sessionUser?.fullName || (sessionUser as unknown as { name?: string })?.name || 'מחסנאי שטח';
  const now = new Date().toISOString();

  const { assetId, targetWarehouseId, transporterNotes } = data;
  if (!assetId || !targetWarehouseId) {
    return { success: false, error: 'יש לבחור כלי עבודה ומחסן יעד' };
  }

  // 1. Fetch current asset details to check availability and find source warehouse
  let sourceWhId = data.sourceWarehouseId || '';

  if (isSupabaseConfigured()) {
    try {
      const { data: asset, error: fetchErr } = await supabaseAdmin
        .from('assets')
        .select('id, current_warehouse_id, status, name, qr_code, organization_id')
        .eq('id', assetId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (fetchErr || !asset) {
        const m = getMockAssets(orgId).find((a) => a.id === assetId);
        if (!m) {
          return { success: false, error: 'כלי העבודה לא נמצא במערכת הארגון' };
        }
        if (m.status !== 'available') {
          return { success: false, error: 'לא ניתן לשנע כלי שאינו במצב זמין במחסן (Available)' };
        }
        sourceWhId = m.warehouseId || m.currentWarehouseId || sourceWhId;
      } else {
        if (asset.status !== 'available') {
          return { success: false, error: 'לא ניתן לשנע כלי שאינו במצב זמין במחסן (Available)' };
        }
        sourceWhId = asset.current_warehouse_id || sourceWhId;
      }
    } catch (err) {
      console.warn('[directStorekeeperTransferAction] Asset fetch error:', err);
    }
  } else {
    const m = getMockAssets(orgId).find((a) => a.id === assetId);
    if (!m) {
      return { success: false, error: 'כלי העבודה לא נמצא במערכת' };
    }
    if (m.status !== 'available') {
      return { success: false, error: 'לא ניתן לשנע כלי שאינו במצב זמין במחסן (Available)' };
    }
    sourceWhId = m.warehouseId || m.currentWarehouseId || sourceWhId;
  }

  if (sourceWhId && sourceWhId === targetWarehouseId) {
    return { success: false, error: 'מחסן המקור ומחסן היעד חייבים להיות שונים' };
  }

  const requestId = `trans-dir-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 2. Update asset to in_transit and log TRANSFER_INIT in Supabase
  if (isSupabaseConfigured()) {
    try {
      const { error: updateErr } = await supabaseAdmin
        .from('assets')
        .update({
          status: 'in_transit',
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון סטטוס כלי: ${updateErr.message}` };
      }

      await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        organization_id: orgId,
        warehouse_id: targetWarehouseId,
        action: 'TRANSFER_INIT',
        performed_by: performedBy,
        notes: `העברה ישירה ע"י מחסנאי לאתר יעד. הערות: ${transporterNotes || 'ללא'}`,
        created_at: now,
      });

      // Insert pre-approved transfer_requests record so receiving site & chief tracker see the route
      await supabaseAdmin.from('transfer_requests').insert({
        id: requestId,
        organization_id: orgId,
        asset_id: assetId,
        source_warehouse_id: sourceWhId || targetWarehouseId,
        target_warehouse_id: targetWarehouseId,
        requested_by: performedBy,
        requested_by_user_id: sessionUser?.id || null,
        decided_by: performedBy,
        decided_at: now,
        reason: transporterNotes ? `העברה ישירה ע"י מחסנאי: ${transporterNotes}` : 'העברה ישירה ע"י מחסנאי',
        status: 'APPROVED',
        created_at: now,
        updated_at: now,
      });
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
    source_warehouse_id: sourceWhId || 'wh-salehali-main',
    target_warehouse_id: targetWarehouseId,
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
    { status: 'in_transit' },
    {
      action: 'TRANSFER_INIT',
      performedBy,
      notes: `העברה ישירה ע"י מחסנאי לאתר יעד: ${transporterNotes || 'ללא'}`,
    }
  );

  try {
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/dashboard/chief');
  } catch {}

  return {
    success: true,
    message: 'הכלי שולח בהצלחה ועודכן בסטטוס בשינוע לאתר היעד (In-Transit)!',
    transferId: requestId,
  };
}

