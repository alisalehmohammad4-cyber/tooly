'use server';

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getServerSessionOrgId, getServerSessionUser, DEFAULT_ORGANIZATION_ID } from '@/lib/auth/session';
import {
  getMockWarehouses,
  getMockAssets,
  mutateMockAsset,
  DEFAULT_ORGANIZATION,
} from '@/lib/mockStore';

export interface SiteToolRequestItem {
  id: string;
  organizationId: string;
  requestingWarehouseId: string;
  requestingWarehouseName: string;
  toolDescription: string;
  quantity: number;
  urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
  reason?: string | null;
  status: 'PENDING' | 'IN_TRANSIT' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  assignedAssetId?: string | null;
  assignedAssetName?: string | null;
  assignedAssetQr?: string | null;
  assignedAssetTag?: string | null;
  assignedAssetBrand?: string | null;
  assignedAssetModel?: string | null;
  assignedAssetSerial?: string | null;
  sourceWarehouseId?: string | null;
  sourceWarehouseName?: string | null;
  rejectionReason?: string | null;
  requestedBy: string;
  requestedByUserId?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestedToolAsset {
  id: string;
  name: string;
  brand: string;
  modelNumber: string | null;
  qrCode: string;
  tagNumber: string | null;
  serialNumber: string | null;
  currentWarehouseId: string;
  currentWarehouseName: string;
}

export interface SiteStorekeeperDashboardData {
  siteInventory: Array<{
    id: string;
    name: string;
    brand: string;
    model: string | null;
    qrCode: string;
    tagNumber: string | null;
    status: string;
    serialNumber: string | null;
  }>;
  incomingShipments: SiteToolRequestItem[];
  myRequests: SiteToolRequestItem[];
}

interface SiteToolRequestRecord {
  id: string;
  organization_id: string;
  requesting_warehouse_id: string;
  tool_description: string;
  quantity: number;
  urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
  reason?: string | null;
  status: 'PENDING' | 'IN_TRANSIT' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  assigned_asset_id?: string | null;
  source_warehouse_id?: string | null;
  rejection_reason?: string | null;
  requested_by: string;
  requested_by_user_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  received_at?: string | null;
  created_at: string;
  updated_at: string;
}

// In-memory resilient storage for offline / mock testing
const inMemorySiteToolRequests: SiteToolRequestRecord[] = [];

async function resolveActiveOrg(providedOrgId?: string): Promise<string> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || DEFAULT_ORGANIZATION_ID;
}

/**
 * 1. createSiteToolRequestAction
 * Site Storekeeper submits a tool request for their specific site container.
 */
export async function createSiteToolRequestAction(data: {
  toolDescription: string;
  quantity: number;
  urgency: string;
  reason?: string;
  requestingWarehouseId?: string;
}): Promise<{ success: boolean; error?: string; requestId?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  const user = await getServerSessionUser();

  const toolDesc = (data.toolDescription || '').trim();
  if (!toolDesc) {
    return { success: false, error: 'יש לציין תיאור של כלי העבודה הנדרש' };
  }

  const cleanWarehouseId =
    data.requestingWarehouseId ||
    user?.assignedWarehouseId ||
    '10000000-0000-0000-0000-000000000002'; // default Bazan container

  const cleanUrgency = (['NORMAL', 'URGENT', 'CRITICAL'].includes(data.urgency?.toUpperCase())
    ? data.urgency.toUpperCase()
    : 'NORMAL') as 'NORMAL' | 'URGENT' | 'CRITICAL';

  const requestedBy = user?.fullName || 'מחסנאי אתר';
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: SiteToolRequestRecord = {
    id: requestId,
    organization_id: orgId,
    requesting_warehouse_id: cleanWarehouseId,
    tool_description: toolDesc,
    quantity: Math.max(1, data.quantity || 1),
    urgency: cleanUrgency,
    reason: data.reason?.trim() || null,
    status: 'PENDING',
    assigned_asset_id: null,
    source_warehouse_id: null,
    rejection_reason: null,
    requested_by: requestedBy,
    requested_by_user_id: user?.id || null,
    decided_by: null,
    decided_at: null,
    received_at: null,
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabaseAdmin.from('site_tool_requests').insert(record);
      if (error) {
        console.warn('[createSiteToolRequestAction] Supabase insert warning:', error);
      }
    } catch (err) {
      console.warn('[createSiteToolRequestAction] Supabase error:', err);
    }
  }

  // Always store in memory for reliability
  inMemorySiteToolRequests.unshift(record);

  return {
    success: true,
    requestId,
    message: 'בקשת הציוד נשלחה בהצלחה לאחראי תפעול ראשי!',
  };
}

