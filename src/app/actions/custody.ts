'use server';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  CheckoutSchema,
  CheckinSchema,
  TransferSchema,
  type CheckoutInput,
  type CheckinInput,
  type TransferInput,
} from '@/core/assets/custody.schema';

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
}

export type CustodyActionResult =
  | { success: true; message: string; asset: ScannedAssetDetails }
  | { success: false; error: string };

// In-memory fallback dataset for seamless development testing
const FALLBACK_CUSTODY_ASSETS: Record<string, ScannedAssetDetails> = {
  'TOOL-WLD-001': {
    id: 'ast-wld-01',
    qrCode: 'TOOL-WLD-001',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    toolName: 'Multimatic 220 AC/DC TIG/MIG Welder',
    brand: 'Miller',
    modelNumber: '907757',
    version: 1,
  },
  'TOOL-WLD-002': {
    id: 'ast-wld-02',
    qrCode: 'TOOL-WLD-002',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Carlos Mendez',
    currentWarehouseId: 'wh-site-02',
    warehouseName: 'Site Container Bravo',
    warehouseCode: 'SCB-02',
    toolName: 'Power MIG 210 MP Multi-Process',
    brand: 'Lincoln Electric',
    modelNumber: 'K3963-1',
    version: 2,
  },
  'TOOL-WLD-003': {
    id: 'ast-wld-03',
    qrCode: 'TOOL-WLD-003',
    status: 'maintenance',
    condition: 'needs_repair',
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    toolName: 'Rebel EMP 205ic Multi-Material System',
    brand: 'ESAB',
    modelNumber: '0558102553',
    version: 1,
  },
  'TOOL-CUT-020': {
    id: 'ast-cut-01',
    qrCode: 'TOOL-CUT-020',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    toolName: '14-Inch Portable Cut-Off Saw 15A',
    brand: 'Makita',
    modelNumber: 'LW1401',
    version: 1,
  },
  'TOOL-CUT-021': {
    id: 'ast-cut-02',
    qrCode: 'TOOL-CUT-021',
    status: 'checked_out',
    condition: 'good',
    currentAssignedWorker: 'Sami Al-Hassan',
    currentWarehouseId: 'wh-van-03',
    warehouseName: 'Mobile Service Van 05',
    warehouseCode: 'MSV-05',
    toolName: '20V MAX Deep Cut Cordless Band Saw',
    brand: 'DeWalt',
    modelNumber: 'DCS374B',
    version: 3,
  },
  'TOOL-DRL-030': {
    id: 'ast-drl-01',
    qrCode: 'TOOL-DRL-030',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    toolName: 'TE 70-ATC/AVR Heavy Rotary Hammer SDS-Max',
    brand: 'Hilti',
    modelNumber: 'TE-70-ATC',
    version: 1,
  },
  'TOOL-MEA-040': {
    id: 'ast-mea-01',
    qrCode: 'TOOL-MEA-040',
    status: 'available',
    condition: 'excellent',
    currentAssignedWorker: null,
    currentWarehouseId: 'wh-main-01',
    warehouseName: 'Central Depot - Bay A',
    warehouseCode: 'CDB-01',
    toolName: 'Rugby 610 Self-Leveling Rotary Laser System',
    brand: 'Leica Geosystems',
    modelNumber: '6005983',
    version: 1,
  },
};

const WAREHOUSE_NAMES: Record<string, { name: string; code: string }> = {
  'wh-main-01': { name: 'Central Depot - Bay A', code: 'CDB-01' },
  'wh-site-02': { name: 'Site Container Bravo', code: 'SCB-02' },
  'wh-van-03': { name: 'Mobile Service Van 05', code: 'MSV-05' },
};

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
        };
      }
    } catch (err) {
      console.warn('Supabase query error in getAssetDetailsByQr, falling back to mock:', err);
    }
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

  const { assetId, workerName, notes } = parsed.data;

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
          status: 'checked_out',
          current_assigned_worker: workerName,
          version: nextVersion,
        })
        .eq('id', assetId);

      if (updateErr) {
        return { success: false, error: `Failed to checkout asset: ${updateErr.message}` };
      }

      // Record audit in custody_ledger
      await supabase.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CHECKOUT',
        performed_by: workerName,
        notes: notes || `Field checkout to ${workerName}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update fallback in-memory asset if present
  for (const key of Object.keys(FALLBACK_CUSTODY_ASSETS)) {
    if (FALLBACK_CUSTODY_ASSETS[key].id === assetId) {
      FALLBACK_CUSTODY_ASSETS[key].status = 'checked_out';
      FALLBACK_CUSTODY_ASSETS[key].currentAssignedWorker = workerName;
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      return {
        success: true,
        message: `Tool successfully checked out to ${workerName}`,
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: `Tool successfully checked out to ${workerName}`,
    asset: {
      id: assetId,
      qrCode: 'TOOL-CURRENT',
      status: 'checked_out',
      condition: 'good',
      currentAssignedWorker: workerName,
      currentWarehouseId: 'wh-main-01',
      warehouseName: 'Central Depot - Bay A',
      warehouseCode: 'CDB-01',
      toolName: 'Tool Asset',
      brand: 'Standard',
      modelNumber: null,
      version: 2,
    },
  };
}

/**
 * Checks in an asset back to the warehouse inventory.
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

  const { assetId, condition, notes } = parsed.data;
  const newStatus = condition === 'needs_repair' ? 'maintenance' : 'available';

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
      FALLBACK_CUSTODY_ASSETS[key].condition = condition;
      FALLBACK_CUSTODY_ASSETS[key].version += 1;
      return {
        success: true,
        message:
          newStatus === 'maintenance'
            ? 'Tool checked in and routed to MAINTENANCE.'
            : 'Tool checked in and marked AVAILABLE in inventory.',
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: 'Tool checked in successfully.',
    asset: {
      id: assetId,
      qrCode: 'TOOL-CURRENT',
      status: newStatus,
      condition,
      currentAssignedWorker: null,
      currentWarehouseId: 'wh-main-01',
      warehouseName: 'Central Depot - Bay A',
      warehouseCode: 'CDB-01',
      toolName: 'Tool Asset',
      brand: 'Standard',
      modelNumber: null,
      version: 2,
    },
  };
}

/**
 * Transfers an asset to a different warehouse or mobile unit.
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

  const { assetId, targetWarehouseId, notes } = parsed.data;

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
      return {
        success: true,
        message: `Tool location updated to ${targetWhMeta.name}`,
        asset: { ...FALLBACK_CUSTODY_ASSETS[key] },
      };
    }
  }

  return {
    success: true,
    message: `Tool location updated to ${targetWhMeta.name}`,
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
