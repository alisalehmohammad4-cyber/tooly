'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker, PSM, type Worker } from 'tesseract.js';

export interface UseOcrScannerResult {
  isOcrReady: boolean;
  isInitializing: boolean;
  isRecognizing: boolean;
  ocrProgress: number;
  ocrError: string | null;
  initOcr: () => Promise<boolean>;
  terminateOcr: () => Promise<void>;
  recognizeFrame: (videoElement: HTMLVideoElement) => Promise<string | null>;
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

  // Clean text and normalize spaces/newlines
  const normalized = rawText
    .toUpperCase()
    .replace(/[—_–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Triple-segment equipment code (e.g., TOOL-WLD-001 or TOOL-CUT-021)
  const tripleMatch = normalized.match(/\b([A-Z0-9]{2,6}-[A-Z0-9]{2,6}-\d{1,6})\b/);
  if (tripleMatch) {
    return tripleMatch[1];
  }

  // 2. Standard double-segment equipment code (e.g., TOOL-0024, BAT-101, SITE-002)
  const doubleMatch = normalized.match(/\b([A-Z]{2,6}-\d{1,6})\b/);
  if (doubleMatch) {
    return doubleMatch[1];
  }

  // 3. Fallback: segments separated by spaces where hyphen was missed (e.g., "TOOL WLD 001" -> "TOOL-WLD-001")
  const spaceSegmentMatch = normalized.match(/\b(TOOL\s+[A-Z]{2,5}\s+\d{1,6})\b/);
  if (spaceSegmentMatch) {
    return spaceSegmentMatch[1].replace(/\s+/g, '-');
  }

  const spaceSimpleMatch = normalized.match(/\b(TOOL\s+\d{1,6})\b/);
  if (spaceSimpleMatch) {
    return spaceSimpleMatch[1].replace(/\s+/g, '-');
  }

  // 4. Compact TOOL prefix without hyphen (e.g., "TOOL001" or "TOOL102" -> "TOOL-001")
  const compactToolMatch = normalized.match(/\bTOOL(\d{1,6})\b/);
  if (compactToolMatch) {
    return `TOOL-${compactToolMatch[1]}`;
  }

  // 5. Any general uppercase alphanumeric code with hyphen (e.g., "WLD-001" or "ABC-1234")
  const generalMatch = normalized.match(/\b([A-Z0-9]{2,6}-[A-Z0-9]{2,8})\b/);
  if (generalMatch) {
    return generalMatch[1];
  }

  // 6. Fallback numeric suffix: 3 to 8 standalone digits (e.g., "0001", "0024")
  const numericMatch = normalized.match(/\b(\d{3,8})\b/);
  if (numericMatch) {
    return numericMatch[1];
  }

  return null;
}

/**
 * Preprocesses video frame for high-accuracy OCR:
 * 1. Crops central targeting bracket.
 * 2. Scales 2x for OCR optical density.
 * 3. Converts to high-contrast grayscale + adaptive thresholding.
 */
function preprocessVideoFrame(videoElement: HTMLVideoElement): HTMLCanvasElement | null {
  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;

  if (!vw || !vh) return null;

  // Target central horizontal bounding box (75% width, 30% height)
  const cropWidth = Math.round(vw * 0.75);
  const cropHeight = Math.round(vh * 0.30);
  const cropX = Math.round((vw - cropWidth) / 2);
  const cropY = Math.round((vh - cropHeight) / 2);

  // In-memory canvas with 2x scaling for crisp character edges
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth * scale;
  canvas.height = cropHeight * scale;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Disable image smoothing for sharper pixel thresholding
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    videoElement,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // 1. Calculate average luminance across sample
  let sumLum = 0;
  const totalPixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sumLum += lum;
  }
  const avgLum = sumLum / totalPixels;
  // Slightly lower threshold to ensure dark printed text is clearly separated from light background
  const threshold = Math.max(70, Math.min(180, avgLum * 0.9));

  // 2. High-contrast binarization (black text on white background)
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = lum < threshold ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Dedicated React hook for offline-ready client-side optical character recognition (OCR)
 * using Tesseract.js.
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

      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
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

  // Recognize text from HTMLVideoElement frame
  const recognizeFrame = useCallback(
    async (videoElement: HTMLVideoElement): Promise<string | null> => {
      if (!videoElement) return null;

      // Ensure worker is ready
      if (!workerRef.current) {
        const ready = await initOcr();
        if (!ready || !workerRef.current) {
          return null;
        }
      }

      setIsRecognizing(true);
      setOcrError(null);

      try {
        const canvas = preprocessVideoFrame(videoElement);
        if (!canvas) {
          setIsRecognizing(false);
          return null;
        }

        const result = await workerRef.current.recognize(canvas);
        const rawText = result?.data?.text || '';

        const matchedCode = extractToolSerialFromText(rawText);
        setIsRecognizing(false);
        return matchedCode;
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
  };
}