/**
 * 2. getSiteStorekeeperDashboardAction
 * Returns site inventory, incoming in-transit shipments, and recent requests for a specific warehouse.
 */
export async function getSiteStorekeeperDashboardAction(
  warehouseId: string
): Promise<SiteStorekeeperDashboardData> {
  const orgId = await resolveActiveOrg();

  let dbSiteInventory: Array<{
    id: string;
    name: string;
    brand: string;
    model: string | null;
    qrCode: string;
    tagNumber: string | null;
    status: string;
    serialNumber: string | null;
  }> = [];

  // 1. Fetch site inventory
  if (isSupabaseConfigured() && warehouseId && warehouseId !== 'all') {
    try {
      const { data, error } = await supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, status, serial_number, tool_models(name, brand, model_number)')
        .eq('organization_id', orgId)
        .eq('current_warehouse_id', warehouseId)
        .neq('status', 'in_transit')
        .order('name');

      if (!error && data) {
        dbSiteInventory = data.map((a: Record<string, unknown>) => {
          const tm = (a.tool_models as Record<string, unknown>) || {};
          return {
            id: a.id as string,
            name: (a.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (a.brand as string) || (tm.brand as string) || 'Standard',
            model: (a.model_number as string) || (tm.model_number as string) || null,
            qrCode: (a.qr_code as string) || '',
            tagNumber: (a.tag_number as string) || null,
            status: (a.status as string) || 'available',
            serialNumber: (a.serial_number as string) || null,
          };
        });
      }
    } catch (err) {
      console.warn('[getSiteStorekeeperDashboardAction] Inventory query error:', err);
    }
  }

  // Fallback inventory from mock store if DB empty
  if (dbSiteInventory.length === 0) {
    const mockAssets = getMockAssets().filter((a) => {
      const matchesOrg = !a.organizationId || a.organizationId === orgId;
      const matchesWh =
        warehouseId === 'all' ||
        a.currentWarehouseId === warehouseId ||
        a.warehouseId === warehouseId;
      return matchesOrg && matchesWh && a.status !== 'in_transit';
    });

    dbSiteInventory = mockAssets.map((a) => ({
      id: a.id,
      name: a.toolName || 'כלי עבודה',
      brand: a.brand || 'Standard',
      model: a.modelNumber || null,
      qrCode: a.qrCode || '',
      tagNumber: a.tagNumber || null,
      status: a.status || 'available',
      serialNumber: a.serialNumber || null,
    }));
  }

  // 2. Fetch requests from Supabase
  let dbRequests: SiteToolRequestRecord[] = [];
  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
        .from('site_tool_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (warehouseId && warehouseId !== 'all') {
        query = query.eq('requesting_warehouse_id', warehouseId);
      }

      const { data, error } = await query;
      if (!error && data) {
        dbRequests = data as SiteToolRequestRecord[];
      }
    } catch (err) {
      console.warn('[getSiteStorekeeperDashboardAction] Requests query error:', err);
    }
  }

  // Merge with memory
  const memRequests = inMemorySiteToolRequests.filter((r) => {
    const matchesOrg = r.organization_id === orgId;
    const matchesWh = warehouseId === 'all' || r.requesting_warehouse_id === warehouseId;
    return matchesOrg && matchesWh;
  });

  const mergedRequestsMap = new Map<string, SiteToolRequestRecord>();
  dbRequests.forEach((r) => mergedRequestsMap.set(r.id, r));
  memRequests.forEach((r) => {
    if (!mergedRequestsMap.has(r.id)) mergedRequestsMap.set(r.id, r);
  });

  const allRequests = Array.from(mergedRequestsMap.values());

  // Join warehouse & asset names
  const mockWhs = getMockWarehouses(true, orgId);
  const whMap = new Map<string, string>();
  mockWhs.forEach((w) => whMap.set(w.id, w.name));

  const allMockAssets = getMockAssets();
  const assetMap = new Map<string, {
    name: string;
    brand: string;
    model: string | null;
    qrCode: string;
    tagNumber: string | null;
    serialNumber: string | null;
  }>();
  allMockAssets.forEach((a) => {
    assetMap.set(a.id, {
      name: a.toolName || 'כלי עבודה',
      brand: a.brand || 'Standard',
      model: a.modelNumber || null,
      qrCode: a.qrCode || '',
      tagNumber: a.tagNumber || null,
      serialNumber: a.serialNumber || null,
    });
  });

  const formattedItems: SiteToolRequestItem[] = allRequests.map((r) => {
    const assetMeta = r.assigned_asset_id ? assetMap.get(r.assigned_asset_id) : null;
    return {
      id: r.id,
      organizationId: r.organization_id,
      requestingWarehouseId: r.requesting_warehouse_id,
      requestingWarehouseName: whMap.get(r.requesting_warehouse_id) || r.requesting_warehouse_id,
      toolDescription: r.tool_description,
      quantity: r.quantity,
      urgency: r.urgency,
      reason: r.reason,
      status: r.status,
      assignedAssetId: r.assigned_asset_id,
      assignedAssetName: assetMeta?.name,
      assignedAssetQr: assetMeta?.qrCode,
      assignedAssetTag: assetMeta?.tagNumber,
      assignedAssetBrand: assetMeta?.brand,
      assignedAssetModel: assetMeta?.model,
      assignedAssetSerial: assetMeta?.serialNumber,
      sourceWarehouseId: r.source_warehouse_id,
      sourceWarehouseName: r.source_warehouse_id ? (whMap.get(r.source_warehouse_id) || r.source_warehouse_id) : null,
      rejectionReason: r.rejection_reason,
      requestedBy: r.requested_by,
      requestedByUserId: r.requested_by_user_id,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      receivedAt: r.received_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  const incomingShipments = formattedItems.filter((r) => r.status === 'IN_TRANSIT');
  const myRequests = formattedItems.slice(0, 30);

  return {
    siteInventory: dbSiteInventory,
    incomingShipments,
    myRequests,
  };
}

/**
 * 3. getChiefStorekeeperInboxAction
 * Returns pending tool requests across all site containers and suggested available assets to fulfill them.
 */
export async function getChiefStorekeeperInboxAction(): Promise<{
  pendingRequests: SiteToolRequestItem[];
  availableAssets: SuggestedToolAsset[];
}> {
  const orgId = await resolveActiveOrg();

  let dbRequests: SiteToolRequestRecord[] = [];
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('site_tool_requests')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (!error && data) {
        dbRequests = data as SiteToolRequestRecord[];
      }
    } catch (err) {
      console.warn('[getChiefStorekeeperInboxAction] Requests query error:', err);
    }
  }

  // Merge with in-memory pending
  const memRequests = inMemorySiteToolRequests.filter(
    (r) => r.organization_id === orgId && r.status === 'PENDING'
  );

  const mergedMap = new Map<string, SiteToolRequestRecord>();
  dbRequests.forEach((r) => mergedMap.set(r.id, r));
  memRequests.forEach((r) => {
    if (!mergedMap.has(r.id)) mergedMap.set(r.id, r);
  });

  const pendingList = Array.from(mergedMap.values());

  // Fetch warehouses for names
  const mockWhs = getMockWarehouses(true, orgId);
  const whMap = new Map<string, string>();
  mockWhs.forEach((w) => whMap.set(w.id, w.name));

  const pendingRequests: SiteToolRequestItem[] = pendingList.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    requestingWarehouseId: r.requesting_warehouse_id,
    requestingWarehouseName: whMap.get(r.requesting_warehouse_id) || r.requesting_warehouse_id,
    toolDescription: r.tool_description,
    quantity: r.quantity,
    urgency: r.urgency,
    reason: r.reason,
    status: r.status,
    assignedAssetId: r.assigned_asset_id,
    sourceWarehouseId: r.source_warehouse_id,
    rejectionReason: r.rejection_reason,
    requestedBy: r.requested_by,
    requestedByUserId: r.requested_by_user_id,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    receivedAt: r.received_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  // Fetch available assets across all facilities
  const availableAssets: SuggestedToolAsset[] = [];
  if (isSupabaseConfigured()) {
    try {
      const { data: dbAssets } = await supabaseAdmin
        .from('assets')
        .select('id, name, brand, model_number, qr_code, tag_number, serial_number, current_warehouse_id, status, tool_models(name, brand, model_number), warehouses(name)')
        .eq('organization_id', orgId)
        .neq('status', 'in_transit')
        .limit(250);

      if (dbAssets) {
        dbAssets.forEach((a: Record<string, unknown>) => {
          const tm = (a.tool_models as Record<string, unknown>) || {};
          const wh = (a.warehouses as Record<string, unknown>) || {};
          const whId = (a.current_warehouse_id as string) || '';
          availableAssets.push({
            id: a.id as string,
            name: (a.name as string) || (tm.name as string) || 'כלי עבודה',
            brand: (a.brand as string) || (tm.brand as string) || 'Standard',
            modelNumber: (a.model_number as string) || (tm.model_number as string) || null,
            qrCode: (a.qr_code as string) || '',
            tagNumber: (a.tag_number as string) || null,
            serialNumber: (a.serial_number as string) || null,
            currentWarehouseId: whId,
            currentWarehouseName: (wh.name as string) || whMap.get(whId) || 'מחסן',
          });
        });
      }
    } catch (err) {
      console.warn('[getChiefStorekeeperInboxAction] Asset suggestions error:', err);
    }
  }

  // Fallback available assets
  if (availableAssets.length === 0) {
    const mockAssets = getMockAssets().filter(
      (a) => (!a.organizationId || a.organizationId === orgId) && a.status !== 'in_transit'
    );
    mockAssets.forEach((a) => {
      const whId = a.currentWarehouseId || a.warehouseId || '';
      availableAssets.push({
        id: a.id,
        name: a.toolName || 'כלי עבודה',
        brand: a.brand || 'Standard',
        modelNumber: a.modelNumber || null,
        qrCode: a.qrCode || '',
        tagNumber: a.tagNumber || null,
        serialNumber: a.serialNumber || null,
        currentWarehouseId: whId,
        currentWarehouseName: whMap.get(whId) || a.warehouseName || 'מחסן',
      });
    });
  }

  return {
    pendingRequests,
    availableAssets,
  };
}

