import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 12 Authoritative Warehouse UUIDs and Metadata
export const AUTHORITATIVE_WAREHOUSES = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'הבונים',
    code: 'WH-HB',
    type: 'central_warehouse',
    address: 'מתחם הבונים',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'בז"ן',
    code: 'WH-BZN',
    type: 'site_container',
    address: 'בתי זיקוק לנפט חיפה',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'שגיא 2000',
    code: 'WH-SG',
    type: 'site_container',
    address: 'אזור תעשייה שגיא 2000',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    name: 'חגית',
    code: 'WH-HGT',
    type: 'site_container',
    address: 'תחנת כוח חגית',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    name: 'אורות רבין',
    code: 'WH-OR',
    type: 'site_container',
    address: 'תחנת כוח אורות רבין - חדרה',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    name: 'צפית',
    code: 'WH-ZPT',
    type: 'site_container',
    address: 'תחנת כוח צפית',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    name: 'עגלת טורבינות',
    code: 'WH-TRB',
    type: 'service_van',
    address: 'עגלת שירות טורבינות ניידת',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000008',
    name: 'אשקלון',
    code: 'WH-ASH',
    type: 'site_container',
    address: 'מתחם אשקלון',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000009',
    name: 'גדות',
    code: 'WH-GDT',
    type: 'site_container',
    address: 'מתחם גדות',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000010',
    name: 'צלבנים',
    code: 'WH-ZLB',
    type: 'site_container',
    address: 'אתר צלבנים',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000011',
    name: 'תחנת כוח גזר',
    code: 'WH-GZR',
    type: 'site_container',
    address: 'תחנת כוח גזר',
    isActive: true,
  },
  {
    id: '10000000-0000-0000-0000-000000000012',
    name: 'באר שבע',
    code: 'WH-BS',
    type: 'site_container',
    address: 'מתחם באר שבע',
    isActive: true,
  },
];

const WAREHOUSE_MAP = {
  'הבונים': '10000000-0000-0000-0000-000000000001',
  'בז"ן': '10000000-0000-0000-0000-000000000002',
  'שגיא 2000': '10000000-0000-0000-0000-000000000003',
  'חגית': '10000000-0000-0000-0000-000000000004',
  'אורות רבין': '10000000-0000-0000-0000-000000000005',
  'צפית': '10000000-0000-0000-0000-000000000006',
  'עגלת טורבינות': '10000000-0000-0000-0000-000000000007',
  'אשקלון': '10000000-0000-0000-0000-000000000008',
  'גדות': '10000000-0000-0000-0000-000000000009',
  'צלבנים': '10000000-0000-0000-0000-000000000010',
  'תחנת כוח גזר': '10000000-0000-0000-0000-000000000011',
  'באר שבע': '10000000-0000-0000-0000-000000000012',
};

function resolveWarehouseId(siteValue, statusRaw) {
  const cleanSite = (siteValue || '').trim();
  if (cleanSite && WAREHOUSE_MAP[cleanSite]) {
    return WAREHOUSE_MAP[cleanSite];
  }
  if (cleanSite) {
    for (const [name, uuid] of Object.entries(WAREHOUSE_MAP)) {
      if (cleanSite.includes(name) || name.includes(cleanSite)) {
        return uuid;
      }
    }
  }
  if ((!cleanSite || cleanSite === '') && statusRaw === 'מחסן ראשי') {
    return WAREHOUSE_MAP['הבונים'];
  }
  return WAREHOUSE_MAP['הבונים'];
}

function mapStatus(statusRaw) {
  const clean = (statusRaw || '').trim();
  if (clean === 'בשימוש') return 'checked_out';
  if (clean === 'בתיקון') return 'maintenance';
  if (clean === 'צריך תיקון') return 'needs_repair';
  if (clean === 'מחסן ראשי') return 'available';
  return 'available';
}

function mapCondition(statusMapped) {
  if (statusMapped === 'needs_repair' || statusMapped === 'maintenance') {
    return 'needs_repair';
  }
  return 'good';
}

