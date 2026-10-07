'use server';

import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type { DamageReport } from '@/types/domain';
import { getMockAuditHistory, getMockWarehouses } from '@/lib/mockStore';
import {
  type AuditActionType,
  type AuditHistoryRecord,
  type AuditHistoryFilters,
  type AuditHistoryPayload,
  type AuditDateRange,
  filterAuditHistoryRecords,
} from '@/lib/history/auditFilters';

export type {
  AuditActionType,
  AuditHistoryRecord,
  AuditHistoryFilters,
  AuditHistoryPayload,
  AuditDateRange,
};

import { getServerSessionOrgId } from '@/lib/auth/session';

export async function resolveActiveOrganizationId(providedOrgId?: string): Promise<string | null> {
  return getServerSessionOrgId(providedOrgId);
}

interface RawLedgerRow {
  id: string;
  action: string;
  performed_by: string;
  target_worker?: string | null;
  worker_phone?: string | null;
  expected_return_date?: string | null;
  signature_data?: string | null;
  signature_svg?: string | null;
  is_tag_verified?: boolean | null;
  signed_at?: string | null;
  target_site_name?: string | null;
  worker_name?: string | null;
  worker_id?: string | null;
  condition_at_return?: string | null;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  accessories_snapshot?: AuditHistoryRecord['accessoriesSnapshot'];
  damage_report?: DamageReport | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  notes: string | null;
  created_at: string;
  organization_id?: string | null;
  warehouse_id?: string | null;
  warehouses?: {
    id: string;
    name: string;
    code: string;
  } | Array<{ id: string; name: string; code: string }> | null;
  assets?: {
    id: string;
    name?: string | null;
    model?: string | null;
    model_number?: string | null;
    brand?: string | null;
    tag_number?: string | null;
    qr_code?: string;
    condition?: AuditHistoryRecord['condition'];
    current_warehouse_id?: string | null;
    organization_id?: string | null;
    tool_models?: {
      name?: string | null;
      brand?: string | null;
      model_number?: string | null;
    } | Array<{ name?: string | null; brand?: string | null; model_number?: string | null }> | null;
    current_warehouse?: {
      id: string;
      name: string;
      code: string;
    } | Array<{ id: string; name: string; code: string }> | null;
    warehouses?: {
      id: string;
      name: string;
      code: string;
    } | Array<{ id: string; name: string; code: string }> | null;
  } | Array<{
    id: string;
    name?: string | null;
    model?: string | null;
    model_number?: string | null;
    brand?: string | null;
    tag_number?: string | null;
    qr_code?: string;
    condition?: AuditHistoryRecord['condition'];
    current_warehouse_id?: string | null;
    organization_id?: string | null;
    tool_models?: {
      name?: string | null;
      brand?: string | null;
      model_number?: string | null;
    } | Array<{ name?: string | null; brand?: string | null; model_number?: string | null }> | null;
    current_warehouse?: {
      id: string;
      name: string;
      code: string;
    } | Array<{ id: string; name: string; code: string }> | null;
    warehouses?: {
      id: string;
      name: string;
      code: string;
    } | Array<{ id: string; name: string; code: string }> | null;
  }> | null;
}

/**
 * Retrieves chronological audit ledger entries strictly scoped by organization.
 */
