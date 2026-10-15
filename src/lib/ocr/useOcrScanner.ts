'use client';

import { useState, useRef, useCallback } from 'react';
import { cropLaserStripToCanvas, captureSharpCenterCrop } from './imagePreprocessing';
import { cleanAndCorrectTag, TAG_REGEX, normalizeFieldTag } from './tagParser';
import { recognizeTagWithCloudAiAction, recognizeTagWithCloudOcrAction } from '@/app/actions/ocr';
import { getPersistentOcrWorker } from './useLaserStripOcr';

export interface OcrDetailsResult {
  tag: string | null;
  normalizedTag: string | null;
  rawText: string;
  confidence: number;
  isValid: boolean;
  isConfident: boolean;
}

export interface UseOcrScannerResult {
  isOcrReady: boolean;
  isInitializing: boolean;
  isRecognizing: boolean;
  ocrProgress: number;
  ocrError: string | null;
  initOcr: () => Promise<boolean>;
  terminateOcr: () => Promise<void>;
  recognizeFrame: (videoElement: HTMLVideoElement) => Promise<string | null>;
  recognizeFrameWithDetails: (
    videoElement: HTMLVideoElement,
    organizationId?: string
  ) => Promise<OcrDetailsResult | null>;
}

export interface ValidatedSerialMatch {
  tag: string;
  normalizedTag: string;
  patternType: 'ZR_PREFIX' | 'FOUR_DIGIT';
}

/**
 * Hardened regex validation for equipment tag recognition:
 * Matches: 'zr 1084', 'ZR-1084', 'zr1084', 'ZR 1084', 'zr_1084', or standalone '1084'
 */
export function validateSerialTag(rawText: string): ValidatedSerialMatch | null {
  if (!rawText) return null;
  const clean = rawText.replace(/[\r\n\t]/g, ' ').trim();

  const match = clean.match(TAG_REGEX);
  if (match) {
    const rawNumber = match[1];
    const hasZrPrefix = clean.toLowerCase().includes('zr');
    return {
      tag: hasZrPrefix ? `ZR-${rawNumber}` : rawNumber,
      normalizedTag: `ZR-${rawNumber}`,
      patternType: hasZrPrefix ? 'ZR_PREFIX' : 'FOUR_DIGIT',
    };
  }

  return null;
}

/**
 * Extracts equipment barcode / QR serial patterns from raw OCR text.
 */
