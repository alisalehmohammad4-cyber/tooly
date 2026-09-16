/**
 * Comprehensive Israeli Construction Tool & Jobsite Dictionary
 * Maps Hebrew jobsite slang and terminology to English equipment specifications,
 * brand names, and tool categories.
 */
export const TOOL_DICTIONARY: Record<string, string[]> = {
  // --- Brands ---
  'דוולט': ['dewalt', 'dwt'],
  'דיוולט': ['dewalt', 'dwt'],
  'די-וולט': ['dewalt'],
  'די וולט': ['dewalt'],
  'דיוואלט': ['dewalt'],
  'dewalt': ['דוולט', 'דיוולט'],

  'מקיטה': ['makita'],
  'מאקיטה': ['makita'],
  'makita': ['מקיטה'],

  'בוש': ['bosch'],
  'בושש': ['bosch'],
  'bosch': ['בוש'],

  'מילווקי': ['milwaukee'],
  'מילוקי': ['milwaukee'],
  'מילוואקי': ['milwaukee'],
  'milwaukee': ['מילווקי'],

  'הילטי': ['hilti'],
  'הילתי': ['hilti'],
  'hilti': ['הילטי'],

  'שטיל': ['stihl'],
  'שתיל': ['stihl'],
  'stihl': ['שטיל'],

  // --- Tool Types & Field Slang ---
  'קונגו': ['hammer', 'drill', 'rotary', 'פטישון', 'קונגו', 'sds'],
  'פטישון': ['hammer', 'drill', 'rotary', 'קונגו', 'פטישון', 'sds'],
  'hammer': ['פטישון', 'קונגו', 'פטיש', 'hammer'],
  'drill': ['מברגה', 'פטישון', 'קידוח', 'drill'],

  'דיסק': ['grinder', 'cutting', 'cut', 'משחזת', 'דיסק', 'מסור'],
  'משחזת': ['grinder', 'cutting', 'cut', 'דיסק', 'משחזת'],
  'grinder': ['דיסק', 'משחזת', 'השחזה'],
  'cutting': ['חיתוך', 'דיסק', 'משחזת', 'מסור'],

  'מברגה': ['driver', 'drill', 'מברגת', 'הברגה'],
  'מברגת': ['driver', 'drill', 'מברגה', 'הברגה'],
  'driver': ['מברגה', 'מברגת'],

  'לייזר': ['laser', 'level', 'פלס', 'פילוס'],
  'פלס': ['laser', 'level', 'לייזר', 'פילוס'],
  'laser': ['לייזר', 'פלס'],
  'level': ['פלס', 'לייזר', 'פילוס'],

  // --- Additional Common Jobsite Equipment ---
  'רתכת': ['welder', 'welding', 'weld', 'ריתוך', 'mig', 'tig'],
  'ריתוך': ['welding', 'welder', 'weld', 'רתכת'],
  'welder': ['רתכת', 'ריתוך'],
  'welding': ['רתכת', 'ריתוך'],

  'מסור': ['saw', 'cutting', 'cut', 'ניסור'],
  'saw': ['מסור', 'ניסור'],

  'כננת': ['hoist', 'puller', 'winch', 'הרמה', 'מנוף'],
  'מנוף': ['hoist', 'crane', 'כננת'],
  'hoist': ['כננת', 'הרמה'],

  'מולטימטר': ['multimeter', 'fluke', 'מדידה'],
  'multimeter': ['מולטימטר', 'fluke'],

  'קליבר': ['caliper', 'digimatic', 'mitutoyo'],
  'caliper': ['קליבר'],
};

/**
 * Normalizes an identifier string (QR code, barcode, or serial number)
 * by collapsing leading zeros within segments:
 * e.g., "TOOL-WLD-0001" -> "TOOL-WLD-1", "WLD-001" -> "WLD-1", "001" -> "1".
 */
export function normalizeZeroPaddedCode(str: string): string {
  return str
    .toUpperCase()
    .replace(/([A-Z]+)0+(\d+)/g, '$1$2')
    .replace(/(?:^|-)0+(\d+)/g, (match, digits) => (match.startsWith('-') ? `-${digits}` : digits));
}

/**
 * Intelligent suffix matcher for barcodes, QR codes, and serial numbers.
 * Resolves short inputs such as "1", "001", "WLD-001" to target codes like "TOOL-WLD-0001" or "TOOL-WLD-001".
 */
export function matchesCodeSuffix(
  targetCode: string | null | undefined,
  inputToken: string
): boolean {
  if (!targetCode || !inputToken) return false;

  const code = targetCode.trim().toUpperCase();
  const token = inputToken.trim().toUpperCase();
  if (!code || !token) return false;

  // 1. Direct exact or suffix match
  if (code === token || code.endsWith(token)) {
    return true;
  }

  // 2. Dash-delimited suffix match:
  // e.g. "TOOL-WLD-001" ends with "-001" or "-WLD-001"
  if (code.endsWith(`-${token}`)) {
    return true;
  }

  // 3. Zero-padding normalized suffix match:
  // e.g. "TOOL-WLD-0001" normalized is "TOOL-WLD-1", "WLD-001" normalized is "WLD-1"
  const normCode = normalizeZeroPaddedCode(code);
  const normToken = normalizeZeroPaddedCode(token);

  if (normCode === normToken || normCode.endsWith(normToken) || normCode.endsWith(`-${normToken}`)) {
    return true;
  }

  // 4. Numeric trailing digit extraction:
  // e.g., if token is "1" or "001" and code ends in digits "0001" or "001"
  if (/^\d+$/.test(token)) {
    const tokenNum = parseInt(token, 10);
    const trailingDigitsMatch = code.match(/(\d+)$/);
    if (trailingDigitsMatch) {
      const codeNum = parseInt(trailingDigitsMatch[1], 10);
      if (codeNum === tokenNum) {
        return true;
      }
    }
  }

  // 5. Code contains token as a distinct segment
  if (code.includes(`-${token}-`) || code.endsWith(`-${token}`)) {
    return true;
  }

  return false;
}

