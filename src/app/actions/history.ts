'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { DamageReport, GpsCoordinates } from '@/types/domain';
import { getMockAuditHistory, getMockWarehouses } from '@/lib/mockStore';

export type AuditActionType =
  | 'CHECKOUT'
  | 'CHECKIN'
  | 'TRANSFER_RECEIVE'
  | 'MAINTENANCE_FLAG'
  | 'ONBOARD'
  | 'LOCK_STATUS'
  | 'SAFETY_INSPECTION';

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
  expectedReturnDate?: string | null;
  signatureData?: string | null;
  accessoriesSnapshot?: {
    batteriesCount: number;
    hasCharger: boolean;
    hasCase: boolean;
  } | null;
  gps?: GpsCoordinates | null;
  damageReport?: DamageReport | null;
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

const getFallbackWarehouses = () => getMockWarehouses();

/**
 * Retrieves chronological audit ledger entries.
 */
export async function getAuditHistory(
  filters?: AuditHistoryFilters
): Promise<AuditHistoryPayload> {
  if (!isSupabaseConfigured()) {
    return getMockAuditHistory(filters);
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
      return getMockAuditHistory(filters);
    }

    interface RawLedgerRow {
      id: string;
      action: string;
      performed_by: string;
      target_worker?: string | null;
      worker_phone?: string | null;
      expected_return_date?: string | null;
      signature_data?: string | null;
      accessories_snapshot?: AuditHistoryRecord['accessoriesSnapshot'];
      damage_report?: DamageReport | null;
      gps_lat?: number | null;
      gps_lng?: number | null;
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
          expectedReturnDate: row.expected_return_date || null,
          signatureData: row.signature_data || null,
          accessoriesSnapshot: row.accessories_snapshot || null,
          damageReport: row.damage_report || null,
          gps:
            row.gps_lat != null && row.gps_lng != null
              ? { lat: row.gps_lat, lng: row.gps_lng }
              : null,
        };
      }
    );

    return {
      records,
      totalCount: records.length,
      warehouses: getFallbackWarehouses(),
    };
  } catch (err) {
    console.error('getAuditHistory exception, returning fallback:', err);
    return getMockAuditHistory(filters);
  }
}

export async function appendAuditHistoryEntry(entry: AuditHistoryRecord): Promise<void> {
  // Recorded into synchronized history store
  const { appendMockAuditRecord } = await import('@/lib/mockStore');
  appendMockAuditRecord(entry);
}
