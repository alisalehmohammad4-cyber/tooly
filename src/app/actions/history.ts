'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type AuditActionType =
  | 'CHECKOUT'
  | 'CHECKIN'
  | 'TRANSFER_RECEIVE'
  | 'MAINTENANCE_FLAG'
  | 'ONBOARD';

export interface AuditHistoryRecord {
  id: string;
  assetId: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  action: AuditActionType;
  performedBy: string;
  targetWorker: string | null;
  workerPhone: string | null;
  condition: 'excellent' | 'good' | 'needs_repair' | 'retired' | null;
  warehouseId: string | null;
  warehouseName: string;
  warehouseCode: string;
  notes: string | null;
  createdAt: string;
}

export interface AuditHistoryFilters {
  action?: string;
  warehouseId?: string;
  searchQuery?: string;
}

export interface AuditHistoryPayload {
  records: AuditHistoryRecord[];
  totalCount: number;
  warehouses: Array<{ id: string; name: string; code: string }>;
}

const FALLBACK_WAREHOUSES = [
  { id: 'wh-main-01', name: 'Central Depot - Bay A', code: 'CDB-01' },
  { id: 'wh-site-02', name: 'Site Container Bravo', code: 'SCB-02' },
  { id: 'wh-van-03', name: 'Mobile Service Van 05', code: 'MSV-05' },
];

const FALLBACK_HISTORY_ENTRIES: AuditHistoryRecord[] = [
  {
    id: 'aud-101',
    assetId: 'ast-wld-02',
    qrCode: 'TOOL-WLD-002',
    toolName: 'Power MIG 210 MP Multi-Process',
    brand: 'Lincoln Electric',
    modelNumber: 'K3963-1',
    action: 'CHECKOUT',
    performedBy: 'Field Supervisor',
    targetWorker: 'Carlos Mendez',
    workerPhone: '+966 50 882 1940',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    notes: 'Dispatched for structural column welding at Sector 4.',
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(), // 25 mins ago
  },
  {
    id: 'aud-102',
    assetId: 'ast-lft-02',
    qrCode: 'TOOL-LFT-011',
    toolName: 'LB Lever Puller Hoist 1.5-Ton',
    brand: 'Harrington',
    modelNumber: 'LB015',
    action: 'CHECKOUT',
    performedBy: 'Lead Rigging Agent',
    targetWorker: 'Marcus Vance',
    workerPhone: '+966 55 319 4421',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    notes: 'Heavy pipe rack positioning crew checkout.',
    createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(), // 1 hr 15 mins ago
  },
  {
    id: 'aud-103',
    assetId: 'ast-wld-03',
    qrCode: 'TOOL-WLD-003',
    toolName: 'Rebel EMP 205ic Multi-Material System',
    brand: 'ESAB',
    modelNumber: '0558102553',
    action: 'MAINTENANCE_FLAG',
    performedBy: 'Inspection Specialist',
    targetWorker: null,
    workerPhone: null,
    condition: 'needs_repair',
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    notes: 'Wire feed motor stalling intermittently. Sent to technician queue.',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3 hours ago
  },
  {
    id: 'aud-104',
    assetId: 'ast-cut-02',
    qrCode: 'TOOL-CUT-021',
    toolName: '20V MAX Deep Cut Cordless Band Saw',
    brand: 'DeWalt',
    modelNumber: 'DCS374B',
    action: 'CHECKOUT',
    performedBy: 'Tool Crib Agent',
    targetWorker: 'Sami Al-Hassan',
    workerPhone: '+966 54 112 8790',
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    notes: 'HVAC ducting modification on offshore barge.',
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(), // 4 hours ago
  },
  {
    id: 'aud-105',
    assetId: 'ast-lft-03',
    qrCode: 'TOOL-LFT-012',
    toolName: 'Polyester Endless Rigging Sling 5-Ton',
    brand: 'Kito Rigging',
    modelNumber: 'EN-5000',
    action: 'TRANSFER_RECEIVE',
    performedBy: 'Logistics Driver',
    targetWorker: null,
    workerPhone: null,
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    notes: 'Transferred from Central Depot to restock field emergency van.',
    createdAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(), // 6 hours ago
  },
  {
    id: 'aud-106',
    assetId: 'ast-wld-01',
    qrCode: 'TOOL-WLD-001',
    toolName: 'Multimatic 220 AC/DC TIG/MIG Welder',
    brand: 'Miller',
    modelNumber: '907757',
    action: 'CHECKIN',
    performedBy: 'Depot Receiving Clerk',
    targetWorker: null,
    workerPhone: null,
    condition: 'excellent',
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    notes: 'Returned after boiler maintenance. Cleaned and calibrated.',
    createdAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(), // 8 hours ago
  },
  {
    id: 'aud-107',
    assetId: 'ast-drl-02',
    qrCode: 'TOOL-DRL-031',
    toolName: 'M18 FUEL 1/2" Hammer Drill/Driver',
    brand: 'Milwaukee',
    modelNumber: '2904-20',
    action: 'CHECKOUT',
    performedBy: 'Field Agent',
    targetWorker: 'Tariq Mansour',
    workerPhone: '+966 56 443 1180',
    condition: 'good',
    warehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    notes: 'Electrical conduit bracket anchoring.',
    createdAt: new Date(Date.now() - 1000 * 60 * 720).toISOString(), // 12 hours ago
  },
  {
    id: 'aud-108',
    assetId: 'ast-mea-02',
    qrCode: 'TOOL-MEA-041',
    toolName: '87V Industrial True-RMS Digital Multimeter',
    brand: 'Fluke',
    modelNumber: 'FLUKE-87-5',
    action: 'CHECKOUT',
    performedBy: 'Field Supervisor',
    targetWorker: 'Zaid Al-Najjar',
    workerPhone: '+966 50 994 3302',
    condition: 'good',
    warehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    notes: 'Substation motor insulation testing.',
    createdAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), // 1 day ago
  },
  {
    id: 'aud-109',
    assetId: 'ast-drl-01',
    qrCode: 'TOOL-DRL-030',
    toolName: 'TE 70-ATC/AVR Heavy Rotary Hammer SDS-Max',
    brand: 'Hilti',
    modelNumber: 'TE-70-ATC',
    action: 'ONBOARD',
    performedBy: 'Asset Registrar',
    targetWorker: null,
    workerPhone: null,
    condition: 'excellent',
    warehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    notes: 'Initial procurement and barcode commissioning.',
    createdAt: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), // 2 days ago
  },
];

