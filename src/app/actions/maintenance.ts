'use server';

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getServerSessionOrgId, getServerSessionUser, DEFAULT_ORGANIZATION_ID } from '@/lib/auth/session';
import {
  getMockWarehouses,
  getMockAssets,
  mutateMockAsset,
  DEFAULT_ORGANIZATION,
} from '@/lib/mockStore';

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

async function resolveActiveOrg(providedOrgId?: string): Promise<string> {
  const resolved = await getServerSessionOrgId(providedOrgId);
  return resolved || DEFAULT_ORGANIZATION_ID;
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

      if (orgId && orgId !== DEFAULT_ORGANIZATION.id) {
        assetQuery = assetQuery.eq('organization_id', orgId);
      } else {
        assetQuery = assetQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
      }

      const { data: assetRows, error: assetErr } = await assetQuery.order('updated_at', { ascending: false });

      if (!assetErr && assetRows && assetRows.length > 0) {
        const assetIds = assetRows.map((a: any) => a.id);

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

        const reqMap = new Map<string, any>();
        if (transferReqs) {
          for (const req of transferReqs) {
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

        return assetRows.map((row: any) => {
          const req = reqMap.get(row.id);
          const toolName = row.tool_models?.name || row.name || 'כלי בשינוע';
          const brand = row.tool_models?.brand || row.brand || '';
          const modelNumber = row.tool_models?.model_number || row.model_number || null;
          const originWarehouseName = req?.source_warehouse?.name || 'מחסן שטח ראשי';
          const destinationWarehouseName = req?.target_warehouse?.name || row.warehouses?.name || 'אתר יעד מבוקש';
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
            originWarehouseId: req?.source_warehouse_id || '',
            originWarehouseName,
            destinationWarehouseId: req?.target_warehouse_id || row.current_warehouse_id || '',
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
        serialNumber: (sample as any).serialNumber || 'SN-77892',
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
    const originWh = warehouses[idx % warehouses.length] || { id: 'wh-01', name: 'מחסן ראשי' };
    const destWh = warehouses[(idx + 1) % warehouses.length] || { id: 'wh-02', name: 'אתר עבודה' };
    const dispatchedAt = (a as any).updatedAt || new Date().toISOString();

    return {
      id: `trans-${a.id}`,
      assetId: a.id,
      qrCode: a.qrCode,
      toolName: a.toolName,
      brand: a.brand,
      modelNumber: a.modelNumber,
      serialNumber: (a as any).serialNumber || null,
      originWarehouseId: originWh.id,
      originWarehouseName: originWh.name,
      destinationWarehouseId: destWh.id,
      destinationWarehouseName: destWh.name,
      dispatchedAt,
      elapsedTransitTimeText: formatElapsedHebrew(dispatchedAt),
      dispatchedBy: 'אחראי תפעול',
      status: 'in_transit' as const,
      transporterNotes: (a as any).transporterNotes || 'שינוע ציוד לפי דרישת עבודה',
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

      if (orgId && orgId !== DEFAULT_ORGANIZATION.id) {
        assetQuery = assetQuery.eq('organization_id', orgId);
      } else {
        assetQuery = assetQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
      }

      const { data: assetRows, error: assetErr } = await assetQuery.order('updated_at', { ascending: false });

      if (!assetErr && assetRows && assetRows.length > 0) {
        const assetIds = assetRows.map((a: any) => a.id);

        // Fetch latest incident reports from custody_ledger
        const { data: ledgerEntries } = await supabaseAdmin
          .from('custody_ledger')
          .select('asset_id, action, notes, performed_by, damage_report, created_at')
          .in('asset_id', assetIds)
          .in('action', ['MAINTENANCE_FLAG', 'MAINTENANCE_IN', 'CHECKIN'])
          .order('created_at', { ascending: false });

        const ledgerMap = new Map<string, any>();
        if (ledgerEntries) {
          for (const entry of ledgerEntries) {
            if (entry.asset_id && !ledgerMap.has(entry.asset_id)) {
              ledgerMap.set(entry.asset_id, entry);
            }
          }
        }

        return assetRows.map((row: any) => {
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
        serialNumber: (sample1 as any).serialNumber || 'SN-88219',
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
        serialNumber: (sample2 as any).serialNumber || 'SN-33901',
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
    const wh = warehouses.find((w) => w.id === a.warehouseId) || { name: a.warehouseName || 'מחסן שטח' };
    const dispatchedDate = (a as any).updatedAt || new Date().toISOString();

    return {
      id: a.id,
      assetId: a.id,
      qrCode: a.qrCode,
      toolName: a.toolName,
      brand: a.brand,
      modelNumber: a.modelNumber,
      serialNumber: (a as any).serialNumber || null,
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
 * 3. returnFromMaintenanceAction
 * Marks asset as available in the selected receiving warehouse with rated condition (excellent / good).
 * Strictly isolated by organization_id.
 */
export async function returnFromMaintenanceAction(
  input: ReturnFromMaintenanceInput
): Promise<{ success: boolean; error?: string; message?: string }> {
  const orgId = await resolveActiveOrg();
  const user = await getServerSessionUser();
  const receivedBy = input.repairedBy || user?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  const { assetId, receivingWarehouseId, condition, notes } = input;

  if (!assetId || !receivingWarehouseId || !condition) {
    return { success: false, error: 'חסרים פרטי קליטה (כלי, מחסן מקבל או דירוג מצב)' };
  }

  if (isSupabaseConfigured()) {
    try {
      const { error: updateErr } = await supabaseAdmin
        .from('assets')
        .update({
          status: 'available',
          condition,
          current_warehouse_id: receivingWarehouseId,
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      if (updateErr) {
        return { success: false, error: `שגיאה בעדכון כלי: ${updateErr.message}` };
      }

      await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'MAINTENANCE_OUT',
        performed_by: receivedBy,
        organization_id: orgId,
        notes: `קליטה מתיקון והחזרה למלאי (מצב: ${condition === 'excellent' ? 'מעולה' : 'תקין'}): ${notes || 'הכלי נבדק ונמצא תקין לשימוש'}`,
        created_at: now,
      });
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
    },
    {
      action: 'CHECKIN',
      performedBy: receivedBy,
      notes: `קליטה מתיקון: ${notes || 'נבדק ותקין'}`,
    }
  );

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
  const user = await getServerSessionUser();
  const retiredBy = input.retiredBy || user?.fullName || 'אחראי תפעול ראשי';
  const now = new Date().toISOString();

  const { assetId, reason } = input;

  if (!assetId || !reason.trim()) {
    return { success: false, error: 'יש לציין סיבת גריטה והשבתה' };
  }

  if (isSupabaseConfigured()) {
    try {
      const { error: updateErr } = await supabaseAdmin
        .from('assets')
        .update({
          status: 'maintenance',
          condition: 'retired',
          updated_at: now,
        })
        .eq('id', assetId)
        .eq('organization_id', orgId);

      if (updateErr) {
        return { success: false, error: `שגיאה בהשבתת כלי: ${updateErr.message}` };
      }

      await supabaseAdmin.from('custody_ledger').insert({
        asset_id: assetId,
        action: 'DECOMMISSION',
        performed_by: retiredBy,
        organization_id: orgId,
        notes: `גריטת כלי והשבתה לצמיתות: ${reason.trim()}`,
        created_at: now,
      });
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
    },
    {
      action: 'MAINTENANCE_FLAG',
      performedBy: retiredBy,
      notes: `גריטת כלי: ${reason.trim()}`,
    }
  );

  return {
    success: true,
    message: 'הכלי נגרט והושבת לצמיתות מהמערכת.',
  };
}