function extractBrand(toolName) {
  const t = (toolName || '').toLowerCase();
  if (t.includes('מקיטה') || t.includes('makita')) return 'Makita';
  if (t.includes('מילווקי') || t.includes('milwaukee')) return 'Milwaukee';
  if (t.includes('בוש') || t.includes('bosch')) return 'Bosch';
  if (t.includes('מיטאבו') || t.includes('metabo')) return 'Metabo';
  if (t.includes('הילטי') || t.includes('hilti')) return 'Hilti';
  if (t.includes('רילאנד') || t.includes('reland') || t.includes('riland')) return 'Riland';
  if (t.includes('מאגמה') || t.includes('magma')) return 'Magma';
  if (t.includes('hunter') || t.includes('האנטר')) return 'Hunter';
  if (t.includes('proxen')) return 'Proxen';
  if (t.includes('דיוולט') || t.includes('דוולט') || t.includes('dewalt')) return 'DeWalt';
  return 'Zatout';
}

function resolveCategoryId(catName) {
  if (!catName) return 'cat-drill';
  const clean = catName.trim();
  if (clean.includes('ריתוך') || clean.includes('רתכות') || clean.includes('תנור')) return 'cat-weld';
  if (clean.includes('הרמה') || clean.includes('סולמות') || clean.includes('מנפ"ם')) return 'cat-lift';
  if (clean.includes('דיסק') || clean.includes('חיתוך') || clean.includes('משור') || clean.includes('גקסון') || clean.includes('אבן אצבע') || clean.includes('צנרת')) return 'cat-cut';
  if (clean.includes('מדידה') || clean.includes('מאזנת') || clean.includes('מומנט') || clean.includes('מומנת')) return 'cat-meas';
  return 'cat-drill';
}

// Read .env.local if present
function loadEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    });
  }
  return env;
}