/**
 * 4. resolveToolRequestAction
 * Chief Storekeeper / Operations Manager approves (dispatch) or rejects a site tool requisition.
 */
export async function resolveToolRequestAction(data: {
  requestId: string;
  decision: 'APPROVE' | 'REJECT';
  sourceWarehouseId?: string;
  assignedAssetId?: string;
  rejectionReason?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  const managerUser = await getServerSessionUser();
  const decidedBy = managerUser?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  let targetRecord: SiteToolRequestRecord | null = null;

  if (isSupabaseConfigured()) {
    try {
      const { data: dbData } = await supabaseAdmin
        .from('site_tool_requests')
        .select('*')
        .eq('id', data.requestId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (dbData) targetRecord = dbData as SiteToolRequestRecord;
    } catch (err) {
      console.warn('[resolveToolRequestAction] Fetch error:', err);
    }
  }

  if (!targetRecord) {
    targetRecord = inMemorySiteToolRequests.find(
      (r) => r.id === data.requestId && r.organization_id === orgId
    ) || null;
  }

  if (!targetRecord) {
    return { success: false, error: 'דרישת הציוד לא נמצאה במערכת' };
  }

  if (data.decision === 'APPROVE') {
    if (!data.assignedAssetId) {
      return { success: false, error: 'יש לבחור כלי עבודה זמין לשינוע לאתר' };
    }

    const sourceWh = data.sourceWarehouseId || 'wh-central';

    // 1. Update asset status to 'in_transit'
    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin
          .from('assets')
          .update({
            status: 'in_transit',
            updated_at: now,
          })
          .eq('id', data.assignedAssetId)
          .eq('organization_id', orgId);

        // 2. Log in custody ledger
        await supabaseAdmin.from('custody_ledger').insert({
          asset_id: data.assignedAssetId,
          action: 'TRANSFER_INIT',
          performed_by: decidedBy,
          organization_id: orgId,
          notes: `אושרה בקשת ציוד לאתר ${targetRecord.requesting_warehouse_id} (${data.requestId})`,
          created_at: now,
        });
      } catch (err) {
        console.warn('[resolveToolRequestAction] Supabase error during approval:', err);
      }
    }

    // In-memory update
    mutateMockAsset(
      data.assignedAssetId,
      { status: 'in_transit' },
      {
        action: 'TRANSFER_INIT',
        performedBy: decidedBy,
        notes: `אושר שינוע ציוד לאתר`,
      }
    );

    // Update request
    const updateFields = {
      status: 'IN_TRANSIT' as const,
      assigned_asset_id: data.assignedAssetId,
      source_warehouse_id: sourceWh,
      decided_by: decidedBy,
      decided_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin
          .from('site_tool_requests')
          .update(updateFields)
          .eq('id', data.requestId)
          .eq('organization_id', orgId);
      } catch (err) {
        console.warn('[resolveToolRequestAction] Supabase request update error:', err);
      }
    }

    Object.assign(targetRecord, updateFields);

    return {
      success: true,
      message: 'הבקשה אושרה בהצלחה והכלי בדרכו לאתר (במשלוח / In-Transit)',
    };
  } else {
    // REJECT
    const rejectionReason = data.rejectionReason?.trim() || 'נדחה ע"י אחראי תפעול';
    const updateFields = {
      status: 'REJECTED' as const,
      rejection_reason: rejectionReason,
      decided_by: decidedBy,
      decided_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin
          .from('site_tool_requests')
          .update(updateFields)
          .eq('id', data.requestId)
          .eq('organization_id', orgId);
      } catch (err) {
        console.warn('[resolveToolRequestAction] Supabase request reject error:', err);
      }
    }

    Object.assign(targetRecord, updateFields);

    return {
      success: true,
      message: 'הבקשה נדחתה',
    };
  }
}

