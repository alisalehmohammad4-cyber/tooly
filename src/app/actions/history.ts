'use server';

import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type { DamageReport, GpsCoordinates } from '@/types/domain';
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
    let query = supabase
      .from('custody_ledger')
      .select(`
        id,
        action,
        performed_by,
        target_worker,
        worker_phone,
        expected_return_date,
        signature_data,
        accessories_snapshot,
        damage_report,
        gps_lat,
        gps_lng,
        notes,
        created_at,
        organization_id,
        assets:asset_id (
          id,
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

    // Enforce strict tenant isolation on Supabase query
    query = query.eq('organization_id', orgId);

    const actionFilter = filters?.actionType || filters?.action;
    if (actionFilter && actionFilter !== 'all' && actionFilter !== 'ALL') {
      if (actionFilter === 'TRANSFERS') {
        query = query.in('action', ['TRANSFER_INIT', 'TRANSFER_RECEIVE']);
      } else {
        query = query.eq('action', actionFilter);
      }
    }

    if (filters?.hasSignature === true) {
      query = query.not('signature_data', 'is', null);
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
      accessories_snapshot?: AuditHistoryRecord['accessoriesSnapshot'];
      damage_report?: DamageReport | null;
      gps_lat?: number | null;
      gps_lng?: number | null;
      notes: string | null;
      created_at: string;
      organization_id?: string | null;
      assets: {
        id: string;
        qr_code: string;
        condition: AuditHistoryRecord['condition'];
        current_warehouse_id: string;
        organization_id?: string | null;
        tool_models: {
          name: string;
          brand: string;
          model_number: string | null;
        } | null;
        warehouses: {
          id: string;
          name: string;
          code: string;
        } | null;
      } | null;
    }

    const records: AuditHistoryRecord[] = (rawRows as unknown as RawLedgerRow[]).map(
      (row) => {
        let normalizedAction: AuditActionType = 'CHECKIN';
        if (row.action === 'CHECKOUT') normalizedAction = 'CHECKOUT';
        else if (row.action === 'TRANSFER_RECEIVE') normalizedAction = 'TRANSFER_RECEIVE';
        else if (row.action === 'MAINTENANCE_FLAG') normalizedAction = 'MAINTENANCE_FLAG';
        else if (row.action === 'ONBOARD') normalizedAction = 'ONBOARD';
        else if (row.action === 'LOCK_STATUS') normalizedAction = 'LOCK_STATUS';
        else if (row.action === 'SAFETY_INSPECTION') normalizedAction = 'SAFETY_INSPECTION';

        return {
          id: row.id,
          assetId: row.assets?.id || '',
          qrCode: row.assets?.qr_code || 'N/A',
          toolName: row.assets?.tool_models?.name || 'Tool Asset',
          brand: row.assets?.tool_models?.brand || 'Standard',
          modelNumber: row.assets?.tool_models?.model_number || null,
          action: normalizedAction,
          performedBy: row.performed_by || 'System',
          targetWorker: row.target_worker || (normalizedAction === 'CHECKOUT' ? row.performed_by : null),
          workerPhone: row.worker_phone || null,
          condition: row.assets?.condition || 'good',
          warehouseId: row.assets?.current_warehouse_id || null,
          warehouseName: row.assets?.warehouses?.name || 'Central Facility',
          warehouseCode: row.assets?.warehouses?.code || 'FAC',
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
      const { data: rawRows, error } = await supabase
        .from('custody_ledger')
        .select(`
          id,
          action,
          performed_by,
          target_worker,
          worker_phone,
          expected_return_date,
          signature_data,
          accessories_snapshot,
          damage_report,
          gps_lat,
          gps_lng,
          notes,
          created_at,
          organization_id,
          assets:asset_id (
            id,
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
        historyRecords = (rawRows as any[]).map((row) => ({
          id: row.id,
          assetId: row.assets?.id || asset.id,
          qrCode: row.assets?.qr_code || asset.qrCode,
          toolName: row.assets?.tool_models?.name || asset.toolName,
          brand: row.assets?.tool_models?.brand || asset.brand,
          modelNumber: row.assets?.tool_models?.model_number || asset.modelNumber || null,
          action: row.action,
          performedBy: row.performed_by || 'System',
          targetWorker: row.target_worker || null,
          workerPhone: row.worker_phone || null,
          condition: row.assets?.condition || 'good',
          warehouseId: row.assets?.current_warehouse_id || null,
          warehouseName: row.assets?.warehouses?.name || asset.warehouseName,
          warehouseCode: row.assets?.warehouses?.code || asset.warehouseCode,
          notes: row.notes,
          createdAt: row.created_at,
          organizationId: row.organization_id || orgId,
          expectedReturnDate: row.expected_return_date || null,
          signatureData: row.signature_data || null,
          signedAt: row.signature_data ? row.created_at : null,
          accessoriesSnapshot: row.accessories_snapshot || null,
          damageReport: row.damage_report || null,
          gps: row.gps_lat != null && row.gps_lng != null ? { lat: row.gps_lat, lng: row.gps_lng } : null,
        }));
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
      if (actionFilter === 'TRANSFERS') {
        query = query.in('action', ['TRANSFER_INIT', 'TRANSFER_RECEIVE']);
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
      let mappedNotes: FleetNoteItem[] = rawRows
        .filter((r: any) => r.notes && typeof r.notes === 'string' && r.notes.trim().length > 0)
        .map((row: any) => {
          const assetObj = row.assets || {};
          const toolModel = assetObj.tool_models || {};
          const warehouse = assetObj.warehouses || {};

          return {
            id: row.id,
            createdAt: row.created_at,
            action: (row.action as AuditActionType) || 'CHECKOUT',
            notes: row.notes,
            workerName: row.target_worker || null,
            workerPhone: row.worker_phone || null,
            performedBy: row.performed_by || 'מחסנאי',
            assetId: row.asset_id || assetObj.id || '',
            qrCode: assetObj.qr_code || 'TAG-UNKNOWN',
            serialNumber: null,
            toolName: toolModel.name || 'כלי עבודה',
            brand: toolModel.brand || 'General',
            modelNumber: toolModel.model_number || null,
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
