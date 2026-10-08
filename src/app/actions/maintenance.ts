'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getServerSessionOrgId, getServerSessionUser } from '@/lib/auth/session';
import { clearDashboardCaches } from '@/app/actions/dashboard';
import {
  getMockWarehouses,
  getMockAssets,
  mutateMockAsset,
} from '@/lib/mockStore';

function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

export interface SendToMaintenanceInput {
  assetId: string;
  reason: string;
  warehouseId?: string;
  technicianOrLab?: string;
}

export interface InTransitFleetItem {
  id: string;
  assetId: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  serialNumber?: string | null;
  originWarehouseId: string;
  originWarehouseName: string;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  dispatchedAt: string;
  elapsedTransitTimeText: string;
  dispatchedBy: string;
  status: 'in_transit';
  requestId?: string;
  transporterNotes?: string | null;
}

export interface MaintenanceAssetItem {
  id: string;
  assetId: string;
  qrCode: string;
  toolName: string;
  brand: string;
  modelNumber: string | null;
  serialNumber?: string | null;
  currentWarehouseId: string;
  reportingWarehouseName: string;
  assignedTechnicianOrLab: string;
  faultDescription: string;
  dispatchedDate: string;
  elapsedTimeText: string;
  condition: string;
}

export interface ReturnFromMaintenanceInput {
  assetId: string;
  receivingWarehouseId: string;
  condition: 'excellent' | 'good';
  notes?: string;
  repairedBy?: string;
}

export interface ScrapAssetInput {
  assetId: string;
  reason: string;
  retiredBy?: string;
}

async function resolveActiveOrg(providedOrgId?: string): Promise<string | null> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || null;
}

