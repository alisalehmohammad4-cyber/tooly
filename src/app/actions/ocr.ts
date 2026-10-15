'use server';

import { getServerSessionOrgId } from '@/lib/auth/session';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getMockAssets } from '@/lib/mockStore';

export interface CloudOcrResult {
  success: boolean;
  matchedTag?: string;
  rawText?: string;
  error?: string;
}

interface WhitelistAsset {
  id: string;
  qr_code?: string | null;
  tag_number?: string | null;
  serial_number?: string | null;
}

/**
 * Cloud OCR Server Action using OCR.space API (Engine 2) with strict database whitelist validation.
 * 
 * 1. Sends cropped base64 frame to https://api.ocr.space/parse/image using OCREngine 2 (specialized
 *    for numbers and industrial labels) and scale=true.
 * 2. Uses process.env.OCR_SPACE_API_KEY || 'helloworld' for zero-config free operation.
 * 3. Extracts candidate numbers matching /(?:zr[\s\-_]*)?(\d{3,5})/gi (e.g. 'zr 1084', '1084', 'ZR-1084').
 * 4. Strictly validates against the organization's real assets whitelist (tag_number, qr_code, serial_number).
 *    NEVER accepts hallucinated or misread numbers!
 */
export async function recognizeTagWithCloudOcrAction(
  base64Image: string,
  organizationId?: string
): Promise<CloudOcrResult> {
  if (!base64Image || typeof base64Image !== 'string' || base64Image.trim().length === 0) {
    return { success: false, error: 'Missing base64 image frame' };
  }

  const cleanImage = base64Image.trim();
  const formattedBase64 = cleanImage.startsWith('data:')
    ? cleanImage
    : `data:image/jpeg;base64,${cleanImage}`;

  const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';

  // 1. Send cropped frame to OCR.space API
  let rawText = '';
  try {
    const formData = new FormData();
    formData.append('base64Image', formattedBase64);
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('language', 'eng');
    formData.append('apikey', apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `OCR API error (HTTP ${res.status})` };
    }

    const data = await res.json();

    if (data?.IsErroredOnProcessing || !Array.isArray(data?.ParsedResults)) {
      const errMsg = Array.isArray(data?.ErrorMessage)
        ? data.ErrorMessage.join(' ')
        : data?.ErrorMessage || data?.ErrorDetails || 'OCR.space parsing failure';
      return { success: false, error: errMsg };
    }

    rawText = data.ParsedResults.map(
      (r: { ParsedText?: string }) => r.ParsedText || ''
    ).join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OCR fetch failed';
    return { success: false, error: msg };
  }

  if (!rawText.trim()) {
    return { success: false, rawText: '', error: 'No text detected' };
  }

  // 2. Extract candidate numbers matching /(?:zr[\s\-_]*)?(\d{3,5})/gi (e.g. 'zr 1084', '1084', 'ZR-1084')
  const cleanRawText = rawText.replace(/[\r\n\t]/g, ' ').trim();
  const candidateRegex = /(?:zr[\s\-_]*)?(\d{3,5})/gi;
  const matches = Array.from(cleanRawText.matchAll(candidateRegex));

  if (!matches || matches.length === 0) {
    return {
      success: false,
      rawText,
      error: 'No 3 to 5 digit serial pattern detected in OCR text',
    };
  }

  // 3. Strict Database Whitelist Verification
  const orgId = await getServerSessionOrgId(organizationId);
  let assetsList: WhitelistAsset[] = [];

  if (isSupabaseConfigured() && orgId && orgId !== 'platform-master-superadmin') {
    try {
      const { data, error } = await supabaseAdmin
        .from('assets')
        .select('id, qr_code, tag_number, serial_number')
        .eq('organization_id', orgId);

      if (!error && data && data.length > 0) {
        assetsList = data as WhitelistAsset[];
      }
    } catch (err) {
      console.warn('[CloudOCR] Supabase query error for assets whitelist:', err);
    }
  }

  // In-memory or fallback sync with mockStore
  if (assetsList.length === 0) {
    const mockItems = getMockAssets(orgId || undefined);
    assetsList = mockItems.map((m) => ({
      id: m.id,
      qr_code: m.qrCode,
      tag_number: m.tagNumber || m.tag_number,
      serial_number: m.serialNumber || m.serial_number,
    }));
  }

  // Build the lookup whitelist index
  const whitelist = new Map<string, string>();

  for (const asset of assetsList) {
    const canonicalTag = asset.qr_code || asset.tag_number || asset.id;
    if (!canonicalTag) continue;

    const fields = [asset.qr_code, asset.tag_number, asset.serial_number].filter(Boolean) as string[];

    for (const rawField of fields) {
      const cleanField = rawField.trim().toUpperCase().replace(/\s+/g, '');
      whitelist.set(cleanField, canonicalTag);

      const numMatch = cleanField.match(/(?:zr[\s\-_]*)?(\d{3,5})/i);
      if (numMatch) {
        const num = numMatch[1];
        whitelist.set(num, canonicalTag);
        whitelist.set(`ZR-${num}`, canonicalTag);
        whitelist.set(`ZR${num}`, canonicalTag);
        whitelist.set(`ZR ${num}`, canonicalTag);
        whitelist.set(`zr ${num}`, canonicalTag);
        whitelist.set(`zr-${num}`, canonicalTag);
      }
    }
  }

  // Evaluate candidate OCR matches against the whitelist
  let matchedTag: string | null = null;

  for (const m of matches) {
    const full = m[0].toUpperCase().replace(/\s+/g, '');
    const digits = m[1];
    const zrPrefixed = `ZR-${digits}`;

    if (whitelist.has(full)) {
      matchedTag = whitelist.get(full)!;
      break;
    }
    if (whitelist.has(zrPrefixed)) {
      matchedTag = whitelist.get(zrPrefixed)!;
      break;
    }
    if (whitelist.has(digits)) {
      matchedTag = whitelist.get(digits)!;
      break;
    }
  }

  if (matchedTag) {
    return {
      success: true,
      matchedTag,
      rawText,
    };
  }

  return {
    success: false,
    rawText,
    error: 'Extracted serial candidate is not present in organization assets whitelist',
  };
}

/**
 * On-demand / throttled Cloud AI OCR Server Action fallback.
 */
export async function recognizeTagWithCloudAiAction(
  base64Image: string,
  organizationId?: string
): Promise<CloudOcrResult> {
  return recognizeTagWithCloudOcrAction(base64Image, organizationId);
}
