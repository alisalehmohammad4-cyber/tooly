'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Minimal Web NFC TypeScript interfaces for W3C Web NFC API.
 */
interface NDEFRecordData {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: ArrayBuffer | DataView | string;
  encoding?: string;
  lang?: string;
}

interface NDEFMessageInit {
  records: Array<{
    recordType: string;
    mediaType?: string;
    data?: string | ArrayBuffer | DataView;
    encoding?: string;
    lang?: string;
  }>;
}

interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: {
    records: NDEFRecordData[];
  };
}

interface NDEFReaderConstructor {
  new (): {
    scan: (options?: { signal?: AbortSignal }) => Promise<void>;
    write: (message: NDEFMessageInit | string, options?: { signal?: AbortSignal }) => Promise<void>;
    onreading: ((event: NDEFReadingEvent) => void) | null;
    onreadingerror: ((event: Event) => void) | null;
  };
}

export interface UseWebNfcReturn {
  isSupported: boolean;
  isScanning: boolean;
  isWriting: boolean;
  nfcError: string | null;
  startScan: (onTagScanned: (tagId: string, rawUid?: string) => void) => Promise<boolean>;
  stopScan: () => void;
  writeNfcTag: (assetCode: string) => Promise<boolean>;
}

/**
 * Universal Web NFC Hook for Android Chrome & iOS Background Tag Reading compatibility.
 */
export function useWebNfc(): UseWebNfcReturn {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isWriting, setIsWriting] = useState<boolean>(false);
  const [nfcError, setNfcError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const onTagScannedRef = useRef<((tagId: string, rawUid?: string) => void) | null>(null);

  // Check hardware & browser Web NFC support on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      const timer = setTimeout(() => setIsSupported(true), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  // Stop active NFC scanning
  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Ignore abort exception
      }
      abortControllerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Clean up scanner when component unmounts
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  // Start scanning for NFC tags (Android Web NFC)
  const startScan = useCallback(
    async (onTagScanned: (tagId: string, rawUid?: string) => void): Promise<boolean> => {
      if (typeof window === 'undefined' || !('NDEFReader' in window)) {
        setNfcError('התקן זה אינו תומך ב-Web NFC ישיר (ב-iPhone יש להצמיד את ראש המכשיר ברקע).');
        return false;
      }

      try {
        stopScan();
        setNfcError(null);
        onTagScannedRef.current = onTagScanned;

        const NDEFReaderClass = (window as unknown as { NDEFReader: NDEFReaderConstructor }).NDEFReader;
        const ndef = new NDEFReaderClass();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        await ndef.scan({ signal: controller.signal });
        setIsScanning(true);

        ndef.onreading = (event: NDEFReadingEvent) => {
          const rawUid = event.serialNumber || '';
          let resolvedCode = rawUid;

          // Attempt to extract text or URL payload from NDEF records
          if (event.message && event.message.records) {
            for (const record of event.message.records) {
              if (record.recordType === 'url' || record.recordType === 'text') {
                try {
                  let text = '';
                  if (typeof record.data === 'string') {
                    text = record.data;
                  } else if (record.data instanceof ArrayBuffer || ArrayBuffer.isView(record.data)) {
                    const decoder = new TextDecoder(record.encoding || 'utf-8');
                    text = decoder.decode(record.data);
                  }

                  if (text) {
                    // If this is a Tooly Deep-Link URL, parse ?nfc= or ?tool=
                    try {
                      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
                      const urlObj = new URL(text, origin);
                      const param = urlObj.searchParams.get('nfc') || urlObj.searchParams.get('tool');
                      if (param) {
                        resolvedCode = param.trim();
                        break;
                      } else {
                        resolvedCode = text.trim();
                      }
                    } catch {
                      resolvedCode = text.trim();
                    }
                  }
                } catch {
                  // Fallback to raw serialNumber
                }
              }
            }
          }

          // Haptic feedback pulse on tag read
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([100, 50, 100]);
            } catch {
              // Ignore vibration failure
            }
          }

          if (onTagScannedRef.current && resolvedCode) {
            onTagScannedRef.current(resolvedCode, rawUid);
          }
        };

        ndef.onreadingerror = () => {
          setNfcError('שגיאה בקריאת תגית ה-NFC. וודא שהתגית תקינה ונסה שוב.');
        };

        return true;
      } catch (err: unknown) {
        setIsScanning(false);
        const msg = err instanceof Error ? err.message : 'לא ניתן היה להפעיל סריקת NFC';
        setNfcError(msg);
        return false;
      }
    },
    [stopScan]
  );

  // Write universal NDEF URL tag compatible with ANY modern iPhone & Android
  const writeNfcTag = useCallback(
    async (assetCode: string): Promise<boolean> => {
      const cleanCode = assetCode.trim();
      if (!cleanCode) {
        setNfcError('קוד כלי לא תקין לצריבה.');
        return false;
      }

      if (typeof window === 'undefined' || !('NDEFReader' in window)) {
        setNfcError('צריבת תגיות NFC נתמכת כעת רק במכשירי Android דרך דפדפן Chrome.');
        return false;
      }

      try {
        setIsWriting(true);
        setNfcError(null);

        const NDEFReaderClass = (window as unknown as { NDEFReader: NDEFReaderConstructor }).NDEFReader;
        const ndef = new NDEFReaderClass();

        // Universal NDEF URL Deep-Link: iPhone XS-16 natively detects this in background
        const origin = window.location.origin;
        const deepLinkUrl = `${origin}/?nfc=${encodeURIComponent(cleanCode)}`;

        await ndef.write({
          records: [
            {
              recordType: 'url',
              data: deepLinkUrl,
            },
          ],
        });

        // Haptic pulse on successful write
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([150, 50, 150]);
          } catch {
            // Ignore
          }
        }

        setIsWriting(false);
        return true;
      } catch (err: unknown) {
        setIsWriting(false);
        const msg = err instanceof Error ? err.message : 'שגיאה בצריבת תגית ה-NFC';
        setNfcError(msg);
        return false;
      }
    },
    []
  );

  return {
    isSupported,
    isScanning,
    isWriting,
    nfcError,
    startScan,
    stopScan,
    writeNfcTag,
  };
}
