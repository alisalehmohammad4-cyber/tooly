'use client';

import { useState, useRef, useCallback } from 'react';
import { captureSharpCenterCrop } from './imagePreprocessing';
import { cleanAndCorrectTag } from './tagParser';
import { recognizeTagWithCloudOcrAction } from '@/app/actions/ocr';

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
 * Allow standalone 3 to 5 digit numbers (e.g., 1099, 1065, 1032, 282) WITHOUT requiring 'ZR-':
 * const match = text.match(/(?:ZR[- ]?)?\b(\d{3,5})\b/i);
 */
export function validateSerialTag(rawText: string): ValidatedSerialMatch | null {
  if (!rawText) return null;
  const clean = rawText.toUpperCase().trim().replace(/[\r\n\t]+/g, ' ');

  const match = clean.match(/(?:ZR[- ]?)?\b(\d{3,5})\b/i);
  if (match) {
    const rawNumber = match[1];
    const hasZrPrefix = match[0].toUpperCase().startsWith('ZR');
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

  // 1. Primary Priority: Strict validation against ZR-\d{3,5} or 4-digit number
  const validated = validateSerialTag(rawText);
  if (validated) {
    return validated.normalizedTag;
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
 * High-performance, zero-client-overhead OCR scanner hook.
 * Completely replaces heavy client-side Tesseract.js with Cloud OCR (OCR.space Engine 2)
 * + Database Whitelist verification. Frees up 100% of mobile CPU and RAM.
 */
export function useOcrScanner(): UseOcrScannerResult {
  const [isOcrReady] = useState<boolean>(true);
  const [isInitializing] = useState<boolean>(false);
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [ocrProgress] = useState<number>(100);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const isBusyRef = useRef<boolean>(false);

  const initOcr = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  const terminateOcr = useCallback(async (): Promise<void> => {
    // Zero-overhead cloud OCR requires no teardown
  }, []);

  /**
   * Detailed recognition extracting sharp center 60% crop and calling Cloud OCR server action
   * with strict database whitelist validation.
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
        // Capture sharp center 60% crop of the frame
        const canvas = captureSharpCenterCrop(videoElement, 0.60, 2);
        if (!canvas) {
          isBusyRef.current = false;
          setIsRecognizing(false);
          return null;
        }

        const base64Image = canvas.toDataURL('image/jpeg', 0.85);

        // Execute cloud OCR with strict DB whitelist verification
        const result = await recognizeTagWithCloudOcrAction(base64Image, organizationId);

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