export interface SearchableTool {
  toolName: string;
  brand: string;
  modelNumber?: string | null;
  qrCode: string;
  serialNumber?: string | null;
  currentAssignedWorker?: string | null;
  current_assigned_worker?: string | null;
  warehouseName?: string;
  warehouseCode?: string;
}

/**
 * Expands a single search token with dictionary synonyms and translations.
 */
export function expandSearchToken(token: string): string[] {
  const clean = token.toLowerCase().trim();
  const directSynonyms = TOOL_DICTIONARY[clean] || [];
  const expanded = new Set<string>([clean, ...directSynonyms]);

  // Check prefix or partial dictionary keys if token length >= 3
  if (clean.length >= 3) {
    for (const [key, synonyms] of Object.entries(TOOL_DICTIONARY)) {
      if (key === clean) continue;
      if (clean.includes(key) || key.includes(clean)) {
        expanded.add(key);
        synonyms.forEach((s) => expanded.add(s));
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Multi-Field Matching Function:
 * Tests whether a tool matches a search query across:
 *  1. Tool Name (Hebrew & English)
 *  2. Brand
 *  3. Model Number
 *  4. QR Code / Serial Number (including smart suffix matching)
 *  5. Assigned Worker Name (`currentAssignedWorker` / `current_assigned_worker`)
 *
 * Query is split into individual tokens; ALL tokens must match at least one field.
 */
export function matchesToolSearch(tool: SearchableTool, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  // Split query into tokens (by spaces and commas)
  const queryTokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  const toolNameLower = (tool.toolName || '').toLowerCase();
  const brandLower = (tool.brand || '').toLowerCase();
  const modelLower = (tool.modelNumber || '').toLowerCase();
  const assignedWorker = (
    tool.currentAssignedWorker ||
    tool.current_assigned_worker ||
    ''
  ).toLowerCase();
  const qrCode = tool.qrCode || '';
  const serialNumber = tool.serialNumber || '';

  return queryTokens.every((rawToken) => {
    const tokenLower = rawToken.toLowerCase();

    // 1. Check assigned worker name directly (exact substring match)
    // Searching a worker's name must immediately list all tools in their custody
    if (assignedWorker && assignedWorker.includes(tokenLower)) {
      return true;
    }

    // 2. Check QR code or Serial number with smart suffix match
    if (
      matchesCodeSuffix(qrCode, rawToken) ||
      (serialNumber && matchesCodeSuffix(serialNumber, rawToken)) ||
      (tool.modelNumber && matchesCodeSuffix(tool.modelNumber, rawToken))
    ) {
      return true;
    }

    // 3. Check expanded dictionary terms against Tool Name, Brand, Model
    const expansions = expandSearchToken(tokenLower);
    for (const term of expansions) {
      if (
        toolNameLower.includes(term) ||
        brandLower.includes(term) ||
        modelLower.includes(term)
      ) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Disambiguates multiple matching assets:
 * Returns the exact active asset matching the facility.
 */
export function pickBestAssetMatch<T extends {
  warehouseId?: string;
  currentWarehouseId?: string;
  current_warehouse_id?: string;
  status: string;
  qrCode?: string;
  qr_code?: string;
  isLocked?: boolean;
  is_locked?: boolean;
}>(
  candidates: T[],
  queryToken: string,
  facilityId?: string
): T | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const clean = queryToken.trim().toUpperCase();

  const scored = candidates.map((item, index) => {
    let score = 0;
    const itemWarehouseId =
      item.warehouseId || item.currentWarehouseId || item.current_warehouse_id;
    const itemQr = (item.qrCode || item.qr_code || '').toUpperCase();
    const isLocked = item.isLocked || item.is_locked || false;

    // 1. Facility match bonus (+1000)
    if (facilityId && itemWarehouseId === facilityId) {
      score += 1000;
    }

    // 2. Active status bonus:
    // Prefer available > checked_out > maintenance > retired/lost
    if (item.status === 'available') {
      score += 100;
    } else if (item.status === 'checked_out') {
      score += 60;
    } else if (item.status === 'maintenance') {
      score += 20;
    } else if (item.status === 'retired' || item.status === 'lost') {
      score -= 200;
    }

    // Lockout penalty
    if (isLocked) {
      score -= 50;
    }

    // 3. Suffix accuracy bonus:
    // If QR code ends directly with clean token, reward according to match length
    if (itemQr.endsWith(clean)) {
      score += clean.length * 10;
    }

    // Tiebreaker: Earlier array order / stability
    score -= index * 0.01;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.item || candidates[0];
}
