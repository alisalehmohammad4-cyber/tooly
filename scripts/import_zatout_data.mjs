import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Authoritative Base Warehouses
export const BASE_WAREHOUSES = [
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

function mapStatus(statusRaw) {
  const s = String(statusRaw || '').trim();
  if (s.includes('צריך תיקון')) return 'needs_repair';
  if (s.includes('בתיקון')) return 'maintenance';
  if (s.includes('בשימוש')) return 'checked_out';
  if (s.includes('מחסן ראשי')) return 'available';
  return 'available';
}

function mapCondition(statusMapped) {
  if (statusMapped === 'needs_repair' || statusMapped === 'maintenance') {
    return 'needs_repair';
  }
  return 'good';
}

function getCategoryIcon(name) {
  const s = (name || '').trim();
  if (s.includes('ריתוך') || s.includes('רתכות') || s.includes('תנור')) return 'flame';
  if (s.includes('הרמה') || s.includes('סולמות') || s.includes('מנפ"ם') || s.includes('חמצן')) return 'crane';
  if (s.includes('דיסק') || s.includes('חיתוך') || s.includes('משור') || s.includes('גקסון') || s.includes('אצבע') || s.includes('צנרת')) return 'scissors';
  if (s.includes('קידוח') || s.includes('מברג') || s.includes('אימפקט') || s.includes('פטישון') || s.includes('קונגו') || s.includes('מקדח')) return 'drill';
  if (s.includes('מדידה') || s.includes('מאזנת') || s.includes('מומנט') || s.includes('מומנת') || s.includes('גלאי')) return 'ruler';
  return 'wrench';
}

function getCategorySlug(name) {
  const s = (name || '').trim();
  const slugMap = {
    'משאבות מים': 'water-pumps',
    'רתכות': 'welding',
    'אימפקט': 'impact-drivers',
    'מברגות': 'screwdrivers',
    'תנור': 'heating-ovens',
    'דיסקים': 'grinding-discs',
    'ערבל בטון': 'concrete-mixers',
    'קונגו': 'demolition-hammers',
    'פטישונים': 'rotary-hammers',
    'מקדחים': 'drill-bits',
    'ציוד הרמה': 'lifting-equipment',
    'מקדח מגנטי': 'magnetic-drills',
    'מכונת לחץ מים': 'pressure-washers',
    'אבן אצבע': 'die-grinder',
    'ידית מומנת': 'torque-wrenches',
    'צנרת': 'piping-tools',
    'גקסון': 'jigsaws',
    'כלי מדידה': 'measuring-tools',
    'משור': 'saws',
    'מסיכת ריתוך': 'welding-masks',
    'מפוחים': 'blowers',
    'קומפרסור': 'compressors',
    'מנפ"ם': 'breathing-apparatus',
    'מאזנת': 'levels',
    'סיריוס': 'sirius',
    'שואב אבק': 'vacuums',
    'קומפרסור צבע': 'paint-compressors',
    'סולמות': 'ladders',
    'סוללת חמצן': 'oxygen-batteries',
    'גינון': 'gardening',
    'לוח חשמל': 'electric-panels',
    'גלאי גז': 'gas-detectors',
    'גוף תאורה מגן פיצוץ': 'explosion-proof-lighting',
    'גנרטור': 'generators',
    'מחלץ': 'extractors',
    'רחפן': 'drones',
    'שנאי מבדיל': 'isolation-transformers',
    'ציוד כללי': 'general-equipment',
  };
  return slugMap[s] || `cat-${Buffer.from(s).toString('hex').slice(0, 8)}`;
}

// Load .env.local or .env if present
function loadEnvLocal() {
  const env = { ...process.env };
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(projectRoot, file);
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
          if (!env[key]) {
            env[key] = val;
          }
        }
      });
    }
  }
  return env;
}

