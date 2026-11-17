import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const MAIN_WAREHOUSE_DEFAULT_NAME = 'הבונים';

// Parse CLI flags
const args = process.argv.slice(2);
const hasExecuteFlag = args.includes('--execute');
const hasDryRunFlag = args.includes('--dry-run');
const isDryRun = hasDryRunFlag || !hasExecuteFlag;

if (hasDryRunFlag && hasExecuteFlag) {
  console.error('ERROR: Cannot pass both --dry-run and --execute.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers: Env Loading, Normalization, Brand/Status/Category Mapping
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
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
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
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

/**
 * Normalizes site/warehouse names:
 * - Converts Hebrew gershayim (״), typographic quotes (“ ” „ ″), and doubled single quotes ('') to ASCII "
 * - Converts Hebrew geresh (׳) and curly apostrophes (‘ ’ ′) to ASCII '
 * - Collapses whitespace and trims
 */
function normalizeSiteName(raw) {
  return String(raw || '')
    .replace(/[\u05F4\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/''/g, '"')
    .replace(/[\u05F3\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(raw) {
  const s = String(raw ?? '').trim();
  return s.length > 0 ? s : null;
}

/**
 * Canonical Asset Status Contract (matches src/lib/assets/status.ts):
 * - מחסן ראשי -> available (NEVER 'in_stock')
 * - בשימוש     -> checked_out
 * - בתיקון     -> maintenance
 * - צריך תיקון -> maintenance (with condition = 'needs_repair')
 */
function mapExcelStatus(statusRaw) {
  const s = String(statusRaw || '').trim();
  if (s === 'צריך תיקון' || s.includes('צריך תיקון')) {
    return { status: 'maintenance', condition: 'needs_repair', excelStatus: s };
  }
  if (s === 'בתיקון' || s.includes('בתיקון')) {
    return { status: 'maintenance', condition: 'needs_repair', excelStatus: s };
  }
  if (s === 'בשימוש' || s.includes('בשימוש')) {
    return { status: 'checked_out', condition: 'good', excelStatus: s };
  }
  if (s === 'מחסן ראשי' || s.includes('מחסן ראשי')) {
    return { status: 'available', condition: 'good', excelStatus: s };
  }
  throw new Error(`Unrecognized Excel status value: "${s}"`);
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
  if (t.includes('ewm')) return 'EWM';
  if (t.includes('tecmen') || t.includes('teckmen')) return 'Tecmen';
  if (t.includes('zika') || t.includes('זיקה')) return 'Zika';
  return 'Zatout';
}

function generateWarehouseCode(siteName, usedCodes) {
  const presetCodes = {
    'קסם': 'WH-KSM',
    'ים המלח': 'WH-DSM',
    'חגית אורות פנינה': 'WH-HGT-OP',
  };
  let candidate = presetCodes[siteName];
  if (!candidate) {
    const ascii = siteName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    if (ascii) {
      candidate = `WH-${ascii}`;
    } else {
      const hash = crypto.createHash('md5').update(siteName).digest('hex').slice(0, 4).toUpperCase();
      candidate = `WH-${hash}`;
    }
  }
  let finalCode = candidate;
  let suffix = 2;
  while (usedCodes.has(finalCode)) {
    finalCode = `${candidate}-${suffix++}`;
  }
  usedCodes.add(finalCode);
  return finalCode;
}

function locateExcelFile() {
  const candidates = [
    path.join(__dirname, 'sami_zatout_latest.xlsx'),
    path.join(__dirname, 'sami_zatout_latest.xlsx.xlsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Excel file not found. Checked:\n  - ${candidates.join('\n  - ')}`
  );
}

// ---------------------------------------------------------------------------
// Excel Parser (Handles all 4 ClickUp sections & 'X' placeholder rows)
// ---------------------------------------------------------------------------

function parseExcelInventory(excelPath) {
  const wb = xlsx.readFile(excelPath);
  const parsedRows = [];
  const sectionCounts = {};
  let placeholderXCount = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    let activeHeaders = null;
    let currentSection = 'UNKNOWN';

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const trimmedCells = row.map((c) => String(c ?? '').trim());

      // Detect header row
      if (trimmedCells.includes('Task ID') && trimmedCells.includes('Task Custom ID')) {
        activeHeaders = trimmedCells;
        continue;
      }

      // Skip blank rows
      if (trimmedCells.every((c) => c === '')) {
        continue;
      }

      // Detect section header row (single non-empty cell in col 0, rest empty)
      const nonEmptyCount = trimmedCells.filter((c) => c !== '').length;
      if (nonEmptyCount === 1 && !trimmedCells[1]) {
        currentSection = trimmedCells[0];
        continue;
      }

      if (!activeHeaders) continue;

      const rowObj = {};
      activeHeaders.forEach((colName, idx) => {
        if (colName) rowObj[colName] = row[idx] ?? '';
      });

      const taskId = String(rowObj['Task ID'] || '').trim();
      const customId = String(rowObj['Task Custom ID'] || '').trim();
      if (!taskId || !customId.startsWith('ZR-')) {
        continue;
      }

      const taskName = String(rowObj['Task Name'] || '').trim();
      if (taskName.toUpperCase() === 'X') {
        placeholderXCount++;
      }

      const statusRaw = String(rowObj['Status'] || '').trim();
      sectionCounts[statusRaw] = (sectionCounts[statusRaw] || 0) + 1;

      parsedRows.push({
        excelRowNum: i + 1,
        section: currentSection,
        originalTaskId: taskId,
        qrCode: customId,
        tagNumber: customId,
        name: taskName,
        statusRaw,
        siteRaw: String(rowObj['אתר ציוד (drop down)'] || ''),
        workerRaw: String(rowObj['שם מקבל (short text)'] || ''),
        categoryRaw: String(rowObj['קבוצת ציוד (drop down)'] || ''),
        orderNumberRaw: String(rowObj['מספר הזמנה (short text)'] || ''),
      });
    }
  }

  return { sheetNames: wb.SheetNames, parsedRows, sectionCounts, placeholderXCount };
}

// ---------------------------------------------------------------------------
// Paginated Read-Only Supabase Fetchers
// ---------------------------------------------------------------------------

async function fetchAllOrgAssets(supabase) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('organization_id', ORG_ID)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to SELECT assets: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Main Sync Logic
// ---------------------------------------------------------------------------

async function main() {
  const modeLabel = isDryRun ? 'READ-ONLY --dry-run' : 'LIVE --execute';
  console.log('====================================================================');
  console.log(`  SAMI ZATOUT EXCEL -> SUPABASE SYNC [${modeLabel}]`);
  console.log(`  Organization ID: ${ORG_ID}`);
  console.log('====================================================================\n');

  // 1. Parse Excel
  const excelPath = locateExcelFile();
  console.log(`[1] Reading Excel file: ${path.relative(projectRoot, excelPath)}`);
  const { sheetNames, parsedRows, sectionCounts, placeholderXCount } = parseExcelInventory(excelPath);

  console.log(`    Sheets scanned: ${sheetNames.join(', ')}`);
  console.log(`    Total rows parsed from Excel: ${parsedRows.length} (including ${placeholderXCount} 'X' placeholder rows)`);
  console.log('    Status section breakdown:');
  for (const [st, count] of Object.entries(sectionCounts)) {
    console.log(`      - ${st}: ${count}`);
  }

  // Verify no duplicate ZR-XXXX in Excel
  const excelQrMap = new Map();
  const duplicateQrs = [];
  for (const r of parsedRows) {
    if (excelQrMap.has(r.qrCode)) {
      duplicateQrs.push({ qrCode: r.qrCode, row1: excelQrMap.get(r.qrCode).excelRowNum, row2: r.excelRowNum });
    } else {
      excelQrMap.set(r.qrCode, r);
    }
  }
  if (duplicateQrs.length > 0) {
    throw new Error(`Duplicate Task Custom IDs in Excel: ${JSON.stringify(duplicateQrs)}`);
  }

  // 2. Connect to Supabase & Inspect Live Schema (Read-Only SELECT)
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local / process.env');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n[2] Inspecting live Supabase schema & state (read-only SELECT)...');

  const { data: liveWarehouses, error: whErr } = await supabase
    .from('warehouses')
    .select('*')
    .eq('organization_id', ORG_ID)
    .order('created_at', { ascending: true });
  if (whErr) throw new Error(`Failed to SELECT warehouses: ${whErr.message}`);

  const liveAssets = await fetchAllOrgAssets(supabase);

  const { data: liveTransferRequests, error: trErr } = await supabase
    .from('transfer_requests')
    .select('id, asset_id, status, source_warehouse_id, target_warehouse_id, created_at')
    .eq('organization_id', ORG_ID);
  if (trErr) throw new Error(`Failed to SELECT transfer_requests: ${trErr.message}`);

  const { data: liveCategories, error: catErr } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('organization_id', ORG_ID);
  if (catErr) throw new Error(`Failed to SELECT categories: ${catErr.message}`);

  // Schema column verification
  const assetColumns = liveAssets.length > 0 ? new Set(Object.keys(liveAssets[0])) : new Set();
  const warehouseColumns = liveWarehouses.length > 0 ? new Set(Object.keys(liveWarehouses[0])) : new Set();

  const categoryColumn = assetColumns.has('category_name')
    ? 'category_name'
    : assetColumns.has('category')
    ? 'category'
    : null;

  const requiredAssetCols = [
    'qr_code',
    'tag_number',
    'serial_number',
    'name',
    'order_number',
    'current_warehouse_id',
    'current_assigned_worker',
    'status',
    'condition',
    'organization_id',
  ];
  const missingCols = requiredAssetCols.filter((c) => assetColumns.size > 0 && !assetColumns.has(c));
  if (!categoryColumn || missingCols.length > 0) {
    throw new Error(`Live schema mismatch! categoryColumn=${categoryColumn}, missingCols=${missingCols.join(',')}`);
  }

  console.log(`    Live warehouses fetched: ${liveWarehouses.length} (columns: ${[...warehouseColumns].join(', ')})`);
  console.log(`    Live assets fetched: ${liveAssets.length} (verified ${assetColumns.size} columns, category col = "${categoryColumn}")`);
  console.log(`    Live categories fetched: ${(liveCategories || []).length}`);
  console.log(`    Live transfer_requests fetched: ${(liveTransferRequests || []).length}`);

  // 3. Warehouse Resolution (Exact Normalized Match; Empty -> הבונים)
  const warehouseByNormName = new Map();
  const warehouseById = new Map();
  const usedWhCodes = new Set();

  for (const wh of liveWarehouses) {
    const norm = normalizeSiteName(wh.name);
    warehouseByNormName.set(norm, wh);
    warehouseById.set(wh.id, wh);
    if (wh.code) usedWhCodes.add(wh.code);
  }

  const mainWarehouse =
    warehouseByNormName.get(normalizeSiteName(MAIN_WAREHOUSE_DEFAULT_NAME)) ||
    liveWarehouses.find((w) => w.type === 'central_warehouse') ||
    liveWarehouses[0];

  if (!mainWarehouse) {
    throw new Error(`Main warehouse ("${MAIN_WAREHOUSE_DEFAULT_NAME}") not found in Supabase!`);
  }

  const newWarehousesToCreate = [];
  const newWarehouseVirtualMap = new Map(); // normalizedSiteName -> virtual/new warehouse object
  let emptySiteMappedCount = 0;

  function resolveWarehouseForSite(rawSite) {
    const normSite = normalizeSiteName(rawSite);
    if (!normSite) {
      emptySiteMappedCount++;
      return mainWarehouse;
    }
    if (warehouseByNormName.has(normSite)) {
      return warehouseByNormName.get(normSite);
    }
    if (newWarehouseVirtualMap.has(normSite)) {
      return newWarehouseVirtualMap.get(normSite);
    }
    const newWh = {
      id: `VIRTUAL_NEW_WH::${normSite}`,
      name: normSite,
      code: generateWarehouseCode(normSite, usedWhCodes),
      type: 'site_container',
      address: normSite,
      is_active: true,
      organization_id: ORG_ID,
      _isNew: true,
      _excelAssetCount: 0,
    };
    newWarehousesToCreate.push(newWh);
    newWarehouseVirtualMap.set(normSite, newWh);
    return newWh;
  }

  // First pass: resolve warehouses for all Excel rows
  const targetRecords = parsedRows.map((row) => {
    const wh = resolveWarehouseForSite(row.siteRaw);
    if (wh._isNew) wh._excelAssetCount++;

    const { status, condition, excelStatus } = mapExcelStatus(row.statusRaw);
    const workerTrimmed = normalizeText(row.workerRaw);
    // Available assets in main warehouse must have null worker to satisfy checkout eligibility contract
    const targetWorker = status === 'available' ? null : workerTrimmed;

    const categoryName = normalizeText(row.categoryRaw) || 'ציוד כללי';
    const orderNumber = normalizeText(row.orderNumberRaw);

    return {
      ...row,
      targetStatus: status,
      targetCondition: condition,
      excelStatus,
      targetWarehouse: wh,
      targetWorker,
      targetCategory: categoryName,
      targetOrderNumber: orderNumber,
      targetBrand: extractBrand(row.name),
      workerClearedBecauseAvailable: status === 'available' && workerTrimmed !== null,
    };
  });

  // 4. Index Live Assets & Compute Diffs
  const liveByQr = new Map();
  const liveById = new Map();
  for (const a of liveAssets) {
    liveById.set(a.id, a);
    const key = String(a.qr_code || a.tag_number || '').trim();
    if (key) liveByQr.set(key, a);
  }

  const inserts = [];
  const updates = [];
  const unchanged = [];
  const workerAnomaliesCleared = [];

  const updateBreakdown = {
    statusChanges: 0,
    statusTransitions: {}, // e.g. "in_stock -> available": count
    warehouseChanges: 0,
    workerChanges: 0,
    nameChanges: 0,
    categoryChanges: 0,
    orderNumberChanges: 0,
    conditionChanges: 0,
    originalTaskIdChanges: 0,
  };

  for (const target of targetRecords) {
    if (target.workerClearedBecauseAvailable) {
      workerAnomaliesCleared.push({
        qrCode: target.qrCode,
        excelStatus: target.excelStatus,
        rawWorker: target.workerRaw.trim(),
      });
    }

    const existing = liveByQr.get(target.qrCode);
    if (!existing) {
      inserts.push(target);
      continue;
    }

    const diffs = {};
    let hasChange = false;

    if ((existing.status || '') !== target.targetStatus) {
      hasChange = true;
      diffs.status = { from: existing.status, to: target.targetStatus };
      updateBreakdown.statusChanges++;
      const tKey = `${existing.status} -> ${target.targetStatus}`;
      updateBreakdown.statusTransitions[tKey] = (updateBreakdown.statusTransitions[tKey] || 0) + 1;
    }

    if ((existing.current_warehouse_id || '') !== target.targetWarehouse.id) {
      hasChange = true;
      const fromWhName = warehouseById.get(existing.current_warehouse_id)?.name || existing.current_warehouse_id;
      diffs.warehouse = { from: fromWhName, to: target.targetWarehouse.name };
      updateBreakdown.warehouseChanges++;
    }

    const existingWorker = normalizeText(existing.current_assigned_worker);
    if (existingWorker !== target.targetWorker) {
      hasChange = true;
      diffs.worker = { from: existingWorker, to: target.targetWorker };
      updateBreakdown.workerChanges++;
    }

    if (String(existing.name || '').trim() !== target.name) {
      hasChange = true;
      diffs.name = { from: existing.name, to: target.name };
      updateBreakdown.nameChanges++;
    }

    const existingCategory = normalizeText(existing[categoryColumn]);
    if (existingCategory !== target.targetCategory) {
      hasChange = true;
      diffs.category = { from: existingCategory, to: target.targetCategory };
      updateBreakdown.categoryChanges++;
    }

    const existingOrder = normalizeText(existing.order_number);
    if (existingOrder !== target.targetOrderNumber) {
      hasChange = true;
      diffs.orderNumber = { from: existingOrder, to: target.targetOrderNumber };
      updateBreakdown.orderNumberChanges++;
    }

    // Only update condition if transitioning into maintenance/needs_repair, or clearing needs_repair when now healthy
    let nextCondition = existing.condition || 'good';
    if (target.targetCondition === 'needs_repair') {
      nextCondition = 'needs_repair';
    } else if (existing.condition === 'needs_repair' || !existing.condition) {
      nextCondition = 'good';
    }
    if ((existing.condition || null) !== nextCondition) {
      hasChange = true;
      diffs.condition = { from: existing.condition, to: nextCondition };
      updateBreakdown.conditionChanges++;
    }

    if (normalizeText(existing.original_task_id) !== target.originalTaskId) {
      hasChange = true;
      diffs.originalTaskId = { from: existing.original_task_id, to: target.originalTaskId };
      updateBreakdown.originalTaskIdChanges++;
    }

    if (hasChange) {
      updates.push({ existing, target, diffs, nextCondition });
    } else {
      unchanged.push(existing);
    }
  }

  // Existing Supabase assets NOT in Excel
  const missingFromExcel = liveAssets.filter(
    (a) => !excelQrMap.has(String(a.qr_code || a.tag_number || '').trim())
  );

  // Active transfer_requests check
  const ACTIVE_TR_STATUSES = new Set(['PENDING', 'APPROVED', 'IN_TRANSIT', 'pending', 'approved', 'in_transit']);
  const activeTransferConflicts = [];
  for (const tr of liveTransferRequests || []) {
    if (!ACTIVE_TR_STATUSES.has(tr.status)) continue;
    const liveAsset = liveById.get(tr.asset_id);
    const qr = liveAsset ? String(liveAsset.qr_code || liveAsset.tag_number || '').trim() : null;
    const excelMatch = qr ? targetRecords.find((t) => t.qrCode === qr) : null;
    if (excelMatch) {
      activeTransferConflicts.push({
        transferRequestId: tr.id,
        transferStatus: tr.status,
        assetId: tr.asset_id,
        qrCode: qr,
        excelStatus: excelMatch.targetStatus,
      });
    } else {
      activeTransferConflicts.push({
        transferRequestId: tr.id,
        transferStatus: tr.status,
        assetId: tr.asset_id,
        qrCode: qr || '(unknown)',
        excelStatus: '(not in excel)',
      });
    }
  }

  // New categories check
  const existingCatNames = new Set((liveCategories || []).map((c) => normalizeText(c.name)));
  const newCategoriesNeeded = [];
  const seenNewCats = new Set();
  for (const t of targetRecords) {
    if (!existingCatNames.has(t.targetCategory) && !seenNewCats.has(t.targetCategory)) {
      seenNewCats.add(t.targetCategory);
      newCategoriesNeeded.push(t.targetCategory);
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation Report Output
  // ---------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log('  RECONCILIATION REPORT');
  console.log('====================================================================');
  console.log(`1. Total rows parsed from Excel:              ${parsedRows.length}`);
  console.log(`   - Including 'X' placeholder rows:          ${placeholderXCount}`);
  console.log(`   - Blank site mapped to '${mainWarehouse.name}':       ${emptySiteMappedCount}`);
  console.log(`2. New warehouses to auto-create:             ${newWarehousesToCreate.length}`);
  if (newWarehousesToCreate.length > 0) {
    for (const nw of newWarehousesToCreate) {
      console.log(`   - "${nw.name}" (code: ${nw.code}, type: ${nw.type}, assets: ${nw._excelAssetCount})`);
    }
  }
  console.log(`3. New categories not yet in categories tbl:  ${newCategoriesNeeded.length}`);
  if (newCategoriesNeeded.length > 0) {
    console.log(`   - ${newCategoriesNeeded.join(', ')}`);
  }
  console.log(`4. NEW ZR-XXXX assets to INSERT:              ${inserts.length}`);
  if (inserts.length > 0) {
    const newXCount = inserts.filter((i) => i.name.toUpperCase() === 'X').length;
    console.log(`   - Non-X new assets: ${inserts.length - newXCount}, 'X' placeholder new assets: ${newXCount}`);
    console.log(`   - Sample inserts (up to 15):`);
    for (const ins of inserts.slice(0, 15)) {
      console.log(`     * ${ins.qrCode} | ${ins.targetStatus} | wh="${ins.targetWarehouse.name}" | cat="${ins.targetCategory}" | ${ins.name}`);
    }
    if (inserts.length > 15) {
      console.log(`     ... and ${inserts.length - 15} more.`);
    }
  }
  console.log(`5. EXISTING ZR-XXXX assets to UPDATE:         ${updates.length} (Unchanged: ${unchanged.length})`);
  console.log('   Breakdown of field changes across updates:');
  console.log(`   - status changes:           ${updateBreakdown.statusChanges}`);
  for (const [trans, cnt] of Object.entries(updateBreakdown.statusTransitions)) {
    console.log(`       • ${trans}: ${cnt}`);
  }
  console.log(`   - warehouse changes:        ${updateBreakdown.warehouseChanges}`);
  console.log(`   - worker changes:           ${updateBreakdown.workerChanges}`);
  console.log(`   - condition changes:        ${updateBreakdown.conditionChanges}`);
  console.log(`   - name changes:             ${updateBreakdown.nameChanges}`);
  console.log(`   - category_name changes:    ${updateBreakdown.categoryChanges}`);
  console.log(`   - order_number changes:     ${updateBreakdown.orderNumberChanges}`);
  console.log(`   - original_task_id changes: ${updateBreakdown.originalTaskIdChanges}`);

  if (updates.length > 0) {
    console.log('   Sample updates (up to 15):');
    for (const u of updates.slice(0, 15)) {
      const diffStr = Object.entries(u.diffs)
        .map(([k, v]) => `${k}: ${JSON.stringify(v.from)} -> ${JSON.stringify(v.to)}`)
        .join(' | ');
      console.log(`     * ${u.target.qrCode}: ${diffStr}`);
    }
    if (updates.length > 15) {
      console.log(`     ... and ${updates.length - 15} more.`);
    }
  }

  console.log(`6. Existing Supabase assets NOT in Excel:     ${missingFromExcel.length}`);
  if (missingFromExcel.length > 0) {
    for (const m of missingFromExcel.slice(0, 20)) {
      console.log(`   - ${m.qr_code} | ${m.status} | ${m.name}`);
    }
    if (missingFromExcel.length > 20) {
      console.log(`   ... and ${missingFromExcel.length - 20} more.`);
    }
  }

  console.log(`7. Active transfer_requests conflicts:        ${activeTransferConflicts.length}`);
  if (activeTransferConflicts.length > 0) {
    for (const c of activeTransferConflicts) {
      console.log(`   - TR ${c.transferRequestId} (${c.transferStatus}) -> ${c.qrCode} (Excel status: ${c.excelStatus})`);
    }
  }

  if (workerAnomaliesCleared.length > 0) {
    console.log(`8. Data-hygiene notes (available w/ worker):  ${workerAnomaliesCleared.length}`);
    for (const a of workerAnomaliesCleared) {
      console.log(`   - ${a.qrCode}: Excel status="${a.excelStatus}", worker="${a.rawWorker}" -> cleared to null for canonical 'available'`);
    }
  }

  // ---------------------------------------------------------------------------
  // Dry-Run Stop OR Live Execute
  // ---------------------------------------------------------------------------
  if (isDryRun) {
    console.log('\n[DRY-RUN COMPLETE] Zero rows written, inserted, updated, or deleted in Supabase.');
    return;
  }

  // LIVE EXECUTION MODE (--execute explicitly passed)
  console.log('\n[EXECUTING LIVE SYNC TO SUPABASE]...');

  // Step A: Auto-create missing warehouses
  const createdWarehouseMap = new Map();
  if (newWarehousesToCreate.length > 0) {
    const whPayload = newWarehousesToCreate.map((nw) => ({
      name: nw.name,
      code: nw.code,
      type: nw.type,
      address: nw.address,
      is_active: true,
      organization_id: ORG_ID,
    }));
    const { data: insertedWhs, error: insWhErr } = await supabase
      .from('warehouses')
      .insert(whPayload)
      .select('id, name, code');
    if (insWhErr) throw new Error(`Failed inserting new warehouses: ${insWhErr.message}`);
    for (const w of insertedWhs || []) {
      createdWarehouseMap.set(normalizeSiteName(w.name), w.id);
    }
    console.log(`  ✓ Created ${insertedWhs?.length || 0} new warehouses.`);
  }

  // Resolve final UUID for every target warehouse
  const resolveFinalWarehouseId = (wh) => {
    if (!wh._isNew) return wh.id;
    const realId = createdWarehouseMap.get(normalizeSiteName(wh.name));
    if (!realId) throw new Error(`Missing created warehouse ID for "${wh.name}"`);
    return realId;
  };

  // Step B: Insert any new categories
  if (newCategoriesNeeded.length > 0) {
    const catPayload = newCategoriesNeeded.map((name, idx) => ({
      name,
      slug: `cat-${crypto.createHash('md5').update(name).digest('hex').slice(0, 8)}`,
      icon: 'Wrench',
      display_order: (liveCategories?.length || 0) + idx + 1,
      organization_id: ORG_ID,
    }));
    const { error: insCatErr } = await supabase.from('categories').insert(catPayload);
    if (insCatErr) {
      console.warn(`  ! Warning inserting categories: ${insCatErr.message}`);
    } else {
      console.log(`  ✓ Created ${catPayload.length} new categories.`);
    }
  }

  // Step C: Insert NEW assets in chunks of 50 + initial ONBOARD custody_ledger entry
  const BATCH_SIZE = 50;
  let insertedCount = 0;
  let onboardLedgerCount = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const slice = inserts.slice(i, i + BATCH_SIZE);
    const payload = slice.map((t) => ({
      qr_code: t.qrCode,
      tag_number: t.tagNumber,
      serial_number: t.qrCode,
      name: t.name,
      brand: t.targetBrand,
      [categoryColumn]: t.targetCategory,
      order_number: t.targetOrderNumber,
      original_task_id: t.originalTaskId,
      current_warehouse_id: resolveFinalWarehouseId(t.targetWarehouse),
      current_assigned_worker: t.targetWorker,
      status: t.targetStatus,
      condition: t.targetCondition,
      version: 1,
      is_locked: false,
      organization_id: ORG_ID,
    }));
    const { data, error } = await supabase
      .from('assets')
      .insert(payload)
      .select('id, qr_code, current_warehouse_id, current_assigned_worker');
    if (error) throw new Error(`Insert batch failed at ${i}: ${error.message}`);
    const insertedRows = data || [];
    if (insertedRows.length !== payload.length) {
      throw new Error(`Insert batch mismatch at ${i}: expected ${payload.length}, got ${insertedRows.length}`);
    }
    insertedCount += insertedRows.length;

    const ledgerPayload = insertedRows.map((asset) => ({
      asset_id: asset.id,
      action: 'ONBOARD',
      warehouse_id: asset.current_warehouse_id,
      worker_name: asset.current_assigned_worker || null,
      performed_by: 'Excel Sync Script',
      notes: 'קליטת כלי מרשימת ציוד מעודכנת',
      organization_id: ORG_ID,
    }));
    const { error: ledgerErr } = await supabase.from('custody_ledger').insert(ledgerPayload);
    if (ledgerErr) {
      throw new Error(`Insert custody_ledger ONBOARD batch failed at ${i}: ${ledgerErr.message}`);
    }
    onboardLedgerCount += ledgerPayload.length;
  }
  console.log(`  ✓ Inserted ${insertedCount} new assets.`);
  console.log(`  ✓ Inserted ${onboardLedgerCount} initial ONBOARD entries into custody_ledger.`);

  // Step D: Update EXISTING assets that changed (per-row safe update scoped by id + organization_id)
  let updatedCount = 0;
  for (const u of updates) {
    const t = u.target;
    const patch = {
      name: t.name,
      [categoryColumn]: t.targetCategory,
      order_number: t.targetOrderNumber,
      original_task_id: t.originalTaskId,
      current_warehouse_id: resolveFinalWarehouseId(t.targetWarehouse),
      current_assigned_worker: t.targetWorker,
      status: t.targetStatus,
      condition: u.nextCondition,
      version: (u.existing.version || 1) + 1,
    };
    const { data: updData, error } = await supabase
      .from('assets')
      .update(patch)
      .eq('id', u.existing.id)
      .eq('organization_id', ORG_ID)
      .select('id');
    if (error) throw new Error(`Update failed for ${t.qrCode} (${u.existing.id}): ${error.message}`);
    if (!updData || updData.length !== 1) {
      throw new Error(`Update affected unexpected row count for ${t.qrCode} (${u.existing.id}): ${updData?.length ?? 0}`);
    }
    updatedCount++;
  }
  console.log(`  ✓ Updated ${updatedCount} existing assets.`);
  console.log('\n[LIVE SYNC COMPLETE]');
}

main().catch((err) => {
  console.error('\n[SYNC FAILED]:', err);
  process.exit(1);
});