/**
 * 5. confirmToolReceptionAction
 * Site Storekeeper confirms delivery and receives the tool at their job site container.
 */
export async function confirmToolReceptionAction(
  requestId: string,
  assetId: string,
  targetWarehouseId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  const user = await getServerSessionUser();
  const receivedBy = user?.fullName || 'מחסנאי אתר';
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      // 1. Mark request COMPLETED
      await supabaseAdmin
        .from('site_tool_requests')
        .update({
          status: 'COMPLETED',
          received_at: now,
          updated_at: now,
        })
        .eq('id', requestId)
        .eq('organization_id', orgId);

      // 2. Set asset status available & assign to site warehouse
      await supabaseAdmin
        .from('assets')
        .update({
          status: 'available',
          current_warehouse_id: targetWarehouseId,
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      // 3. Log TRANSFER_RECEIVE in custody ledger
      await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'TRANSFER_RECEIVE',
        performed_by: receivedBy,
        organization_id: orgId,
        notes: `נקלט בהצלחה באתר היעד (${targetWarehouseId})`,
        created_at: now,
      });
    } catch (err) {
      console.warn('[confirmToolReceptionAction] Supabase error:', err);
    }
  }

  // Update in-memory record
  const memReq = inMemorySiteToolRequests.find((r) => r.id === requestId);
  if (memReq) {
    memReq.status = 'COMPLETED';
    memReq.received_at = now;
    memReq.updated_at = now;
  }

  // Update in-memory asset
  mutateMockAsset(
    assetId,
    {
      status: 'available',
      currentWarehouseId: targetWarehouseId,
      warehouseId: targetWarehouseId,
    },
    {
      action: 'TRANSFER_RECEIVE',
      performedBy: receivedBy,
      notes: `נקלט בהצלחה במחסן האתר`,
    }
  );

  return {
    success: true,
    message: 'כלי העבודה נקלט בהצלחה במחסן האתר וזמין כעת לשימוש!',
  };
}
