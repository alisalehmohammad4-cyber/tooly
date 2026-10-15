'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Worker } from 'tesseract.js';
import { cropLaserStripToCanvas } from './imagePreprocessing';
import { playOcrBeep, triggerOcrHaptic } from './tagParser';
import { recognizeTagWithCloudAiAction } from '@/app/actions/ocr';

let globalWorker: Worker | null = null;
let globalWorkerPromise: Promise<Worker | null> | null = null;

/**
 * Initializes a persistent local Tesseract.js worker once with:
 * tessedit_char_whitelist: 'ZRzr0123456789- '
 * tessedit_pageseg_mode: '7' (Single text line)
 */
export async function getPersistentOcrWorker(): Promise<Worker | null> {
  if (typeof window === 'undefined') return null;
  if (globalWorker) return globalWorker;
  if (globalWorkerPromise) return globalWorkerPromise;

  globalWorkerPromise = (async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: 'ZRzr0123456789- ',
        tessedit_pageseg_mode: '7' as any, // Treat image as a single text line
      });
      globalWorker = worker;
      return worker;
    } catch (err) {
      console.warn('[TesseractWorker] Init error, will rely on cloud fallback:', err);
      globalWorkerPromise = null;
      return null;
    }
  })();

  return globalWorkerPromise;
}

export interface UseLaserStripOcrOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isPaused: boolean;
  organizationId?: string;
  onTagDetected: (tag: string, digits: string) => void | Promise<void>;
}

export interface UseLaserStripOcrReturn {
  lastRawOcrText: string;
  ocrMatchedTag: string | null;
  ocrStatus: 'scanning' | 'reading' | 'matched';
  resetOcrStatus: () => void;
  triggerManualMatch: (digitsOrTag: string) => void;
}

/**
 * High-Speed Laser-Strip OCR Scanner Hook:
 * 1. Crops the 75% width x 30% height horizontal center laser strip to a crisp 600x200 canvas with contrast boost.
 * 2. Runs local persistent Tesseract.js worker every 450ms.
 * 3. Keeps Cloud AI OCR as a 2.5s throttled fallback.
 * 4. Extracts digits via: rawText.replace(/[oO]/g, '0').replace(/[lI]/g, '1').match(/(?:zr[\s\-_]*)?(\d{3,5})/i)
 * 5. Provides live HUD states (scanning, reading raw characters, matched).
 */