async function main() {
  // 1. Locate and parse Excel file
  let excelPath = path.join(projectRoot, 'zatout_inventory.xlsx');
  if (!fs.existsSync(excelPath)) {
    excelPath = path.join(projectRoot, 'zatout_inventory.xlsx.xlsx');
  }

  if (!fs.existsSync(excelPath)) {
    console.error(`Excel inventory file not found at ${excelPath}`);
    process.exit(1);
  }

  const wb = xlsx.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  // Locate header row containing 'Task ID'
  const headerIdx = rawRows.findIndex((r) => r && r.includes('Task ID'));
  if (headerIdx === -1) {
    console.error('Could not find header row with "Task ID" in Excel');
    process.exit(1);
  }

  const headers = rawRows[headerIdx];
  const colMap = {};
  headers.forEach((h, idx) => {
    colMap[String(h).trim()] = idx;
  });

  // Parse task rows
  const parsedRecords = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r[colMap['Task ID']]) continue;
    const originalTaskId = String(r[colMap['Task ID']]).trim();
    if (!originalTaskId.startsWith('86')) continue;

    const customId = String(r[colMap['Task Custom ID']] || '').trim();
    const name = String(r[colMap['Task Name']] || '').trim();
    const statusRaw = String(r[colMap['Status']] || '').trim();
    const siteRaw = r[colMap['אתר ציוד (drop down)']] ? String(r[colMap['אתר ציוד (drop down)']]).trim() : '';
    const workerRaw = r[colMap['שם מקבל (short text)']] ? String(r[colMap['שם מקבל (short text)']]).trim() : '';
    const categoryName = r[colMap['קבוצת ציוד (drop down)']] ? String(r[colMap['קבוצת ציוד (drop down)']]).trim() : '';
    const orderNumber = r[colMap['מספר הזמנה (short text)']] ? String(r[colMap['מספר הזמנה (short text)']]).trim() : '';

    const status = mapStatus(statusRaw);
    const condition = mapCondition(status);
    const warehouseId = resolveWarehouseId(siteRaw, statusRaw);
    const warehouse = AUTHORITATIVE_WAREHOUSES.find((w) => w.id === warehouseId) || AUTHORITATIVE_WAREHOUSES[0];

    parsedRecords.push({
      originalTaskId,
      qr_code: customId,
      serial_number: customId,
      name,
      status,
      condition,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      warehouseCode: warehouse.code,
      current_assigned_worker: workerRaw || null,
      category_name: categoryName || 'כללי',
      categoryId: resolveCategoryId(categoryName),
      order_number: orderNumber || null,
      brand: extractBrand(name),
    });
  }

  // Exactly 501 authoritative records for ingestion
  const TARGET_COUNT = 501;
  const recordsToIngest = parsedRecords.slice(0, TARGET_COUNT);

  if (recordsToIngest.length < TARGET_COUNT) {
    console.warn(`Warning: Extracted ${recordsToIngest.length} records, expected ${TARGET_COUNT}`);
  }

  // 2. Direct Supabase Ingestion
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const isLiveSupabase =
    Boolean(supabaseUrl && supabaseKey) &&
    !supabaseUrl.includes('placeholder.supabase.co') &&
    !supabaseUrl.includes('your-supabase-url');

  if (isLiveSupabase) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // A. Ensure the 12 warehouses exist
      const { error: whError } = await supabase.from('warehouses').upsert(
        AUTHORITATIVE_WAREHOUSES.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          type: w.type,
          address: w.address,
          is_active: w.isActive,
        })),
        { onConflict: 'id' }
      );
      if (whError) {
        console.warn('[Supabase] Note on warehouses sync:', whError.message);
      }

      // B. Ingest the 501 records into assets table in batches of 50
      const BATCH_SIZE = 50;
      for (let i = 0; i < recordsToIngest.length; i += BATCH_SIZE) {
        const batch = recordsToIngest.slice(i, i + BATCH_SIZE);
        const dbPayload = batch.map((item) => ({
          id: `ast-${item.originalTaskId}`,
          qr_code: item.qr_code,
          serial_number: item.serial_number,
          current_warehouse_id: item.warehouseId,
          status: item.status,
          condition: item.condition,
          current_assigned_worker: item.current_assigned_worker,
          version: 1,
          purchase_cost: 2500,
          purchase_date: '2026-01-15',
        }));

        const { error: batchError } = await supabase.from('assets').upsert(dbPayload, {
          onConflict: 'qr_code',
        });

        if (batchError) {
          console.warn(`[Supabase] Batch ${Math.floor(i / BATCH_SIZE) + 1} notice:`, batchError.message);
        }
      }
    } catch (err) {
      console.warn('[Supabase] Supabase connection error:', err.message);
    }
  } else {
    // Offline/fallback mode: live DB not connected via .env.local
  }

  // 3. Synchronize src/lib/mockStore.ts with the exact 501 assets array
  const mockStorePath = path.join(projectRoot, 'src', 'lib', 'mockStore.ts');
  if (fs.existsSync(mockStorePath)) {
    const mockStoreContent = fs.readFileSync(mockStorePath, 'utf-8');

    // Build the exact 501 assets objects array
    const mockAssetsArray = recordsToIngest.map((item) => ({
      id: `ast-${item.originalTaskId}`,
      qrCode: item.qr_code,
      serialNumber: item.serial_number,
      toolName: item.name,
      brand: item.brand,
      modelNumber: null,
      categoryId: item.categoryId,
      categoryName: item.category_name,
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName,
      warehouseCode: item.warehouseCode,
      status: item.status,
      condition: item.condition,
      currentAssignedWorker: item.current_assigned_worker,
      workerPhone: null,
      version: 1,
      purchaseCost: 2500,
      purchaseDate: '2026-01-15',
      warrantyUntil: '2028-01-15',
      safetyInspectionDue: '2027-01-15',
      isLocked: false,
      originalTaskId: item.originalTaskId,
      orderNumber: item.order_number,
    }));

    const mockWarehousesString = JSON.stringify(AUTHORITATIVE_WAREHOUSES, null, 2);
    const mockAssetsString = JSON.stringify(mockAssetsArray, null, 2);

    // 1. Replace MOCK_WAREHOUSES and warehousesStore
    let updatedContent = mockStoreContent.replace(
      /export const MOCK_WAREHOUSES: Warehouse\[\] =[\s\S]*?;\r?\n\r?\nconst warehousesStore: Warehouse\[\] =[\s\S]*?;/,
      `export const MOCK_WAREHOUSES: Warehouse[] = ${mockWarehousesString};\n\nconst warehousesStore: Warehouse[] = [...MOCK_WAREHOUSES];`
    );

    // 2. Replace MOCK_ASSETS
    updatedContent = updatedContent.replace(
      /export const MOCK_ASSETS: UnifiedAssetItem\[\] =[\s\S]*?;\r?\n\r?\n(\/\/ 4\. Authoritative Audit History Records)/,
      `export const MOCK_ASSETS: UnifiedAssetItem[] = ${mockAssetsString};\n\n$1`
    );

    // 3. Replace assetsStore initialization
    updatedContent = updatedContent.replace(
      /const assetsStore: UnifiedAssetItem\[\] =[\s\S]*?;/,
      `const assetsStore: UnifiedAssetItem[] = [...MOCK_ASSETS];`
    );

    fs.writeFileSync(mockStorePath, updatedContent, 'utf-8');
  }

  // 4. Output success confirmation
  console.log(`✓ Successfully ingested ${recordsToIngest.length} assets into Supabase and mockStore`);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
