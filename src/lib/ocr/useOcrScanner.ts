'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { preprocessFrameForOcr } from './imagePreprocessing';
import { cleanAndCorrectTag } from './tagParser';

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
  ) => Promise<{ tag: string | null; rawText: string; confidence: number } | null>;
}

/**
 * Extracts equipment barcode / QR serial patterns from raw OCR text.
 * Covers patterns like:
 * - TOOL-WLD-001, TOOL-DRL-030 (triple segment)
 * - TOOL-0024, TOOL-102 (double segment)
 * - BAT-001, SITE-005
 * - Standalone numeric suffixes with prefix normalization
 */
export function extractToolSerialFromText(rawText: string): string | null {
  if (!rawText) return null;

  // 1. Try fuzzy pattern corrector first (corrects optical misreads like O->0, l->1, S->5, etc.)
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

  // 2. Triple-segment equipment code (e.g., TOOL-WLD-001 or TOOL-CUT-021)
  const tripleMatch = normalized.match(/\b([A-Z0-9]{2,6}-[A-Z0-9]{2,6}-\d{1,6})\b/);
  if (tripleMatch) {
    return tripleMatch[1];
  }

  // 3. Standard double-segment equipment code (e.g., TOOL-0024, BAT-101, SITE-002)
  const doubleMatch = normalized.match(/\b([A-Z]{2,6}-\d{1,6})\b/);
  if (doubleMatch) {
    return doubleMatch[1];
  }

  // 4. Fallback: segments separated by spaces where hyphen was missed (e.g., "TOOL WLD 001" -> "TOOL-WLD-001")
  const spaceSegmentMatch = normalized.match(/\b(TOOL\s+[A-Z]{2,5}\s+\d{1,6})\b/);
  if (spaceSegmentMatch) {
    return spaceSegmentMatch[1].replace(/\s+/g, '-');
  }

  const spaceSimpleMatch = normalized.match(/\b(TOOL\s+\d{1,6})\b/);
  if (spaceSimpleMatch) {
    return spaceSimpleMatch[1].replace(/\s+/g, '-');
  }

  // 5. Compact TOOL prefix without hyphen (e.g., "TOOL001" or "TOOL102" -> "TOOL-001")
  const compactToolMatch = normalized.match(/\bTOOL(\d{1,6})\b/);
  if (compactToolMatch) {
    return `TOOL-${compactToolMatch[1]}`;
  }

  // 6. Any general uppercase alphanumeric code with hyphen (e.g., "WLD-001" or "ABC-1234")
  const generalMatch = normalized.match(/\b([A-Z0-9]{2,6}-[A-Z0-9]{2,8})\b/);
  if (generalMatch) {
    return generalMatch[1];
  }

  // 7. Fallback numeric suffix: 3 to 8 standalone digits (e.g., "0001", "0024")
  const numericMatch = normalized.match(/\b(\d{3,8})\b/);
  if (numericMatch) {
    return numericMatch[1];
  }

  return null;
}

/**
 * Dedicated React hook for offline-ready client-side optical character recognition (OCR)
 * using Tesseract.js with Otsu adaptive binarization and fuzzy tag corrector.
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
      // Initialize Tesseract worker with English model and industrial parameters
      const worker = await createWorker('eng', undefined, {
        logger: (m) => {
          if (m && typeof m.progress === 'number') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      // Whitelist common characters and optical misread lookalikes (including !, |, $)
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!|$ ',
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
    ): Promise<{ tag: string | null; rawText: string; confidence: number } | null> => {
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
        // Preprocess frame using industrial 70%x25% ROI crop and Otsu binarization filter
        const canvas = preprocessFrameForOcr(videoElement);
        if (!canvas) {
          setIsRecognizing(false);
          return null;
        }

        const result = await workerRef.current.recognize(canvas);
        const rawText = result?.data?.text || '';
        const confidence = result?.data?.confidence || 0;

        const matchedCode = extractToolSerialFromText(rawText);
        setIsRecognizing(false);

        return {
          tag: matchedCode,
          rawText,
          confidence,
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
