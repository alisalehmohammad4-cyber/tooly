'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { preprocessFrameForOcr } from './imagePreprocessing';
import { cleanAndCorrectTag } from './tagParser';

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
    videoElement: HTMLVideoElement
  ) => Promise<OcrDetailsResult | null>;
}

export interface ValidatedSerialMatch {
  tag: string;
  normalizedTag: string;
  patternType: 'ZR_PREFIX' | 'FOUR_DIGIT';
}

/**
 * Hardened regex validation for local industrial equipment tag recognition:
 * - Match pattern: ZR-\d{3,5} (e.g., ZR-1065, ZR-001, ZR-12345)
 * - OR any 4-digit number (\b\d{4}\b, e.g., 1065, 2048, 0024)
 */
export function validateSerialTag(rawText: string): ValidatedSerialMatch | null {
  if (!rawText) return null;
  const clean = rawText.toUpperCase().trim().replace(/[\r\n\t]+/g, ' ');

  // 1. Strict pattern: ZR-\d{3,5}
  const zrMatch = clean.match(/(?:^|[^0-9A-Z])(ZR-\d{3,5})(?:$|[^0-9A-Z])/i);
  if (zrMatch) {
    const tag = zrMatch[1].toUpperCase();
    return { tag, normalizedTag: tag, patternType: 'ZR_PREFIX' };
  }

  // Also support ZR without hyphen or with space (e.g., "ZR 1065" or "ZR1065" -> "ZR-1065")
  const zrFuzzyMatch = clean.match(/(?:^|[^0-9A-Z])ZR[\s-]?(\d{3,5})(?:$|[^0-9A-Z])/i);
  if (zrFuzzyMatch) {
    const tag = `ZR-${zrFuzzyMatch[1]}`;
    return { tag, normalizedTag: tag, patternType: 'ZR_PREFIX' };
  }

  // 2. Any 4-digit number: \b\d{4}\b
  const fourDigitMatch = clean.match(/(?:^|[^0-9A-Z])(\d{4})(?:$|[^0-9A-Z])/);
  if (fourDigitMatch) {
    const digits = fourDigitMatch[1];
    return {
      tag: digits,
      normalizedTag: `ZR-${digits}`,
      patternType: 'FOUR_DIGIT',
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
 * Dedicated React hook for offline-ready client-side optical character recognition (OCR)
 * using Tesseract.js with high-contrast 60% ROI cropping, 2x scale, unsharp masking,
 * Otsu dynamic binarization, and character constraint [0-9, Z, R, -].
 */
export function useOcrScanner(): UseOcrScannerResult {
  const [isOcrReady, setIsOcrReady] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isRecognizing, setIsRecognizing] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const isInitializingRef = useRef<boolean>(false);

  // Lazy initialize Tesseract worker on demand
  const initOcr = useCallback(async (): Promise<boolean> => {
    if (workerRef.current) {
      setIsOcrReady(true);
      return true;
    }

    if (isInitializingRef.current) {
      return false;
    }

    isInitializingRef.current = true;
    setIsInitializing(true);
    setOcrError(null);
    setOcrProgress(10);

    try {
      // Initialize local Tesseract worker with English model
      const worker = await createWorker('eng', undefined, {
        logger: (m) => {
          if (m && typeof m.progress === 'number') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      // Constrain recognition strictly to characters: [0-9, Z, R, -]
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ZR-',
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });

      workerRef.current = worker;
      setIsOcrReady(true);
      setIsInitializing(false);
      isInitializingRef.current = false;
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'שגיאה באתחול מנוע סריקת טקסט OCR';
      console.error('Failed to initialize Tesseract worker:', err);
      setOcrError(errMsg);
      setIsInitializing(false);
      isInitializingRef.current = false;
      return false;
    }
  }, []);

  // Terminate worker
  const terminateOcr = useCallback(async (): Promise<void> => {
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch (err) {
        console.warn('Error terminating Tesseract worker:', err);
      } finally {
        workerRef.current = null;
        setIsOcrReady(false);
      }
    }
  }, []);

  // Detailed recognition returning tag, raw text, and confidence
  const recognizeFrameWithDetails = useCallback(
    async (
      videoElement: HTMLVideoElement
    ): Promise<OcrDetailsResult | null> => {
      if (!videoElement) return null;

      if (!workerRef.current) {
        const ready = await initOcr();
        if (!ready || !workerRef.current) {
          return null;
        }
      }

      setIsRecognizing(true);
      setOcrError(null);

      try {
        // Preprocess frame: 60% center ROI crop, 2x scale, unsharp mask, Otsu binarization
        const canvas = preprocessFrameForOcr(videoElement);
        if (!canvas) {
          setIsRecognizing(false);
          return null;
        }

        const result = await workerRef.current.recognize(canvas);
        const rawText = result?.data?.text || '';
        const confidence = result?.data?.confidence || 0;

        // Regex validation: match pattern ZR-\d{3,5} or any 4-digit number
        const validated = validateSerialTag(rawText);
        const isValid = Boolean(validated);
        // If confidence > 85%, claim detection immediately
        const isConfident = confidence > 85;

        setIsRecognizing(false);

        return {
          tag: validated ? validated.tag : null,
          normalizedTag: validated ? validated.normalizedTag : null,
          rawText,
          confidence,
          isValid,
          isConfident,
        };
      } catch (err: unknown) {
        console.error('OCR recognition error:', err);
        const msg = err instanceof Error ? err.message : 'שגיאה בזיהוי הטקסט';
        setOcrError(msg);
        setIsRecognizing(false);
        return null;
      }
    },
    [initOcr]
  );

  // Recognize text from HTMLVideoElement frame
  const recognizeFrame = useCallback(
    async (videoElement: HTMLVideoElement): Promise<string | null> => {
      const details = await recognizeFrameWithDetails(videoElement);
      return details ? details.tag : null;
    },
    [recognizeFrameWithDetails]
  );

  // Clean up worker when unmounting
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        void workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

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