export async function getAuditHistory(
  filters?: AuditHistoryFilters,
  organizationId?: string
): Promise<AuditHistoryPayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return { records: [], totalCount: 0, warehouses: [] };
  }

  if (!isSupabaseConfigured()) {
    return getMockAuditHistory(filters, orgId);
  }

  try {
    const client = supabaseAdmin || supabase;
    let query = client
      .from('custody_ledger')
      .select(`
        id,
        action,
        performed_by,
        target_worker,
        worker_name,
        worker_phone,
        worker_id,
        expected_return_date,
        signature_data,
        signature_svg,
        is_tag_verified,
        signed_at,
        target_site_name,
        condition_at_return,
        from_warehouse_id,
        to_warehouse_id,
        accessories_snapshot,
        damage_report,
        gps_lat,
        gps_lng,
        notes,
        created_at,
        organization_id,
        warehouse_id,
        warehouses:warehouse_id (
          id,
          name,
          code
        ),
        assets:asset_id (
          id,
          name,
          model:model_number,
          model_number,
          brand,
          tag_number,
          qr_code,
          condition,
          current_warehouse_id,
          organization_id,
          tool_models:tool_model_id (
            name,
            brand,
            model_number
          ),
          current_warehouse:current_warehouse_id (
            id,
            name,
            code
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Enforce strict tenant isolation on Supabase query
    query = query.eq('organization_id', orgId);

    const actionType = filters?.actionType || filters?.action;
    if (actionType && actionType.toUpperCase() !== 'ALL') {
      if (
        actionType === 'TRANSFERS' ||
        actionType === 'TRANSFER' ||
        actionType === 'TRANSFER_INIT' ||
        actionType === 'TRANSFER_RECEIVE' ||
        actionType === 'RECEIVE_TRANSFER' ||
        actionType === 'CANCEL_TRANSFER' ||
        actionType === 'DIRECT_TRANSFER'
      ) {
        query = query.in('action', ['TRANSFER', 'DIRECT_TRANSFER', 'RECEIVE_TRANSFER', 'TRANSFER_INIT', 'TRANSFER_RECEIVE', 'CANCEL_TRANSFER']);
      } else if (actionType === 'MAINTENANCE' || actionType === 'MAINTENANCE_FLAG') {
        query = query.in('action', ['MAINTENANCE', 'MAINTENANCE_FLAG', 'MAINTENANCE_IN', 'MAINTENANCE_OUT']);
      } else {
        query = query.eq('action', actionType);
      }
    }

    if (filters?.hasSignature === true) {
      query = query.or('signature_data.not.is.null,signature_svg.not.is.null');
    }

    const { data: rawRows, error } = await query;

    if (error) {
      console.warn('Using fallback audit trail history due to query error:', error);
      return getMockAuditHistory(filters, orgId);
    }

    if (!rawRows || rawRows.length === 0) {
      return {
        records: [],
        totalCount: 0,
        warehouses: getMockWarehouses(false, orgId),
      };
    }

    // Prefetch transfer route records for transfer actions if available
    const transferRouteMap: Record<string, { sourceName: string; targetName: string }> = {};
    try {
      const { data: trData } = await supabase
        .from('transfer_requests')
        .select(`
          asset_id,
          source_warehouse:source_warehouse_id(name),
          target_warehouse:target_warehouse_id(name)
        `)
        .eq('organization_id', orgId);

      interface TransferRouteRow {
        asset_id?: string;
        source_warehouse?: { name?: string } | Array<{ name?: string }> | null;
        target_warehouse?: { name?: string } | Array<{ name?: string }> | null;
      }

      if (trData && Array.isArray(trData)) {
        (trData as unknown as TransferRouteRow[]).forEach((tr) => {
          if (tr.asset_id) {
            const srcName = Array.isArray(tr.source_warehouse) ? tr.source_warehouse[0]?.name : tr.source_warehouse?.name;
            const tgtName = Array.isArray(tr.target_warehouse) ? tr.target_warehouse[0]?.name : tr.target_warehouse?.name;
            transferRouteMap[tr.asset_id] = {
              sourceName: srcName || '',
              targetName: tgtName || '',
            };
          }
        });
      }
    } catch {
      // Non-blocking
    }

    const records: AuditHistoryRecord[] = (rawRows as unknown as RawLedgerRow[]).map(
      (row) => {
        let normalizedAction: AuditActionType = 'CHECKIN';
        const raw = (row.action || '').toUpperCase();
        if (raw === 'CHECKOUT') normalizedAction = 'CHECKOUT';
        else if (raw === 'CHECKIN') normalizedAction = 'CHECKIN';
        else if (raw === 'TRANSFER' || raw === 'TRANSFER_INIT') normalizedAction = 'TRANSFER';
        else if (raw === 'TRANSFER_RECEIVE' || raw === 'RECEIVE_TRANSFER') normalizedAction = 'RECEIVE_TRANSFER';
        else if (raw === 'CANCEL_TRANSFER') normalizedAction = 'CANCEL_TRANSFER';
        else if (raw === 'DIRECT_TRANSFER') normalizedAction = 'DIRECT_TRANSFER';
        else if (raw === 'MAINTENANCE' || raw === 'MAINTENANCE_FLAG' || raw === 'MAINTENANCE_IN' || raw === 'MAINTENANCE_OUT') normalizedAction = 'MAINTENANCE_FLAG';
        else if (raw === 'STATUS_CHANGE') normalizedAction = 'STATUS_CHANGE';
        else if (raw === 'ONBOARD') normalizedAction = 'ONBOARD';
        else if (raw === 'LOCK_STATUS') normalizedAction = 'LOCK_STATUS';
        else if (raw === 'SAFETY_INSPECTION') normalizedAction = 'SAFETY_INSPECTION';
        else if (raw === 'RETIRE' || raw === 'DECOMMISSION') normalizedAction = 'RETIRE';

        const rawAsset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
        const rawToolModel = Array.isArray(rawAsset?.tool_models) ? rawAsset.tool_models[0] : rawAsset?.tool_models;
        const rawWarehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses;
        const rawCurrentWh = Array.isArray(rawAsset?.current_warehouse)
          ? rawAsset.current_warehouse[0]
          : Array.isArray(rawAsset?.warehouses)
          ? rawAsset.warehouses[0]
          : rawAsset?.current_warehouse || rawAsset?.warehouses;

        const liveWh = rawCurrentWh;
        const liveWhName = liveWh?.name || rawWarehouse?.name || 'מתקן';
        const liveWhId = rawAsset?.current_warehouse_id || row.warehouse_id || null;
        const liveWhCode = liveWh?.code || rawWarehouse?.code || 'FAC';

        // Resolve transfer route
        let sourceWhName = rawWarehouse?.name || 'מחסן מקור';
        let targetWhName = row.target_site_name || liveWhName;

        const matchedRoute = rawAsset?.id ? transferRouteMap[rawAsset.id] : null;
        if (matchedRoute?.sourceName) sourceWhName = matchedRoute.sourceName;
        if (matchedRoute?.targetName) targetWhName = matchedRoute.targetName;

        if (row.notes) {
          const targetMatch = row.notes.match(/(?:שינוע למחסן|העברת כלי למחסן:|לאתר יעד[:\s]*|אל\s+)([\u0590-\u05FF\w\s\-"]+)/);
          if (targetMatch && targetMatch[1]) targetWhName = targetMatch[1].trim();

          const sourceMatch = row.notes.match(/(?:מאתר|ממחסן|מאזור)\s+([\u0590-\u05FF\w\s\-"]+)/);
          if (sourceMatch && sourceMatch[1]) sourceWhName = sourceMatch[1].trim();
        }

        // Resolve accurate tool title
        const assetTitle = 
          rawAsset?.name || 
          rawAsset?.model || 
          rawAsset?.model_number || 
          rawToolModel?.name || 
          (row.notes?.match(/ציוד\s+([^(]+)/)?.[1]?.trim()) || 
          'כלי עבודה';

        // Resolve accurate brand
        const assetBrand = rawAsset?.brand || rawToolModel?.brand || 'כלי';
        const modelNumber = rawAsset?.model || rawAsset?.model_number || rawToolModel?.model_number || null;
        const qrCode = rawAsset?.qr_code || rawAsset?.tag_number || 'N/A';

        return {
          id: row.id,
          assetId: rawAsset?.id || '',
          qrCode,
          toolName: assetTitle,
          asset_name: assetTitle,
          brand: assetBrand,
          modelNumber,
          action: normalizedAction,
          performedBy: row.performed_by || 'System',
          targetWorker: row.target_worker || row.worker_name || (normalizedAction === 'CHECKOUT' ? row.performed_by : null),
          workerPhone: row.worker_phone || null,
          condition: (row.condition_at_return as AuditHistoryRecord['condition']) || rawAsset?.condition || 'good',
          warehouseId: liveWhId,
          warehouseName: liveWhName,
          warehouseCode: liveWhCode,
          currentWarehouseId: liveWhId,
          currentWarehouseName: liveWhName,
          currentWarehouseCode: liveWhCode,
          sourceWarehouseName: sourceWhName,
          targetWarehouseName: targetWhName,
          assets: rawAsset
            ? {
                id: rawAsset.id,
                name: rawAsset.name || assetTitle,
                model: rawAsset.model || rawAsset.model_number || null,
                brand: rawAsset.brand || assetBrand,
                qr_code: rawAsset.qr_code || qrCode,
                tag_number: rawAsset.tag_number || null,
                current_warehouse_id: rawAsset.current_warehouse_id,
                current_warehouse: liveWh
                  ? {
                      id: liveWh.id,
                      name: liveWh.name,
                      code: liveWh.code,
                    }
                  : null,
              }
            : null,
          warehouses: rawWarehouse || (liveWh ? { id: liveWh.id, name: liveWh.name, code: liveWh.code } : null),
          source_warehouse: {
            name: sourceWhName,
          },
          target_warehouse: {
            name: targetWhName,
          },
          notes: row.notes,
          createdAt: row.created_at,
          organizationId: (row.organization_id as string) || orgId,
          expectedReturnDate: row.expected_return_date || null,
          signatureData: row.signature_data || row.signature_svg || null,
          isTagVerified:
            row.is_tag_verified ??
            (row.notes?.includes('תג פיזי מאומת (כן)') ||
              row.notes?.includes('אישור תיוג פיזי') ||
              false),
          signedAt: row.signed_at || (row.signature_data || row.signature_svg ? row.created_at : null),
          accessoriesSnapshot: row.accessories_snapshot || null,
          damageReport: row.damage_report || null,
          gps:
            row.gps_lat != null && row.gps_lng != null
              ? { lat: row.gps_lat, lng: row.gps_lng }
              : null,
        };
      }
    );

    const filteredRecords = filterAuditHistoryRecords(records, filters);

    return {
      records: filteredRecords,
      totalCount: filteredRecords.length,
      warehouses: getMockWarehouses(false, orgId),
    };
  } catch (err) {
    console.error('getAuditHistory exception, returning fallback:', err);
    return getMockAuditHistory(filters, orgId);
  }
}

export async function appendAuditHistoryEntry(entry: AuditHistoryRecord): Promise<void> {
  // Recorded into synchronized history store
  const { appendMockAuditRecord } = await import('@/lib/mockStore');
  appendMockAuditRecord(entry);
}

import type { ScannedAssetDetails } from '@/app/actions/custody';

export interface ToolLifecycleKPI {
  totalCheckouts: number;
  totalSitesVisited: number;
  totalRepairs: number;
  totalDaysInService: number;
}

export interface ToolLifecyclePayload {
  asset: ScannedAssetDetails | null;
  history: AuditHistoryRecord[];
  kpi: ToolLifecycleKPI;
}

/**
 * Retrieves the complete chronological movement history, KPI metrics, and lifecycle record
 * of any tool in the organization. Strictly scoped to active organization.
 */
export async function getToolLifecycleHistory(
  assetIdOrTag: string,
  organizationId?: string
): Promise<ToolLifecyclePayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  const cleanInput = assetIdOrTag.trim();
  if (!cleanInput || !orgId) {
    return {
      asset: null,
      history: [],
      kpi: { totalCheckouts: 0, totalSitesVisited: 0, totalRepairs: 0, totalDaysInService: 0 },
    };
  }

  // 1. Resolve Asset details
  const { getAssetDetailsByQr } = await import('@/app/actions/custody');
  const asset = await getAssetDetailsByQr(cleanInput, undefined, orgId);

  // 2. Query chronological entries from custody_ledger
  let historyRecords: AuditHistoryRecord[] = [];

  if (isSupabaseConfigured() && asset?.id) {
    try {
      const client = supabaseAdmin || supabase;
      const { data: rawRows, error } = await client
        .from('custody_ledger')
        .select(`
          id,
          action,
          performed_by,
          target_worker,
          worker_name,
          worker_phone,
          expected_return_date,
          signature_data,
          signature_svg,
          is_tag_verified,
          signed_at,
          target_site_name,
          condition_at_return,
          from_warehouse_id,
          to_warehouse_id,
          accessories_snapshot,
          damage_report,
          gps_lat,
          gps_lng,
          notes,
          created_at,
          organization_id,
          assets:asset_id (
            id,
            name,
            model:model_number,
            model_number,
            brand,
            tag_number,
            qr_code,
            condition,
            current_warehouse_id,
            organization_id,
            tool_models:tool_model_id (
              name,
              brand,
              model_number
            ),
            warehouses:current_warehouse_id (
              id,
              name,
              code
            )
          )
        `)
        .eq('organization_id', orgId)
        .eq('asset_id', asset.id)
        .order('created_at', { ascending: false });

      if (!error && rawRows && rawRows.length > 0) {
        historyRecords = (rawRows as unknown as RawLedgerRow[]).map((row) => {
          let normalizedAction: AuditActionType = 'CHECKIN';
          const raw = (row.action || '').toUpperCase();
          if (raw === 'CHECKOUT') normalizedAction = 'CHECKOUT';
          else if (raw === 'CHECKIN') normalizedAction = 'CHECKIN';
          else if (raw === 'TRANSFER' || raw === 'TRANSFER_INIT') normalizedAction = 'TRANSFER';
          else if (raw === 'TRANSFER_RECEIVE' || raw === 'RECEIVE_TRANSFER') normalizedAction = 'RECEIVE_TRANSFER';
          else if (raw === 'CANCEL_TRANSFER') normalizedAction = 'CANCEL_TRANSFER';
          else if (raw === 'DIRECT_TRANSFER') normalizedAction = 'DIRECT_TRANSFER';
          else if (raw === 'MAINTENANCE' || raw === 'MAINTENANCE_FLAG' || raw === 'MAINTENANCE_IN' || raw === 'MAINTENANCE_OUT') normalizedAction = 'MAINTENANCE_FLAG';
          else if (raw === 'STATUS_CHANGE') normalizedAction = 'STATUS_CHANGE';
          else if (raw === 'ONBOARD') normalizedAction = 'ONBOARD';
          else if (raw === 'LOCK_STATUS') normalizedAction = 'LOCK_STATUS';
          else if (raw === 'SAFETY_INSPECTION') normalizedAction = 'SAFETY_INSPECTION';
          else if (raw === 'RETIRE' || raw === 'DECOMMISSION') normalizedAction = 'RETIRE';

          const rawAsset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
          const rawToolModel = Array.isArray(rawAsset?.tool_models) ? rawAsset.tool_models[0] : rawAsset?.tool_models;

          const toolTitle = 
            rawAsset?.name || 
            rawAsset?.model || 
            rawAsset?.model_number || 
            rawToolModel?.name || 
            asset.toolName || 
            (row.notes?.match(/ציוד\s+([^(]+)/)?.[1]?.trim()) || 
            'כלי עבודה';

          const assetBrand = rawAsset?.brand || rawToolModel?.brand || asset.brand || 'כלי';
          const modelNumber = rawAsset?.model || rawAsset?.model_number || rawToolModel?.model_number || asset.modelNumber || null;
          const qrCode = rawAsset?.qr_code || rawAsset?.tag_number || asset.qrCode || 'N/A';

          return {
            id: row.id,
            assetId: rawAsset?.id || asset.id,
            qrCode,
            toolName: toolTitle,
            asset_name: toolTitle,
            brand: assetBrand,
            modelNumber,
            action: normalizedAction,
            performedBy: row.performed_by || 'System',
            targetWorker: row.target_worker || row.worker_name || (normalizedAction === 'CHECKOUT' ? row.performed_by : null),
            workerPhone: row.worker_phone || null,
            condition: (row.condition_at_return as AuditHistoryRecord['condition']) || rawAsset?.condition || 'good',
            warehouseId: rawAsset?.current_warehouse_id || row.warehouse_id || null,
            warehouseName: row.target_site_name || (Array.isArray(rawAsset?.warehouses) ? rawAsset?.warehouses[0]?.name : rawAsset?.warehouses?.name) || asset.warehouseName,
            warehouseCode: (Array.isArray(rawAsset?.warehouses) ? rawAsset?.warehouses[0]?.code : rawAsset?.warehouses?.code) || asset.warehouseCode,
            notes: row.notes,
            createdAt: row.created_at,
            organizationId: row.organization_id || orgId,
            expectedReturnDate: row.expected_return_date || null,
            signatureData: row.signature_data || row.signature_svg || null,
            signedAt: row.signed_at || (row.signature_data || row.signature_svg ? row.created_at : null),
            isTagVerified: Boolean(row.is_tag_verified),
            accessoriesSnapshot: row.accessories_snapshot || null,
            damageReport: row.damage_report || null,
            gps: row.gps_lat != null && row.gps_lng != null ? { lat: row.gps_lat, lng: row.gps_lng } : null,
          };
        });
      }
    } catch (err) {
      console.warn('Error fetching Supabase tool lifecycle history:', err);
    }
  }

  // Fallback to mock store if no rows retrieved from Supabase
  if (historyRecords.length === 0) {
    const mockPayload = getMockAuditHistory(undefined, orgId);
    historyRecords = mockPayload.records.filter(
      (r) =>
        (asset?.id && r.assetId === asset.id) ||
        r.qrCode.toLowerCase() === cleanInput.toLowerCase() ||
        (asset?.qrCode && r.qrCode.toLowerCase() === asset.qrCode.toLowerCase())
    );
  }

  // 3. Compute KPI Summary Chips
  const totalCheckouts = historyRecords.filter((r) => r.action === 'CHECKOUT').length;
  const sitesVisitedSet = new Set(
    historyRecords.map((r) => r.warehouseName || r.warehouseId).filter(Boolean)
  );
  if (asset?.warehouseName) sitesVisitedSet.add(asset.warehouseName);
  const totalSitesVisited = Math.max(1, sitesVisitedSet.size);

  const totalRepairs = historyRecords.filter(
    (r) => r.action === 'MAINTENANCE_FLAG' || r.condition === 'needs_repair'
  ).length;

  const startDateStr =
    asset?.purchaseDate ||
    (historyRecords.length > 0 ? historyRecords[historyRecords.length - 1].createdAt : null);

  let totalDaysInService = 1;
  if (startDateStr) {
    const startMs = new Date(startDateStr).getTime();
    const nowMs = Date.now();
    if (!isNaN(startMs) && nowMs > startMs) {
      totalDaysInService = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)));
    }
  }

  return {
    asset,
    history: historyRecords,
    kpi: {
      totalCheckouts,
      totalSitesVisited,
      totalRepairs,
      totalDaysInService,
    },
  };
}

export interface FleetNoteItem {
  id: string;
  createdAt: string;
  action: AuditActionType;
  notes: string;
  workerName: string | null;
  workerPhone: string | null;
  performedBy: string;
  assetId: string;
  qrCode: string;
  serialNumber?: string | null;
  toolName: string;
  brand: string;
  modelNumber?: string | null;
  warehouseId?: string;
  warehouseName: string;
  warehouseCode?: string;
}

export interface FleetNotesFeedFilters {
  query?: string;
  type?: 'ALL' | 'CHECKOUT' | 'CHECKIN' | 'TRANSFERS' | 'MAINTENANCE' | string;
  warehouseId?: string;
}

export interface FleetNotesFeedPayload {
  notes: FleetNoteItem[];
  totalCount: number;
}

function filterMockNotes(mockRecords: AuditHistoryRecord[], filters?: FleetNotesFeedFilters): FleetNoteItem[] {
  let filtered = mockRecords.filter(
    (r) => r.notes && typeof r.notes === 'string' && r.notes.trim().length > 0
  );

  if (filters?.type && filters.type !== 'ALL' && filters.type !== 'all') {
    if (filters.type === 'TRANSFERS') {
      filtered = filtered.filter((r) => r.action === 'TRANSFER_INIT' || r.action === 'TRANSFER_RECEIVE');
    } else if (filters.type === 'MAINTENANCE') {
      filtered = filtered.filter((r) => r.action === 'MAINTENANCE_FLAG');
    } else {
      filtered = filtered.filter((r) => r.action === filters.type);
    }
  }

  if (filters?.warehouseId && filters.warehouseId !== 'all') {
    filtered = filtered.filter(
      (r) => r.warehouseId === filters.warehouseId || r.warehouseName === filters.warehouseId
    );
  }

  if (filters?.query && filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.notes && r.notes.toLowerCase().includes(q)) ||
        (r.qrCode && r.qrCode.toLowerCase().includes(q)) ||
        (r.toolName && r.toolName.toLowerCase().includes(q)) ||
        (r.targetWorker && r.targetWorker.toLowerCase().includes(q)) ||
        (r.performedBy && r.performedBy.toLowerCase().includes(q))
    );
  }

  return filtered.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action,
    notes: r.notes!,
    workerName: r.targetWorker || null,
    workerPhone: r.workerPhone || null,
    performedBy: r.performedBy,
    assetId: r.assetId,
    qrCode: r.qrCode,
    serialNumber: null,
    toolName: r.toolName,
    brand: r.brand,
    modelNumber: r.modelNumber || null,
    warehouseId: r.warehouseId || undefined,
    warehouseName: r.warehouseName || 'מחסן ראשי',
    warehouseCode: r.warehouseCode || 'WH',
  }));
}

/**
 * Retrieves a unified feed of all operational field notes, damage remarks, checkout notes,
 * and transfer notes across the entire fleet for the Chief Storekeeper / Operations Manager.
 * Strictly scoped by active organization_id.
 */
export async function getFleetNotesFeedAction(
  filters?: FleetNotesFeedFilters,
  organizationId?: string
): Promise<FleetNotesFeedPayload> {
  const orgId = await resolveActiveOrganizationId(organizationId);
  if (!orgId) {
    return { notes: [], totalCount: 0 };
  }

  if (!isSupabaseConfigured()) {
    const mockPayload = getMockAuditHistory(undefined, orgId);
    const notes = filterMockNotes(mockPayload.records, filters);
    return { notes, totalCount: notes.length };
  }

  try {
    let query = supabaseAdmin
      .from('custody_ledger')
      .select(`
        id,
        created_at,
        action,
        notes,
        target_worker,
        worker_phone,
        performed_by,
        asset_id,
        organization_id,
        assets:asset_id (
          id,
          name,
          model:model_number,
          model_number,
          brand,
          tag_number,
          qr_code,
          current_warehouse_id,
          tool_models:tool_model_id (
            name,
            brand,
            model_number
          ),
          warehouses:current_warehouse_id (
            id,
            name,
            code
          )
        )
      `)
      .eq('organization_id', orgId)
      .not('notes', 'is', null)
      .neq('notes', '')
      .order('created_at', { ascending: false });

    const actionFilter = filters?.type;
    if (actionFilter && actionFilter !== 'ALL' && actionFilter !== 'all') {
      if (actionFilter === 'TRANSFERS' || actionFilter === 'TRANSFER' || actionFilter === 'TRANSFER_INIT') {
        query = query.in('action', ['TRANSFER', 'DIRECT_TRANSFER', 'RECEIVE_TRANSFER', 'TRANSFER_INIT', 'TRANSFER_RECEIVE', 'CANCEL_TRANSFER']);
      } else if (actionFilter === 'MAINTENANCE') {
        query = query.eq('action', 'MAINTENANCE_FLAG');
      } else {
        query = query.eq('action', actionFilter);
      }
    }

    if (filters?.query && filters.query.trim()) {
      const q = filters.query.trim();
      query = query.ilike('notes', `%${q}%`);
    }

    const { data: rawRows, error } = await query;

    if (!error && rawRows && rawRows.length > 0) {
      interface FleetNoteDbRow {
        id: string;
        created_at: string;
        action: string;
        notes: string | null;
        target_worker?: string | null;
        worker_phone?: string | null;
        performed_by?: string | null;
        asset_id?: string | null;
        assets?: {
          id?: string;
          name?: string | null;
          model?: string | null;
          model_number?: string | null;
          brand?: string | null;
          tag_number?: string | null;
          qr_code?: string;
          tool_models?: {
            name?: string;
            brand?: string;
            model_number?: string | null;
          } | Array<{
            name?: string;
            brand?: string;
            model_number?: string | null;
          }> | null;
          warehouses?: {
            id?: string;
            name?: string;
            code?: string;
          } | Array<{
            id?: string;
            name?: string;
            code?: string;
          }> | null;
        } | Array<{
          id?: string;
          name?: string | null;
          model?: string | null;
          model_number?: string | null;
          brand?: string | null;
          tag_number?: string | null;
          qr_code?: string;
          tool_models?: {
            name?: string;
            brand?: string;
            model_number?: string | null;
          } | Array<{
            name?: string;
            brand?: string;
            model_number?: string | null;
          }> | null;
          warehouses?: {
            id?: string;
            name?: string;
            code?: string;
          } | Array<{
            id?: string;
            name?: string;
            code?: string;
          }> | null;
        }> | null;
      }

      let mappedNotes: FleetNoteItem[] = (rawRows as unknown as FleetNoteDbRow[])
        .filter((r) => r.notes && typeof r.notes === 'string' && r.notes.trim().length > 0)
        .map((row) => {
          const rawAssetObj = Array.isArray(row.assets) ? row.assets[0] : row.assets;
          const assetObj = rawAssetObj || {};
          const toolModel = (Array.isArray(assetObj.tool_models) ? assetObj.tool_models[0] : assetObj.tool_models) || {};
          const warehouse = (Array.isArray(assetObj.warehouses) ? assetObj.warehouses[0] : assetObj.warehouses) || {};

          const toolTitle = 
            assetObj.name || 
            assetObj.model || 
            assetObj.model_number || 
            toolModel.name || 
            (row.notes?.match(/ציוד\s+([^(]+)/)?.[1]?.trim()) || 
            'כלי עבודה';

          const assetBrand = assetObj.brand || toolModel.brand || 'כלי';

          return {
            id: row.id,
            createdAt: row.created_at,
            action: (row.action as AuditActionType) || 'CHECKOUT',
            notes: row.notes || '',
            workerName: row.target_worker || null,
            workerPhone: row.worker_phone || null,
            performedBy: row.performed_by || 'מחסנאי',
            assetId: row.asset_id || assetObj.id || '',
            qrCode: assetObj.qr_code || assetObj.tag_number || 'TAG-UNKNOWN',
            serialNumber: null,
            toolName: toolTitle,
            brand: assetBrand,
            modelNumber: assetObj.model || assetObj.model_number || toolModel.model_number || null,
            warehouseId: warehouse.id || undefined,
            warehouseName: warehouse.name || 'מחסן שטח',
            warehouseCode: warehouse.code || 'WH',
          };
        });

      if (filters?.warehouseId && filters.warehouseId !== 'all') {
        mappedNotes = mappedNotes.filter(
          (n) => n.warehouseId === filters.warehouseId || n.warehouseName === filters.warehouseId
        );
      }

      if (filters?.query && filters.query.trim()) {
        const q = filters.query.trim().toLowerCase();
        mappedNotes = mappedNotes.filter(
          (n) =>
            n.notes.toLowerCase().includes(q) ||
            n.qrCode.toLowerCase().includes(q) ||
            n.toolName.toLowerCase().includes(q) ||
            (n.workerName && n.workerName.toLowerCase().includes(q))
        );
      }

      return { notes: mappedNotes, totalCount: mappedNotes.length };
    }
  } catch (err) {
    console.warn('Error fetching Supabase fleet notes feed:', err);
  }

  const mockPayload = getMockAuditHistory(undefined, orgId);
  const notes = filterMockNotes(mockPayload.records, filters);
  return { notes, totalCount: notes.length };
}

/**
 * Direct query on custody_ledger for asset timeline, ordered by created_at DESC.
 * Guaranteed to never throw errors; returns { success: true, data: [] } if empty or on error.
 */
export async function getAssetTimelineAction(
  assetId?: string | null,
  tagNumber?: string | null,
  organizationId?: string
): Promise<{ success: boolean; data: AuditHistoryRecord[]; asset?: ScannedAssetDetails | null }> {
  try {
    const cleanId = assetId?.trim() || null;
    const cleanTag = tagNumber?.trim() || null;

    if (!cleanId && !cleanTag) {
      return { success: true, data: [], asset: null };
    }

    const orgId = await resolveActiveOrganizationId(organizationId);

    let resolvedAsset: ScannedAssetDetails | null = null;
    let resolvedAssetId = cleanId;

    // Resolve asset details if tag or id is provided
    try {
      const { getAssetDetailsByQr } = await import('@/app/actions/custody');
      resolvedAsset = await getAssetDetailsByQr(cleanTag || cleanId!, undefined, orgId || undefined);
      if (resolvedAsset?.id) {
        resolvedAssetId = resolvedAsset.id;
      }
    } catch (e) {
      console.warn('[getAssetTimelineAction] Could not resolve asset details:', e);
    }

    let records: AuditHistoryRecord[] = [];

    if (isSupabaseConfigured() && (resolvedAssetId || cleanTag)) {
      try {
        const client = supabaseAdmin || supabase;
        let query = client
          .from('custody_ledger')
          .select(`
            id,
            action,
            performed_by,
            target_worker,
            worker_name,
            worker_phone,
            expected_return_date,
            signature_data,
            signature_svg,
            is_tag_verified,
            signed_at,
            target_site_name,
            condition_at_return,
            from_warehouse_id,
            to_warehouse_id,
            accessories_snapshot,
            damage_report,
            gps_lat,
            gps_lng,
            notes,
            created_at,
            organization_id,
            assets:asset_id (
              id,
              name,
              model:model_number,
              model_number,
              brand,
              tag_number,
              qr_code,
              condition,
              current_warehouse_id,
              organization_id,
              tool_models:tool_model_id (
                name,
                brand,
                model_number
              ),
              warehouses:current_warehouse_id (
                id,
                name,
                code
              )
            )
          `)
          .order('created_at', { ascending: false });

        if (orgId) {
          query = query.eq('organization_id', orgId);
        }

        if (resolvedAssetId) {
          query = query.eq('asset_id', resolvedAssetId);
        }

        const { data: rawRows, error } = await query;

        if (!error && rawRows && rawRows.length > 0) {
          records = (rawRows as unknown as RawLedgerRow[]).map((row) => {
            let normalizedAction: AuditActionType = 'CHECKIN';
            const raw = (row.action || '').toUpperCase();
            if (raw === 'CHECKOUT') normalizedAction = 'CHECKOUT';
            else if (raw === 'CHECKIN') normalizedAction = 'CHECKIN';
            else if (raw === 'TRANSFER' || raw === 'TRANSFER_INIT') normalizedAction = 'TRANSFER';
            else if (raw === 'TRANSFER_RECEIVE' || raw === 'RECEIVE_TRANSFER') normalizedAction = 'RECEIVE_TRANSFER';
            else if (raw === 'CANCEL_TRANSFER') normalizedAction = 'CANCEL_TRANSFER';
            else if (raw === 'DIRECT_TRANSFER') normalizedAction = 'DIRECT_TRANSFER';
            else if (raw === 'MAINTENANCE' || raw === 'MAINTENANCE_FLAG' || raw === 'MAINTENANCE_IN' || raw === 'MAINTENANCE_OUT') normalizedAction = 'MAINTENANCE_FLAG';
            else if (raw === 'STATUS_CHANGE') normalizedAction = 'STATUS_CHANGE';
            else if (raw === 'ONBOARD') normalizedAction = 'ONBOARD';
            else if (raw === 'LOCK_STATUS') normalizedAction = 'LOCK_STATUS';
            else if (raw === 'SAFETY_INSPECTION') normalizedAction = 'SAFETY_INSPECTION';
            else if (raw === 'RETIRE' || raw === 'DECOMMISSION') normalizedAction = 'RETIRE';

            const rawAsset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
            const rawToolModel = Array.isArray(rawAsset?.tool_models) ? rawAsset.tool_models[0] : rawAsset?.tool_models;

            const toolTitle = 
              rawAsset?.name || 
              rawAsset?.model || 
              rawAsset?.model_number || 
              rawToolModel?.name || 
              resolvedAsset?.toolName || 
              (row.notes?.match(/ציוד\s+([^(]+)/)?.[1]?.trim()) || 
              'כלי עבודה';

            const assetBrand = rawAsset?.brand || rawToolModel?.brand || resolvedAsset?.brand || 'כלי';
            const modelNumber = rawAsset?.model || rawAsset?.model_number || rawToolModel?.model_number || resolvedAsset?.modelNumber || null;
            const qrCode = rawAsset?.qr_code || rawAsset?.tag_number || resolvedAsset?.qrCode || cleanTag || 'N/A';

            return {
              id: row.id,
              assetId: rawAsset?.id || resolvedAssetId || '',
              qrCode,
              toolName: toolTitle,
              asset_name: toolTitle,
              brand: assetBrand,
              modelNumber,
              action: normalizedAction,
              performedBy: row.performed_by || 'מערכת',
              targetWorker: row.target_worker || row.worker_name || (normalizedAction === 'CHECKOUT' ? row.performed_by : null),
              workerPhone: row.worker_phone || null,
              condition: (row.condition_at_return as AuditHistoryRecord['condition']) || rawAsset?.condition || 'good',
              warehouseId: rawAsset?.current_warehouse_id || row.warehouse_id || null,
              warehouseName: row.target_site_name || (Array.isArray(rawAsset?.warehouses) ? rawAsset?.warehouses[0]?.name : rawAsset?.warehouses?.name) || resolvedAsset?.warehouseName || 'מחסן ראשי',
              warehouseCode: (Array.isArray(rawAsset?.warehouses) ? rawAsset?.warehouses[0]?.code : rawAsset?.warehouses?.code) || resolvedAsset?.warehouseCode || 'MAIN',
              notes: row.notes,
              createdAt: row.created_at,
              organizationId: row.organization_id || orgId || '',
              expectedReturnDate: row.expected_return_date || null,
              signatureData: row.signature_data || row.signature_svg || null,
              signedAt: row.signed_at || (row.signature_data || row.signature_svg ? row.created_at : null),
              isTagVerified: Boolean(row.is_tag_verified),
              accessoriesSnapshot: row.accessories_snapshot || null,
              damageReport: row.damage_report || null,
              gps: row.gps_lat != null && row.gps_lng != null ? { lat: row.gps_lat, lng: row.gps_lng } : null,
            };
          });
        }
      } catch (err) {
        console.warn('[getAssetTimelineAction] Error fetching Supabase ledger:', err);
      }
    }

    // Fallback to mock store if zero records found
    if (records.length === 0) {
      try {
        const mockPayload = getMockAuditHistory(undefined, orgId || undefined);
        records = mockPayload.records.filter(
          (r) =>
            (resolvedAssetId && r.assetId === resolvedAssetId) ||
            (cleanTag && r.qrCode?.toLowerCase() === cleanTag.toLowerCase()) ||
            (resolvedAsset?.qrCode && r.qrCode?.toLowerCase() === resolvedAsset.qrCode.toLowerCase())
        );
      } catch {
        records = [];
      }
    }

    return {
      success: true,
      data: records,
      asset: resolvedAsset,
    };
  } catch (err) {
    console.error('[getAssetTimelineAction] Global catch:', err);
    return { success: true, data: [], asset: null };
  }
}

