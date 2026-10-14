/**
 * Smart Fuzzy Pattern Corrector for Tooly Industrial Field Tags
 * 
 * Specifically hardened for optical degradation, dust, scratches, and sunlight glare.
 * Handles common optical misreads in numeric portions:
 * - O, o, D -> 0
 * - I, l, |, ! -> 1
 * - S, s, $ -> 5
 * - B -> 8
 * - Z -> 2 (in numeric suffix)
 */

import { snapOcrTagToAssetAction, type ScannedAssetDetails } from '@/app/actions/custody';

/**
 * Common organization prefixes used across Tooly projects.
 * ZR: Zatout Resources / Fleet
 * TOOL: Universal Tooly Asset prefix
 * MOHA: Mohamed Assets / Fleet
 * ALI: Ali Construction Fleet
 * MH: Main Hub / Maintenance Heavy
 */
export const KNOWN_TAG_PREFIXES = ['ZR', 'TOOL', 'MOHA', 'ALI', 'MH'] as const;

/**
 * Universal case-insensitive and whitespace-tolerant field tag pattern matcher:
 * Matches: 'zr 1084', 'ZR-1084', 'zr1084', 'ZR 1084', 'zr_1084', or standalone '1084'.
 */
export const TAG_REGEX = /(?:zr[\s\-_]*)?(\d{3,5})/i;

export interface NormalizedTagResult {
  success: boolean;
  tag: string | null;
  rawDigits: string | null;
}

/**
 * Normalization Pipeline for field tags:
 * Extracts digits from strings like 'zr 1084' or '1084', returning primary tag 'ZR-1084' and raw '1084'.
 */
export function normalizeFieldTag(text: string): NormalizedTagResult {
  if (!text) return { success: false, tag: null, rawDigits: null };
  const cleanText = text.replace(/[\r\n\t]/g, ' ').trim();
  const match = cleanText.match(TAG_REGEX);
  if (match) {
    const digits = match[1]; // e.g. "1084"
    const primaryTag = `ZR-${digits}`;
    const rawDigits = digits;
    return { success: true, tag: primaryTag, rawDigits };
  }
  return { success: false, tag: null, rawDigits: null };
}

/**
 * Replaces common optical misreads in the numeric portion of a tag.
 * E.g., "lO99" -> "1099", "D001" -> "0001", "S02B" -> "5028", "Z099" -> "2099".
 */
export function correctNumericOpticalMisreads(numericCandidate: string): string {
  if (!numericCandidate) return '';

  return numericCandidate
    .replace(/[OoD]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss$]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[Zz]/g, '2');
}

/**
 * Synthesizes an industrial scanner confirmation beep using the browser's Web Audio API.
 * Completely offline, works without loading external mp3/wav files.
 */
export function playOcrBeep(frequency = 880, durationMs = 120): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (err) {
    console.warn('[playOcrBeep] Web Audio API feedback not available:', err);
  }
}

/**
 * Triggers haptic feedback vibration for mobile devices (50ms pulse).
 */
export function triggerOcrHaptic(pattern: number | number[] = 50): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors on unsupported platforms
    }
  }
}

/**
 * Extracts and fuzzy-corrects candidate tags from raw OCR text output.
 * Fully supports real-world field tag formats: 'zr 1084', 'ZR-1084', 'zr1084', 'ZR 1084', '1084'.
 */
export function parseCandidateTags(rawText: string): string[] {
  if (!rawText) return [];

  const candidates: string[] = [];
  const normalized = rawText.replace(/[\r\n\t]/g, ' ').trim();

  // 1. High-Priority Matcher: Matches 'zr 1084', 'ZR-1084', 'zr1084', 'ZR 1084', or standalone '1084'
  // and handles optical misreads in numeric portion:
  const zrPatternRegex = /(?:zr[\s\-_]*)?([0-9OoDIl|!Ss$BZ]{3,5})/gi;

  let match: RegExpExecArray | null;
  while ((match = zrPatternRegex.exec(normalized)) !== null) {
    const rawNumber = match[1];
    const correctedNumber = correctNumericOpticalMisreads(rawNumber);

    if (/^[0-9]{3,5}$/.test(correctedNumber)) {
      const zrTag = `ZR-${correctedNumber}`;
      if (!candidates.includes(zrTag)) {
        candidates.push(zrTag);
      }
      if (!candidates.includes(correctedNumber)) {
        candidates.push(correctedNumber);
      }
    }
  }

  // 2. Secondary Matcher: Other known enterprise fleet prefixes (3-5 digits)
  const enterprisePrefixRegex =
    /(?:^|[^A-Za-z0-9])(TOOL|MOHA|ALI|MH)[\s\-_]?([0-9OoDIl|!Ss$BZ]{3,5})(?:$|[^A-Za-z0-9])/gi;

  while ((match = enterprisePrefixRegex.exec(normalized)) !== null) {
    const prefix = match[1].toUpperCase();
    const rawNumber = match[2];
    const correctedNumber = correctNumericOpticalMisreads(rawNumber);

    if (/^[0-9]{3,5}$/.test(correctedNumber)) {
      const candidate = `${prefix}-${correctedNumber}`;
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
      if (!candidates.includes(correctedNumber)) {
        candidates.push(correctedNumber);
      }
    }
  }

  return candidates;
}

/**
 * Returns the best candidate tag from raw OCR text, or null if no valid tag pattern was identified.
 */
export function cleanAndCorrectTag(rawText: string): string | null {
  const norm = normalizeFieldTag(rawText);
  if (norm.success && norm.tag) {
    return norm.tag;
  }
  const candidates = parseCandidateTags(rawText);
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Automatic Database Snapping:
 * Queries public.assets for organization_id = orgId and tag_number = parsedTag (or qr_code).
 * If verified:
 * - Triggers haptic vibration (navigator.vibrate(100))
 * - Plays industrial scanner beep sound
 * - Locks on the asset and returns full ScannedAssetDetails
 */
export async function snapTagToAsset(
  candidateTag: string,
  orgId?: string,
  facilityId?: string
): Promise<ScannedAssetDetails | null> {
  const clean = candidateTag.trim();
  if (!clean) return null;

  try {
    // 1. Direct query with scanned tag
    const res = await snapOcrTagToAssetAction(clean, orgId, facilityId);
    if (res.success && res.asset) {
      triggerOcrHaptic(50);
      playOcrBeep();
      return res.asset;
    }

    // 2. Normalize and check both ZR-${digits} and raw digits
    const norm = normalizeFieldTag(clean);
    if (norm.success && norm.rawDigits) {
      const zrVariant = `ZR-${norm.rawDigits}`;
      const rawDigits = norm.rawDigits;

      // Try ZR-${digits} (e.g. ZR-1084)
      if (zrVariant !== clean) {
        const resZr = await snapOcrTagToAssetAction(zrVariant, orgId, facilityId);
        if (resZr.success && resZr.asset) {
          triggerOcrHaptic(50);
          playOcrBeep();
          return resZr.asset;
        }
      }

      // Try raw digits (e.g. 1084)
      if (rawDigits !== clean) {
        const resRaw = await snapOcrTagToAssetAction(rawDigits, orgId, facilityId);
        if (resRaw.success && resRaw.asset) {
          triggerOcrHaptic(50);
          playOcrBeep();
          return resRaw.asset;
        }
      }
    }
  } catch (err) {
    console.warn('[snapTagToAsset] Error querying asset by tag:', err);
  }

  return null;
}