export function useLaserStripOcr({
  videoRef,
  isActive,
  isPaused,
  organizationId,
  onTagDetected,
}: UseLaserStripOcrOptions): UseLaserStripOcrReturn {
  const [lastRawOcrText, setLastRawOcrText] = useState<string>('');
  const [ocrMatchedTag, setOcrMatchedTag] = useState<string | null>(null);

  const isLockedRef = useRef<boolean>(false);
  const isWorkerBusyRef = useRef<boolean>(false);
  const isCloudBusyRef = useRef<boolean>(false);
  const lastCloudCallTimeRef = useRef<number>(0);
  const workerInstanceRef = useRef<Worker | null>(null);

  // Initialize persistent worker once on mount / activation
  useEffect(() => {
    let isMounted = true;
    if (isActive) {
      void getPersistentOcrWorker().then((w) => {
        if (isMounted && w) {
          workerInstanceRef.current = w;
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isActive]);

  const resetOcrStatus = useCallback(() => {
    isLockedRef.current = false;
    setOcrMatchedTag(null);
    setLastRawOcrText('');
  }, []);

  const handleSuccessfulMatch = useCallback(
    (digits: string) => {
      if (isLockedRef.current) return;
      isLockedRef.current = true;

      const cleanDigits = digits.replace(/^ZR-?/i, '').trim();
      const canonicalTag = `ZR-${cleanDigits}`;

      // a) Audio beep + haptic pulse
      playOcrBeep(880, 140);
      triggerOcrHaptic([60, 40, 60]);

      // b) Set matched badge state
      setOcrMatchedTag(canonicalTag);

      // c) Invoke parent handler
      void onTagDetected(canonicalTag, cleanDigits);
    },
    [onTagDetected]
  );

  const triggerManualMatch = useCallback(
    (digitsOrTag: string) => {
      const match = digitsOrTag
        .replace(/[oO]/g, '0')
        .replace(/[lI]/g, '1')
        .match(/(?:zr[\s\-_]*)?(\d{3,5})/i);

      if (match && match[1]) {
        handleSuccessfulMatch(match[1]);
      } else {
        handleSuccessfulMatch(digitsOrTag);
      }
    },
    [handleSuccessfulMatch]
  );

  // 450ms High-Frequency Laser Strip Recognition Loop
  useEffect(() => {
    if (!isActive || isPaused) return;

    const interval = setInterval(async () => {
      if (!isActive || isPaused || isLockedRef.current) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused) return;

      // 1. Crop ONLY horizontal center laser strip (75% W x 30% H) to 600x200 with contrast boost
      const canvas = cropLaserStripToCanvas(video);
      if (!canvas) return;

      // 2. Local Persistent Tesseract Worker (Runs every 450ms cycle)
      const worker = workerInstanceRef.current || globalWorker;
      if (worker && !isWorkerBusyRef.current && !isLockedRef.current) {
        isWorkerBusyRef.current = true;
        try {
          const { data } = await worker.recognize(canvas);
          const raw = data?.text ? data.text.trim().replace(/[\r\n\t]+/g, ' ') : '';

          if (raw && !isLockedRef.current) {
            setLastRawOcrText(raw);

            // Regex extractor
            const match = raw
              .replace(/[oO]/g, '0')
              .replace(/[lI]/g, '1')
              .match(/(?:zr[\s\-_]*)?(\d{3,5})/i);

            if (match && match[1]) {
              handleSuccessfulMatch(match[1]);
              return;
            }
          }
        } catch (err) {
          console.warn('[useLaserStripOcr] Local recognition error:', err);
        } finally {
          isWorkerBusyRef.current = false;
        }
      }

      // 3. Throttled Cloud AI Fallback (Every 2.5s = 2500ms)
      const now = Date.now();
      if (
        now - lastCloudCallTimeRef.current >= 2500 &&
        !isCloudBusyRef.current &&
        !isLockedRef.current
      ) {
        lastCloudCallTimeRef.current = now;
        isCloudBusyRef.current = true;

        try {
          const base64 = canvas.toDataURL('image/jpeg', 0.85);
          const cloudRes = await recognizeTagWithCloudAiAction(base64, organizationId);

          if (cloudRes.rawText && !isLockedRef.current) {
            setLastRawOcrText(cloudRes.rawText.trim().replace(/[\r\n\t]+/g, ' '));
          }

          if (!isLockedRef.current) {
            if (cloudRes.success && cloudRes.matchedTag) {
              const cloudMatch = cloudRes.matchedTag
                .replace(/[oO]/g, '0')
                .replace(/[lI]/g, '1')
                .match(/(?:zr[\s\-_]*)?(\d{3,5})/i);

              if (cloudMatch && cloudMatch[1]) {
                handleSuccessfulMatch(cloudMatch[1]);
                return;
              }
            } else if (cloudRes.rawText) {
              const textMatch = cloudRes.rawText
                .replace(/[oO]/g, '0')
                .replace(/[lI]/g, '1')
                .match(/(?:zr[\s\-_]*)?(\d{3,5})/i);

              if (textMatch && textMatch[1]) {
                handleSuccessfulMatch(textMatch[1]);
                return;
              }
            }
          }
        } catch (cloudErr) {
          console.warn('[useLaserStripOcr] Cloud OCR fallback error:', cloudErr);
        } finally {
          isCloudBusyRef.current = false;
        }
      }
    }, 450);

    return () => {
      clearInterval(interval);
    };
  }, [isActive, isPaused, videoRef, organizationId, handleSuccessfulMatch]);

  const ocrStatus: 'scanning' | 'reading' | 'matched' = ocrMatchedTag
    ? 'matched'
    : lastRawOcrText
    ? 'reading'
    : 'scanning';

  return {
    lastRawOcrText,
    ocrMatchedTag,
    ocrStatus,
    resetOcrStatus,
    triggerManualMatch,
  };
}