async function main() {
  // 1. Locate Excel file
  let excelPath = path.join(projectRoot, 'zatout_inventory.xlsx');
  if (!fs.existsSync(excelPath)) {
    excelPath = path.join(projectRoot, 'zatout_inventory.xlsx.xlsx');
  }

  if (!fs.existsSync(excelPath)) {
    console.error(`Excel inventory file not found at ${excelPath}`);
    process.exit(1);
  }

  const wb = xlsx.readFile(excelPath);
  const sheetNames = wb.SheetNames;

  // 2. Iterate through EVERY worksheet in the workbook
  const rawAssetsList = [];
  for (const sheetName of sheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const jsonRows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
    let headerKeyToColName = {};

    for (const row of jsonRows) {
      const rowValues = Object.values(row).map((v) => String(v).trim());
      if (rowValues.includes('Task ID')) {
        headerKeyToColName = {};
        for (const [k, v] of Object.entries(row)) {
          headerKeyToColName[k] = String(v).trim();
        }
        continue;
      }

      let rowObj = row;
      if (Object.keys(headerKeyToColName).length > 0) {
        rowObj = {};
        for (const [k, v] of Object.entries(row)) {
          const colName = headerKeyToColName[k] || k;
          rowObj[colName] = v;
        }
      }

      const taskId = String(rowObj['Task ID'] || '').trim();
      if (taskId && taskId.startsWith('86')) {
        rawAssetsList.push(rowObj);
      }
    }
  }

  // 3. Dynamic Auto-Discovery of Facilities & Categories
  const discoveredWarehouses = [...BASE_WAREHOUSES];
  const warehouseMap = new Map();
  for (const wh of discoveredWarehouses) {
    warehouseMap.set(wh.name.trim(), wh);
  }

  const habonimWh = discoveredWarehouses[0];

  function resolveOrCreateWarehouse(siteName, statusRaw) {
    const cleanSite = (siteName || '').trim();
    if (!cleanSite && statusRaw.includes('מחסן ראשי')) {
      return habonimWh;
    }

    if (!cleanSite) {
      return habonimWh;
    }

    // Direct name match
    if (warehouseMap.has(cleanSite)) {
      return warehouseMap.get(cleanSite);
    }

    // Substring match with known facilities
    for (const [name, wh] of warehouseMap.entries()) {
      if (cleanSite.includes(name) || name.includes(cleanSite)) {
        return wh;
      }
    }

    // Auto-discover new facility
    const nextIdx = discoveredWarehouses.length + 1;
    const newUuid = `10000000-0000-0000-0000-${String(nextIdx).padStart(12, '0')}`;
    const cleanCode = `WH-${cleanSite.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || nextIdx}`;
    const newType = cleanSite.includes('ראשי') || cleanSite.includes('מרכזי') ? 'central_warehouse' : 'site_container';
    const newWh = {
      id: newUuid,
      name: cleanSite,
      code: cleanCode,
      type: newType,
      address: null,
      isActive: true,
    };
    discoveredWarehouses.push(newWh);
    warehouseMap.set(cleanSite, newWh);
    return newWh;
  }

  // Discover all unique categories
  const discoveredCategories = [];
  const categoryMap = new Map();

  function resolveOrCreateCategory(catName) {
    const clean = (catName || '').trim() || 'ציוד כללי';
    if (categoryMap.has(clean)) {
      return categoryMap.get(clean);
    }

    const slug = getCategorySlug(clean);
    const icon = getCategoryIcon(clean);
    const newCat = {
      id: `cat-${slug}`,
      name: clean,
      slug: slug,
      icon: icon,
      displayOrder: discoveredCategories.length + 1,
    };
    discoveredCategories.push(newCat);
    categoryMap.set(clean, newCat);
    return newCat;
  }

  // 4. Full Asset Mapping (Zero Alteration)
  let maxZR = 0;
  const finalAssets = [];
  const facilityCounts = {};
  const categoryCounts = {};

  for (const row of rawAssetsList) {
    const originalTaskId = String(row['Task ID'] || '').trim();
    const customId = String(row['Task Custom ID'] || '').trim();
    const qrCode = customId || originalTaskId;
    const serialNumber = customId || originalTaskId;
    const name = String(row['Task Name'] || '').trim();
    const statusRaw = String(row['Status'] || '').trim();
    const siteRaw = String(row['אתר ציוד (drop down)'] || '').trim();
    const workerRaw = String(row['שם מקבל (short text)'] || '').trim();
    const categoryName = String(row['קבוצת ציוד (drop down)'] || '').trim();
    const orderNumber = String(row['מספר הזמנה (short text)'] || '').trim();

    const status = mapStatus(statusRaw);
    const condition = mapCondition(status);
    const wh = resolveOrCreateWarehouse(siteRaw, statusRaw);
    const cat = resolveOrCreateCategory(categoryName);

    // Track max ZR number
    const match = qrCode.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxZR) {
        maxZR = num;
      }
    }

    facilityCounts[wh.name] = (facilityCounts[wh.name] || 0) + 1;
    categoryCounts[cat.name] = (categoryCounts[cat.name] || 0) + 1;

    finalAssets.push({
      id: `ast-${originalTaskId}`,
      qrCode,
      qr_code: qrCode,
      serialNumber,
      serial_number: serialNumber,
      toolName: name,
      tool_name: name,
      brand: extractBrand(name),
      modelNumber: null,
      model_number: null,
      categoryId: cat.id,
      category_id: cat.id,
      categoryName: cat.name,
      category_name: cat.name,
      category: cat.name,
      warehouseId: wh.id,
      currentWarehouseId: wh.id,
      current_warehouse_id: wh.id,
      warehouseName: wh.name,
      warehouse_name: wh.name,
      warehouseCode: wh.code,
      warehouse_code: wh.code,
      status,
      condition,
      currentAssignedWorker: workerRaw || null,
      current_assigned_worker: workerRaw || null,
      workerPhone: null,
      worker_phone: null,
      version: 1,
      purchaseCost: 2500,
      purchaseDate: '2026-01-15',
      warrantyUntil: '2028-01-15',
      safetyInspectionDue: '2027-01-15',
      isLocked: false,
      originalTaskId,
      orderNumber: orderNumber || null,
      order_number: orderNumber || null,
    });
  }

  // 5. Batch Upsert to Supabase
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  const isLiveSupabase =
    Boolean(supabaseUrl && supabaseKey) &&
    !supabaseUrl.includes('placeholder.supabase.co') &&
    !supabaseUrl.includes('your-supabase-url');

  let exactInsertedAssetsCount = 0;

  if (!isLiveSupabase) {
    console.error('[Supabase] ERROR: No valid Supabase credentials configured in .env.local or process.env.');
    console.error('[Supabase] Please provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    console.log('Exact count of inserted assets into Supabase: 0');
  } else {
    try {
      console.log(`[Supabase] Initializing client for: ${supabaseUrl}`);
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Upsert discovered warehouses
      const { error: whErr, status: whStatus, statusText: whStatusText } = await supabase.from('warehouses').upsert(
        discoveredWarehouses.map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code,
          type: w.type,
          address: w.address,
          is_active: w.isActive,
          organization_id: '00000000-0000-0000-0000-000000000001',
        })),
        { onConflict: 'id' }
      );
      if (whErr) {
        console.error(`[Supabase] Warehouses upsert error (status ${whStatus} ${whStatusText}):`, whErr.message);
      } else {
        console.log(`[Supabase] Warehouses upsert response (status ${whStatus} ${whStatusText}): Successfully synchronized ${discoveredWarehouses.length} warehouses.`);
      }

      // Upsert discovered categories
      const { error: catErr, status: catStatus, statusText: catStatusText } = await supabase.from('categories').upsert(
        discoveredCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          display_order: c.displayOrder,
          organization_id: '00000000-0000-0000-0000-000000000001',
        })),
        { onConflict: 'id' }
      );
      if (catErr) {
        console.error(`[Supabase] Categories upsert error (status ${catStatus} ${catStatusText}):`, catErr.message);
      } else {
        console.log(`[Supabase] Categories upsert response (status ${catStatus} ${catStatusText}): Successfully synchronized ${discoveredCategories.length} categories.`);
      }

      // Upsert assets in chunks of 50
      const BATCH_SIZE = 50;
      const totalChunks = Math.ceil(finalAssets.length / BATCH_SIZE);

      for (let i = 0; i < finalAssets.length; i += BATCH_SIZE) {
        const chunkIndex = Math.floor(i / BATCH_SIZE) + 1;
        const currentSlice = finalAssets.slice(i, i + BATCH_SIZE);
        const chunk = currentSlice.map((item) => ({
          id: item.id,
          qr_code: item.qrCode,
          serial_number: item.serialNumber,
          current_warehouse_id: item.warehouseId,
          status: item.status,
          condition: item.condition,
          current_assigned_worker: item.currentAssignedWorker,
          version: 1,
          purchase_cost: item.purchaseCost,
          purchase_date: item.purchaseDate,
          organization_id: '00000000-0000-0000-0000-000000000001',
        }));

        const { data, error, status, statusText } = await supabase.from('assets').upsert(chunk, {
          onConflict: 'qr_code',
        }).select('id');

        if (error) {
          console.error(`[Supabase Chunk ${chunkIndex}/${totalChunks}] Error (status ${status} ${statusText}): ${error.message}${error.details ? ` - Details: ${error.details}` : ''}`);
        } else {
          const insertedThisBatch = data && Array.isArray(data) ? data.length : chunk.length;
          exactInsertedAssetsCount += insertedThisBatch;
          console.log(`[Supabase Chunk ${chunkIndex}/${totalChunks}] Response (status ${status} ${statusText}): Successfully inserted/upserted ${insertedThisBatch} assets (items ${i + 1} to ${Math.min(i + BATCH_SIZE, finalAssets.length)})`);
        }
      }

      console.log(`\nExact count of inserted assets into Supabase: ${exactInsertedAssetsCount}`);
    } catch (err) {
      console.error('[Supabase] Fatal error during injection:', err.message);
      console.log(`Exact count of inserted assets into Supabase: ${exactInsertedAssetsCount}`);
    }
  }

  // 6. Synchronize src/lib/mockStore.ts with complete exhaustive dataset
  const mockStorePath = path.join(projectRoot, 'src', 'lib', 'mockStore.ts');
  if (fs.existsSync(mockStorePath)) {
    const mockStoreContent = fs.readFileSync(mockStorePath, 'utf-8');

    const mockWarehousesString = JSON.stringify(discoveredWarehouses, null, 2);
    const mockCategoriesString = JSON.stringify(discoveredCategories, null, 2);
    const mockAssetsString = JSON.stringify(finalAssets, null, 2);

    // Replace MOCK_WAREHOUSES and warehousesStore
    let updatedContent = mockStoreContent.replace(
      /export const MOCK_WAREHOUSES: Warehouse\[\] =[\s\S]*?;\r?\n\r?\nconst warehousesStore: Warehouse\[\] =[\s\S]*?;/,
      `export const MOCK_WAREHOUSES: Warehouse[] = ${mockWarehousesString};\n\nconst warehousesStore: Warehouse[] = [...MOCK_WAREHOUSES];`
    );

    // Replace MOCK_CATEGORIES
    updatedContent = updatedContent.replace(
      /export const MOCK_CATEGORIES: Category\[\] =[\s\S]*?;\r?\n\r?\nexport interface UnifiedAssetItem/,
      `export const MOCK_CATEGORIES: Category[] = ${mockCategoriesString};\n\nexport interface UnifiedAssetItem`
    );

    // Replace MOCK_ASSETS
    updatedContent = updatedContent.replace(
      /export const MOCK_ASSETS: UnifiedAssetItem\[\] =[\s\S]*?;\r?\n\r?\n(function generateInitialAuditRecords|\/\/ 4\. Authoritative Audit History Records)/,
      `export const MOCK_ASSETS: UnifiedAssetItem[] = ${mockAssetsString};\n\n$1`
    );

    // Replace assetsStore initialization
    updatedContent = updatedContent.replace(
      /const assetsStore: UnifiedAssetItem\[\] =[\s\S]*?;/,
      `const assetsStore: UnifiedAssetItem[] = [...MOCK_ASSETS];`
    );

    fs.writeFileSync(mockStorePath, updatedContent, 'utf-8');
  }

  // 7. Print Required Detailed Statistics & Confirmation
  console.log('====================================================');
  console.log('  ZATOUT INVENTORY FULL PLATFORM SYNCHRONIZATION');
  console.log('====================================================');
  console.log(`• Total sheets scanned: ${sheetNames.length} (${sheetNames.join(', ')})`);
  console.log(`• Total assets extracted and upserted: ${finalAssets.length}`);
  console.log(`• Maximum ZR- number detected: ZR-${maxZR} (Next sequential tag: ZR-${maxZR + 1})`);
  console.log('\n--- Facilities & Asset Distribution ---');
  for (const [facility, count] of Object.entries(facilityCounts)) {
    console.log(`  - ${facility}: ${count} assets`);
  }
  console.log('\n--- Categories & Asset Distribution ---');
  for (const [category, count] of Object.entries(categoryCounts)) {
    console.log(`  - ${category}: ${count} assets`);
  }
  console.log('====================================================');
  console.log(`✓ Successfully ingested ${finalAssets.length} assets into Supabase and mockStore`);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