export function extractToolSerialFromText(rawText: string): string | null {
  if (!rawText) return null;

  // 1. Primary Priority: Field tag normalization (e.g. 'zr 1084' -> 'ZR-1084', '1084' -> 'ZR-1084')
  const norm = normalizeFieldTag(rawText);
  if (norm.success && norm.tag) {
    return norm.tag;
  }

  // 2. Try fuzzy pattern corrector
  const fuzzyTag = cleanAndCorrectTag(rawText);
  if (fuzzyTag) {
    return fuzzyTag;
  }

  // Clean text and normalize spaces/newlines
  const normalized = rawText
    .toUpperCase()
    .replace(/[—_–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Fallback matching for other enterprise fleet equipment prefixes
  const tripleMatch = normalized.match(/\b([A-Z0-9]{2,6}-[A-Z0-9]{2,6}-\d{1,6})\b/);
  if (tripleMatch) {
    return tripleMatch[1];
  }

  const doubleMatch = normalized.match(/\b([A-Z]{2,6}-\d{1,6})\b/);
  if (doubleMatch) {
    return doubleMatch[1];
  }

  const numericMatch = normalized.match(/\b(\d{3,8})\b/);
  if (numericMatch) {
    return numericMatch[1];
  }

  return null;
}

/**
 * High-performance OCR scanner hook using Laser-Strip Cropping (600x200),
 * Persistent Tesseract.js Worker and Throttled Cloud AI Fallback.
 */
export function useOcrScanner(): UseOcrScannerResult {
  const [isOcrReady, setIsOcrReady] = useState<boolean>(true);
  const [isInitializing] = useState<boolean>(false);
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [ocrProgress] = useState<number>(100);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const isBusyRef = useRef<boolean>(false);

  const initOcr = useCallback(async (): Promise<boolean> => {
    void getPersistentOcrWorker().then((w) => {
      if (w) setIsOcrReady(true);
    });
    return true;
  }, []);

  const terminateOcr = useCallback(async (): Promise<void> => {
    // Persistent worker manages its own lifecycle
  }, []);

  /**
   * Detailed recognition extracting 600x200 laser-strip crop and evaluating
   * local persistent Tesseract worker with Cloud AI fallback.
   */
  const recognizeFrameWithDetails = useCallback(
    async (
      videoElement: HTMLVideoElement,
      organizationId?: string
    ): Promise<OcrDetailsResult | null> => {
      if (!videoElement || isBusyRef.current) return null;

      if (videoElement.readyState < 2) return null;

      isBusyRef.current = true;
      setIsRecognizing(true);
      setOcrError(null);

      try {
        // 1. Capture 600x200 laser-strip center crop with contrast boost
        const canvas = cropLaserStripToCanvas(videoElement) || captureSharpCenterCrop(videoElement, 0.60, 2);
        if (!canvas) {
          isBusyRef.current = false;
          setIsRecognizing(false);
          return null;
        }

        // 2. Try fast local Tesseract worker
        const worker = await getPersistentOcrWorker();
        if (worker) {
          try {
            const { data } = await worker.recognize(canvas);
            const raw = data?.text ? data.text.trim().replace(/[\r\n\t]+/g, ' ') : '';
            if (raw) {
              const match = raw
                .replace(/[oO]/g, '0')
                .replace(/[lI]/g, '1')
                .match(/(?:zr[\s\-_]*)?(\d{3,5})/i);

              if (match && match[1]) {
                const tag = `ZR-${match[1]}`;
                isBusyRef.current = false;
                setIsRecognizing(false);
                return {
                  tag,
                  normalizedTag: tag,
                  rawText: raw,
                  confidence: 99,
                  isValid: true,
                  isConfident: true,
                };
              }
            }
          } catch (workerErr) {
            console.warn('[useOcrScanner] Local worker pass error:', workerErr);
          }
        }

        // 3. Fallback: Execute cloud OCR with strict DB whitelist verification
        const base64Image = canvas.toDataURL('image/jpeg', 0.85);
        const result = await recognizeTagWithCloudAiAction(base64Image, organizationId);

        isBusyRef.current = false;
        setIsRecognizing(false);

        if (result.success && result.matchedTag) {
          return {
            tag: result.matchedTag,
            normalizedTag: result.matchedTag,
            rawText: result.rawText || result.matchedTag,
            confidence: 99,
            isValid: true,
            isConfident: true,
          };
        }

        if (result.error && !result.error.includes('No candidate') && !result.error.includes('whitelist')) {
          setOcrError(result.error);
        }

        return null;
      } catch (err: unknown) {
        console.warn('[CloudOCR] recognizeFrameWithDetails error:', err);
        const msg = err instanceof Error ? err.message : 'שגיאה בסריקת ענן';
        setOcrError(msg);
        isBusyRef.current = false;
        setIsRecognizing(false);
        return null;
      }
    },
    []
  );

  const recognizeFrame = useCallback(
    async (videoElement: HTMLVideoElement): Promise<string | null> => {
      const details = await recognizeFrameWithDetails(videoElement);
      return details ? details.tag : null;
    },
    [recognizeFrameWithDetails]
  );

  return {
    isOcrReady,
    isInitializing,
    isRecognizing,
    ocrProgress,
    ocrError,
    initOcr,
    terminateOcr,
    recognizeFrame,
    recognizeFrameWithDetails,
  };
}
