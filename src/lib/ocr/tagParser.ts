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
 * Triggers haptic feedback vibration for mobile devices (100ms buzz).
 */
export function triggerOcrHaptic(pattern: number | number[] = 100): void {
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
 * 
 * Supports:
 * - Specific prefix matcher: /(?:ZR|TOOL|MOHA|ALI|MH)[-_ ]?([0-9]{3,5})/i
 * - Optical misreads in numeric part: e.g., "ZR-lO99" -> "ZR-1099"
 * - Generic prefixes: e.g., "WLD-0024" or "BAT-101"
 */
export function parseCandidateTags(rawText: string): string[] {
  if (!rawText) return [];

  const candidates: string[] = [];
  const normalized = rawText.trim().replace(/\r?\n/g, ' ');

  // 1. High-Priority Matcher: Known organization prefixes with possible optical misreads in numeric suffix
  // e.g. "ZR-lO99", "MOHA D001", "TOOL-S02B", "ZR Z099", "MH-105"
  const knownPrefixRegex =
    /(?:^|[^A-Za-z0-9])(ZR|TOOL|MOHA|ALI|MH)[-_ ]?([0-9OoDIl|!Ss$BZ]{3,5})(?:$|[^A-Za-z0-9])/gi;

  let match: RegExpExecArray | null;
  while ((match = knownPrefixRegex.exec(normalized)) !== null) {
    const prefix = match[1].toUpperCase();
    const rawNumber = match[2];
    const correctedNumber = correctNumericOpticalMisreads(rawNumber);

    // Verify corrected number is strictly 3 to 5 digits
    if (/^[0-9]{3,5}$/.test(correctedNumber)) {
      candidates.push(`${prefix}-${correctedNumber}`);
    }
  }

  // 2. Secondary Matcher: General uppercase alphanumeric prefixes (2-6 letters)
  // e.g. "BAT-001", "WLD-102", "PMP-055"
  const generalPrefixRegex =
    /(?:^|[^A-Za-z0-9])([A-Z]{2,6})[-_ ]?([0-9OoDIl|!Ss$BZ]{3,6})(?:$|[^A-Za-z0-9])/gi;

  while ((match = generalPrefixRegex.exec(normalized)) !== null) {
    const prefix = match[1].toUpperCase();
    const rawNumber = match[2];
    const correctedNumber = correctNumericOpticalMisreads(rawNumber);

    if (/^[0-9]{3,6}$/.test(correctedNumber)) {
      const candidate = `${prefix}-${correctedNumber}`;
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  // 3. Fallback Matcher: Standalone numeric tags (3 to 6 digits)
  const standaloneNumericRegex = /(?:^|[^A-Za-z0-9])([0-9]{3,6})(?:$|[^A-Za-z0-9])/g;
  while ((match = standaloneNumericRegex.exec(normalized)) !== null) {
    const num = match[1];
    if (!candidates.includes(num)) {
      candidates.push(num);
    }
  }

  return candidates;
}

/**
 * Returns the best candidate tag from raw OCR text, or null if no valid tag pattern was identified.
 */
export function cleanAndCorrectTag(rawText: string): string | null {
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
    const res = await snapOcrTagToAssetAction(clean, orgId, facilityId);
    if (res.success && res.asset) {
      // Trigger instant haptic vibration
      triggerOcrHaptic(100);

      // Play audio beep confirmation
      playOcrBeep();

      return res.asset;
    }
  } catch (err) {
    console.warn('[snapTagToAsset] Error querying asset by tag:', err);
  }

  return null;
}