function formatElapsedHebrew(dateStr?: string | null): string {
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

/**
 * 1. getInTransitFleetAction
 * Retrieves all assets currently moving between facilities (status = 'in_transit')
 * Strictly isolated by organization_id.
 */
export async function getInTransitFleetAction(
  providedOrgId?: string
): Promise<InTransitFleetItem[]> {
  const orgId = await resolveActiveOrg(providedOrgId);
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  if (isSupabaseConfigured()) {
    try {
      let assetQuery = supabaseAdmin
        .from('assets')
        .select(`
          id,
          qr_code,
          name,
          brand,
          model_number,
          serial_number,
          status,
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
        .eq('status', 'in_transit');

      assetQuery = assetQuery.eq('organization_id', orgId);

      const { data: assetRows, error: assetErr } = await assetQuery.order('updated_at', { ascending: false });

      if (!assetErr && assetRows && assetRows.length > 0) {
        const typedAssetRows = assetRows as Array<Record<string, unknown> & {
          id: string;
          qr_code?: string;
          tool_models?: { name?: string; brand?: string; model_number?: string | null } | null;
          name?: string;
          brand?: string;
          model_number?: string | null;
          serial_number?: string | null;
          current_warehouse_id?: string;
          warehouses?: { name?: string } | null;
          updated_at?: string;
          created_at?: string;
        }>;
        const assetIds = typedAssetRows.map((a) => a.id);

        // Retrieve approved transfer requests to identify source and target warehouses
        const { data: transferReqs } = await supabaseAdmin
          .from('transfer_requests')
          .select(`
            id,
            asset_id,
            source_warehouse_id,
            target_warehouse_id,
            requested_by,
            decided_by,
            reason,
            updated_at,
            created_at,
            source_warehouse:source_warehouse_id ( name, code ),
            target_warehouse:target_warehouse_id ( name, code )
          `)
          .in('asset_id', assetIds)
          .eq('status', 'APPROVED')
          .order('updated_at', { ascending: false });

        type TransferReqRecord = {
          id: string;
          asset_id: string;
          source_warehouse_id?: string;
          target_warehouse_id?: string;
          requested_by?: string;
          decided_by?: string;
          reason?: string;
          updated_at?: string;
          created_at?: string;
          source_warehouse?: { name?: string; code?: string } | null;
          target_warehouse?: { name?: string; code?: string } | null;
        };

        const reqMap = new Map<string, TransferReqRecord>();
        if (transferReqs) {
          for (const req of (transferReqs as TransferReqRecord[])) {
            if (req.asset_id && !reqMap.has(req.asset_id)) {
              reqMap.set(req.asset_id, req);
            }
          }
        }

        const { data: ledgerTransfers } = await supabaseAdmin
          .from('custody_ledger')
          .select('asset_id, notes')
          .in('asset_id', assetIds)
          .eq('action', 'TRANSFER_INIT')
          .order('created_at', { ascending: false });

        const ledgerNoteMap = new Map<string, string>();
        if (ledgerTransfers) {
          for (const lt of ledgerTransfers) {
            if (lt.asset_id && !ledgerNoteMap.has(lt.asset_id) && lt.notes) {
              ledgerNoteMap.set(lt.asset_id, lt.notes);
            }
          }
        }

        const { data: allOrgWhs } = await supabaseAdmin
          .from('warehouses')
          .select('id, name')
          .eq('organization_id', orgId);
        const typedWhs = (allOrgWhs || []) as Array<{ id: string; name: string }>;
        const orgWhMap = new Map<string, string>();
        typedWhs.forEach((w) => orgWhMap.set(w.id, w.name));

        return typedAssetRows.map((row) => {
          const req = reqMap.get(row.id);
          const toolName = row.tool_models?.name || row.name || 'כלי בשינוע';
          const brand = row.tool_models?.brand || row.brand || '';
          const modelNumber = row.tool_models?.model_number || row.model_number || null;
          const defaultOriginWh = typedWhs.find((w) => w.id !== row.current_warehouse_id) || typedWhs[0];
          const originWarehouseId = req?.source_warehouse_id || defaultOriginWh?.id || '';
          const originWarehouseName = req?.source_warehouse?.name || (originWarehouseId ? orgWhMap.get(originWarehouseId) : null) || 'מחסן שטח ראשי';
          const destinationWarehouseId = req?.target_warehouse_id || row.current_warehouse_id || '';
          const destinationWarehouseName = req?.target_warehouse?.name || row.warehouses?.name || (destinationWarehouseId ? orgWhMap.get(destinationWarehouseId) : null) || 'אתר יעד מבוקש';
          const dispatchedAt = req?.updated_at || row.updated_at || row.created_at;
          const dispatchedBy = req?.decided_by || req?.requested_by || 'מנהל תפעול';
          const transporterNotes = req?.reason || ledgerNoteMap.get(row.id) || null;

          return {
            id: req?.id || row.id,
            assetId: row.id,
            qrCode: row.qr_code,
            toolName,
            brand,
            modelNumber,
            serialNumber: row.serial_number || null,
            originWarehouseId,
            originWarehouseName,
            destinationWarehouseId,
            destinationWarehouseName,
            dispatchedAt,
            elapsedTransitTimeText: formatElapsedHebrew(dispatchedAt),
            dispatchedBy,
            status: 'in_transit' as const,
            requestId: req?.id,
            transporterNotes,
          };
        });
      }
    } catch (err) {
      console.warn('[getInTransitFleetAction] Supabase query error:', err);
    }
  }

  // Fallback to unified in-memory mock store
  const mockAssets = getMockAssets(orgId);
  const warehouses = getMockWarehouses(true, orgId);

  const inTransitAssets = mockAssets.filter((a) => a.status === 'in_transit');

  if (inTransitAssets.length === 0 && mockAssets.length > 0) {
    // Return realistic demonstrative in-transit asset for chief logistics preview if none currently in transit
    const sample = mockAssets[0];
    const originWh = warehouses[0] || { id: 'wh-01', name: 'מחסן ראשי - תלפיות' };
    const destWh = warehouses[1] || { id: 'wh-02', name: 'אתר מגדלי המרכז' };
    const nowIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    return [
      {
        id: `trans-${sample.id}`,
        assetId: sample.id,
        qrCode: sample.qrCode,
        toolName: sample.toolName,
        brand: sample.brand,
        modelNumber: sample.modelNumber,
        serialNumber: (sample as Record<string, unknown>).serialNumber as string || 'SN-77892',
        originWarehouseId: originWh.id,
        originWarehouseName: originWh.name,
        destinationWarehouseId: destWh.id,
        destinationWarehouseName: destWh.name,
        dispatchedAt: nowIso,
        elapsedTransitTimeText: formatElapsedHebrew(nowIso),
        dispatchedBy: 'סאלח מחסנאי',
        status: 'in_transit' as const,
        transporterNotes: 'שינוע ישיר בין מכולות שטח לפי דרישת מנהל פרויקט',
      },
    ];
  }

  return inTransitAssets.map((a, idx) => {
    const rawA = a as Record<string, unknown>;
    const originWh = warehouses[idx % warehouses.length] || { id: 'wh-01', name: 'מחסן ראשי' };
    const destWh = warehouses[(idx + 1) % warehouses.length] || { id: 'wh-02', name: 'אתר עבודה' };
    const dispatchedAt = (rawA.updatedAt as string) || new Date().toISOString();

    return {
      id: `trans-${a.id}`,
      assetId: a.id,
      qrCode: a.qrCode,
      toolName: a.toolName,
      brand: a.brand,
      modelNumber: a.modelNumber,
      serialNumber: (rawA.serialNumber as string) || null,
      originWarehouseId: originWh.id,
      originWarehouseName: originWh.name,
      destinationWarehouseId: destWh.id,
      destinationWarehouseName: destWh.name,
      dispatchedAt,
      elapsedTransitTimeText: formatElapsedHebrew(dispatchedAt),
      dispatchedBy: 'אחראי תפעול',
      status: 'in_transit' as const,
      transporterNotes: (rawA.transporterNotes as string) || 'שינוע ציוד לפי דרישת עבודה',
    };
  });
}

/**
 * 2. getMaintenanceAssetsAction
 * Retrieves all tools currently under maintenance or repair (status = 'maintenance')
 * Strictly isolated by organization_id.
 */
export async function getMaintenanceAssetsAction(
  providedOrgId?: string
): Promise<MaintenanceAssetItem[]> {
  const orgId = await resolveActiveOrg(providedOrgId);
  if (!orgId || orgId === 'platform-master-superadmin') {
    return [];
  }

  if (isSupabaseConfigured()) {
    try {
      let assetQuery = supabaseAdmin
        .from('assets')
        .select(`
          id,
          qr_code,
          name,
          brand,
          model_number,
          serial_number,
          status,
          condition,
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
        .eq('status', 'maintenance')
        .neq('condition', 'retired');

      assetQuery = assetQuery.eq('organization_id', orgId);

      const { data: assetRows, error: assetErr } = await assetQuery.order('updated_at', { ascending: false });

      if (!assetErr && assetRows && assetRows.length > 0) {
        const typedAssetRows = assetRows as Array<Record<string, unknown> & {
          id: string;
          qr_code?: string;
          tool_models?: { name?: string; brand?: string; model_number?: string | null } | null;
          name?: string;
          brand?: string;
          model_number?: string | null;
          serial_number?: string | null;
          current_warehouse_id?: string;
          warehouses?: { name?: string } | null;
          updated_at?: string;
          created_at?: string;
        }>;
        const assetIds = typedAssetRows.map((a) => a.id);

        // Fetch latest incident reports from custody_ledger
        const { data: ledgerEntries } = await supabaseAdmin
          .from('custody_ledger')
          .select('asset_id, action, notes, performed_by, damage_report, created_at')
          .in('asset_id', assetIds)
          .in('action', ['MAINTENANCE_FLAG', 'MAINTENANCE_IN', 'CHECKIN'])
          .order('created_at', { ascending: false });

        type LedgerEntryRecord = {
          asset_id?: string;
          action?: string;
          notes?: string;
          performed_by?: string;
          damage_report?: string;
          created_at?: string;
        };
        const ledgerMap = new Map<string, LedgerEntryRecord>();
        if (ledgerEntries) {
          for (const entry of (ledgerEntries as LedgerEntryRecord[])) {
            if (entry.asset_id && !ledgerMap.has(entry.asset_id)) {
              ledgerMap.set(entry.asset_id, entry);
            }
          }
        }

        return typedAssetRows.map((row) => {
          const ledger = ledgerMap.get(row.id);
          const toolName = row.tool_models?.name || row.name || 'כלי בתיקון';
          const brand = row.tool_models?.brand || row.brand || '';
          const modelNumber = row.tool_models?.model_number || row.model_number || null;
          const reportingWarehouseName = row.warehouses?.name || 'מחסן שטח מרכזי';
          const dispatchedDate = ledger?.created_at || row.updated_at || row.created_at;

          // Infer or assign representative technician / lab based on brand
          let lab = 'מעבדת שירות מרכזית';
          const bLower = brand.toLowerCase();
          if (bLower.includes('makita')) lab = 'מעבדת מקיטה ראשית';
          else if (bLower.includes('bosch')) lab = 'מעבדת בוש ישראל';
          else if (bLower.includes('dewalt')) lab = 'שירות דה-וולט';
          else if (bLower.includes('milwaukee')) lab = 'מעבדת מילווקי';
          else if (bLower.includes('hilti')) lab = 'שירות הילטי רשמי';

          return {
            id: row.id,
            assetId: row.id,
            qrCode: row.qr_code,
            toolName,
            brand,
            modelNumber,
            serialNumber: row.serial_number || null,
            currentWarehouseId: row.current_warehouse_id || '',
            reportingWarehouseName,
            assignedTechnicianOrLab: lab,
            faultDescription: ledger?.notes || 'בדיקת מנוע והחלפת פחמים תקופתית',
            dispatchedDate,
            elapsedTimeText: formatElapsedHebrew(dispatchedDate),
            condition: row.condition || 'needs_repair',
          };
        });
      }
    } catch (err) {
      console.warn('[getMaintenanceAssetsAction] Supabase query error:', err);
    }
  }

  // Fallback to unified in-memory mock store
  const mockAssets = getMockAssets(orgId);
  const warehouses = getMockWarehouses(true, orgId);

  const maintenanceAssets = mockAssets.filter(
    (a) => a.status === 'maintenance' && a.condition !== 'retired'
  );

  if (maintenanceAssets.length === 0 && mockAssets.length > 0) {
    // Generate realistic sample maintenance items for Chief Storekeeper preview
    const sample1 = mockAssets[1] || mockAssets[0];
    const sample2 = mockAssets[2] || mockAssets[0];
    const wh1 = warehouses[0] || { name: 'מחסן מרכזי' };
    const wh2 = warehouses[1] || { name: 'מכולת אתר גליל' };
    const date1 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const date2 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    return [
      {
        id: sample1.id,
        assetId: sample1.id,
        qrCode: sample1.qrCode,
        toolName: sample1.toolName,
        brand: sample1.brand,
        modelNumber: sample1.modelNumber,
        serialNumber: (sample1 as Record<string, unknown>).serialNumber as string || 'SN-88219',
        currentWarehouseId: sample1.warehouseId,
        reportingWarehouseName: wh1.name,
        assignedTechnicianOrLab: 'מעבדת מקיטה רשמית',
        faultDescription: 'רעש גיר חריג בהפעלה &bull; החלפת שמן ומיסב קדמי',
        dispatchedDate: date1,
        elapsedTimeText: formatElapsedHebrew(date1),
        condition: 'needs_repair',
      },
      {
        id: sample2.id,
        assetId: sample2.id,
        qrCode: sample2.qrCode,
        toolName: sample2.toolName,
        brand: sample2.brand,
        modelNumber: sample2.modelNumber,
        serialNumber: (sample2 as Record<string, unknown>).serialNumber as string || 'SN-33901',
        currentWarehouseId: sample2.warehouseId,
        reportingWarehouseName: wh2.name,
        assignedTechnicianOrLab: 'מוסך מרכזי - תיקוני שטח',
        faultDescription: 'החלפת כבל זינה שנפגם בעבודה באתר',
        dispatchedDate: date2,
        elapsedTimeText: formatElapsedHebrew(date2),
        condition: 'needs_repair',
      },
    ];
  }

  return maintenanceAssets.map((a) => {
    const rawA = a as Record<string, unknown>;
    const wh = warehouses.find((w) => w.id === a.warehouseId) || { name: a.warehouseName || 'מחסן שטח' };
    const dispatchedDate = (rawA.updatedAt as string) || new Date().toISOString();

    return {
      id: a.id,
      assetId: a.id,
      qrCode: a.qrCode,
      toolName: a.toolName,
      brand: a.brand,
      modelNumber: a.modelNumber,
      serialNumber: (rawA.serialNumber as string) || null,
      currentWarehouseId: a.warehouseId,
      reportingWarehouseName: wh.name,
      assignedTechnicianOrLab: 'מעבדת שירות מוסמכת',
      faultDescription: 'בדיקת תקינות ועמידה בעומס לאחר דיווח שטח',
      dispatchedDate,
      elapsedTimeText: formatElapsedHebrew(dispatchedDate),
      condition: a.condition || 'needs_repair',
    };
  });
}

/**
 * 2b. sendToMaintenanceAction
 * Transfers tool status to 'maintenance' / 'needs_repair', removes assigned worker,
 * inserts a corresponding movement record into custody_ledger with warehouse_id,
 * and revalidates all paths.
 */
export async function sendToMaintenanceAction(
  input: SendToMaintenanceInput
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();
  const performedBy = user?.fullName || (user as unknown as { name?: string })?.name || 'מחסנאי שטח';
  const now = new Date().toISOString();
  const { assetId, reason, warehouseId, technicianOrLab } = input;

  if (!assetId || !reason?.trim()) {
    return { success: false, error: 'יש לציין מזהה כלי וסיבת תקלה' };
  }

  let targetWhId = warehouseId;

  if (isSupabaseConfigured()) {
    try {
      const { data: currentAsset, error: fetchErr } = await supabaseAdmin
        .from('assets')
        .select('id, current_warehouse_id, organization_id')
        .eq('id', assetId)
        .maybeSingle();

      if (fetchErr || !currentAsset) {
        return { success: false, error: 'כלי העבודה לא נמצא במערכת' };
      }

      targetWhId = targetWhId || currentAsset.current_warehouse_id;
      if (!targetWhId || !isValidUuid(targetWhId)) {
        const { data: fallbackWh } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        targetWhId = fallbackWh?.id || null;
      }

      // Step 1: Update assets table
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'needs_repair',
          current_assigned_worker: null,
          organization_id: orgId,
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      const { data: updatedRows, error: updateErr } = await updateQuery.select();

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        return { success: false, error: 'העדכון נכשל: הכלי לא נמצא (0 שורות עודכנו).' };
      }

      // Step 2: Insert into custody_ledger
      const notesText = technicianOrLab
        ? `שליחה לתיקון (${technicianOrLab}): ${reason.trim()}`
        : `שליחה לתיקון: ${reason.trim()}`;

      const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
        organization_id: orgId,
        asset_id: assetId,
        action: 'MAINTENANCE',
        warehouse_id: targetWhId,
        from_warehouse_id: targetWhId,
        to_warehouse_id: targetWhId,
        performed_by: performedBy,
        condition_at_return: 'needs_repair',
        notes: notesText,
        created_at: now,
      });

      if (ledgerError) {
        console.error('LEDGER INSERT FAILED:', ledgerError);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerError.message };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update in-memory fallback
  mutateMockAsset(
    assetId,
    {
      status: 'maintenance',
      condition: 'needs_repair',
      currentAssignedWorker: null,
    },
    {
      action: 'MAINTENANCE_FLAG',
      performedBy,
      notes: reason.trim(),
    }
  );

  // Step 3: Trigger Next.js cache revalidation
  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[sendToMaintenanceAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי הועבר בהצלחה לסטטוס תחזוקה / תיקון.',
  };
}

/**
 * 3. returnFromMaintenanceAction
 * Marks asset as available in the selected receiving warehouse with rated condition (excellent / good).
 * Strictly isolated by organization_id.
 */
export async function returnFromMaintenanceAction(
  input: ReturnFromMaintenanceInput
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();
  const receivedBy = input.repairedBy || user?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  const { assetId, receivingWarehouseId, condition, notes } = input;

  if (!assetId || !receivingWarehouseId || !condition) {
    return { success: false, error: 'חסרים פרטי קליטה (כלי, מחסן מקבל או דירוג מצב)' };
  }

  if (isSupabaseConfigured()) {
    try {
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          status: 'available',
          condition,
          current_warehouse_id: receivingWarehouseId,
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
        return { success: false, error: `שגיאה בעדכון כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset on return from maintenance:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'CHECKIN',
        performed_by: receivedBy,
        organization_id: orgId,
        warehouse_id: receivingWarehouseId,
        to_warehouse_id: receivingWarehouseId,
        from_warehouse_id: receivingWarehouseId,
        condition_at_return: condition,
        notes: `קליטה מתיקון והחזרה למלאי (מצב: ${condition === 'excellent' ? 'מעולה' : 'תקין'}): ${notes || 'הכלי נבדק ונמצא תקין לשימוש'}`,
        created_at: now,
      });

      if (ledgerError) {
        console.error('LEDGER INSERT FAILED:', ledgerError);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerError.message };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update in-memory fallback
  const whMeta = getMockWarehouses(true, orgId).find((w) => w.id === receivingWarehouseId);
  mutateMockAsset(
    assetId,
    {
      status: 'available',
      condition,
      currentWarehouseId: receivingWarehouseId,
      warehouseId: receivingWarehouseId,
      warehouseName: whMeta?.name || 'מחסן מקבל',
      warehouseCode: whMeta?.code || '',
      currentAssignedWorker: null,
    },
    {
      action: 'CHECKIN',
      performedBy: receivedBy,
      notes: `קליטה מתיקון: ${notes || 'נבדק ותקין'}`,
    }
  );

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[returnFromMaintenanceAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי נקלט בהצלחה מתיקון והוחזר למלאי המחסן כזמין להשאלה!',
  };
}

/**
 * 4. scrapAndRetireAssetAction
 * Permanently retires a tool from the fleet due to irreparable damage or obsolescence.
 * Strictly isolated by organization_id.
 */
export async function scrapAndRetireAssetAction(
  input: ScrapAssetInput
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  if (!orgId || orgId === 'platform-master-superadmin') {
    return { success: false, error: 'לא נמצא מזהה ארגון מורשה' };
  }
  const user = await getServerSessionUser();
  const retiredBy = input.retiredBy || user?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  const { assetId, reason } = input;

  if (!assetId || !reason.trim()) {
    return { success: false, error: 'יש לציין סיבת גריטה והשבתה' };
  }

  if (isSupabaseConfigured()) {
    try {
      const updateQuery = supabaseAdmin
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'retired',
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
        return { success: false, error: `שגיאה בהשבתת כלי: ${updateErr.message}` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.error("Zero rows updated for asset on scrap and retire:", assetId);
        return { success: false, error: "העדכון נכשל: הכלי לא נמצא או שנחסם עקב הרשאות (0 שורות עודכנו)." };
      }

      let whId = updatedRows[0]?.current_warehouse_id;
      if (!whId || !isValidUuid(whId)) {
        const { data: fallbackWh } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        whId = fallbackWh?.id || null;
      }

      const { error: ledgerError } = await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'RETIRE',
        performed_by: retiredBy,
        organization_id: orgId,
        warehouse_id: whId,
        from_warehouse_id: whId,
        to_warehouse_id: whId,
        condition_at_return: 'retired',
        notes: `גריטת כלי והשבתה לצמיתות: ${reason.trim()}`,
        created_at: now,
      });

      if (ledgerError) {
        console.error('LEDGER INSERT FAILED:', ledgerError);
        return { success: false, error: 'שגיאה ברישום ביומן התנועות: ' + ledgerError.message };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  }

  // Update in-memory fallback
  mutateMockAsset(
    assetId,
    {
      status: 'maintenance',
      condition: 'retired',
      currentAssignedWorker: null,
    },
    {
      action: 'MAINTENANCE_FLAG',
      performedBy: retiredBy,
      notes: `גריטת כלי: ${reason.trim()}`,
    }
  );

  try {
    await clearDashboardCaches();
    revalidatePath('/history');
    revalidatePath('/dashboard/warehouse');
    revalidatePath('/catalog');
    revalidatePath('/dashboard/manager');
  } catch (e) {
    console.warn('[scrapAndRetireAssetAction] revalidatePath warning:', e);
  }

  return {
    success: true,
    message: 'הכלי נגרט והושבת לצמיתות מהמערכת.',
  };
}