/**
 * Retrieves chronological audit ledger entries.
 */
export async function getAuditHistory(
  filters?: AuditHistoryFilters
): Promise<AuditHistoryPayload> {
  if (!isSupabaseConfigured()) {
    return filterFallbackHistory(filters);
  }

  try {
    let query = supabase
      .from('custody_ledger')
      .select(`
        id,
        action,
        performed_by,
        notes,
        created_at,
        assets:asset_id (
          id,
          qr_code,
          condition,
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
      .order('created_at', { ascending: false });

    if (filters?.action && filters.action !== 'all') {
      query = query.eq('action', filters.action);
    }

    const { data: rawRows, error } = await query;

    if (error || !rawRows || rawRows.length === 0) {
      console.warn('Using fallback audit trail history due to empty database or query error');
      return filterFallbackHistory(filters);
    }

    interface RawLedgerRow {
      id: string;
      action: string;
      performed_by: string;
      notes: string | null;
      created_at: string;
      assets: {
        id: string;
        qr_code: string;
        condition: AuditHistoryRecord['condition'];
        current_warehouse_id: string;
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

        return {
          id: row.id,
          assetId: row.assets?.id || '',
          qrCode: row.assets?.qr_code || 'N/A',
          toolName: row.assets?.tool_models?.name || 'Tool Asset',
          brand: row.assets?.tool_models?.brand || 'Standard',
          modelNumber: row.assets?.tool_models?.model_number || null,
          action: normalizedAction,
          performedBy: row.performed_by || 'System',
          targetWorker: normalizedAction === 'CHECKOUT' ? row.performed_by : null,
          workerPhone: null,
          condition: row.assets?.condition || 'good',
          warehouseId: row.assets?.current_warehouse_id || null,
          warehouseName: row.assets?.warehouses?.name || 'Central Facility',
          warehouseCode: row.assets?.warehouses?.code || 'FAC',
          notes: row.notes,
          createdAt: row.created_at,
        };
      }
    );

    return {
      records,
      totalCount: records.length,
      warehouses: FALLBACK_WAREHOUSES,
    };
  } catch (err) {
    console.error('getAuditHistory exception, returning fallback:', err);
    return filterFallbackHistory(filters);
  }
}

function filterFallbackHistory(filters?: AuditHistoryFilters): AuditHistoryPayload {
  let items = [...FALLBACK_HISTORY_ENTRIES];

  if (filters?.action && filters.action !== 'all') {
    items = items.filter((item) => item.action === filters.action);
  }

  if (filters?.warehouseId && filters.warehouseId !== 'all') {
    items = items.filter((item) => item.warehouseId === filters.warehouseId);
  }

  if (filters?.searchQuery?.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    items = items.filter(
      (item) =>
        item.toolName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.qrCode.toLowerCase().includes(q) ||
        (item.targetWorker && item.targetWorker.toLowerCase().includes(q)) ||
        (item.performedBy && item.performedBy.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
    );
  }

  return {
    records: items,
    totalCount: items.length,
    warehouses: FALLBACK_WAREHOUSES,
  };
}
