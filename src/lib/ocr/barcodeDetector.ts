'use client';

import { Html5QrcodeSupportedFormats } from 'html5-qrcode';

export interface BarcodeDetectionResult {
  rawValue: string;
  format: string;
  source: 'native' | 'zxing';
}

interface NativeBarcode {
  rawValue: string;
  format: string;
}

interface NativeBarcodeDetectorInstance {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<NativeBarcode[]>;
}

let nativeDetectorInstance: NativeBarcodeDetectorInstance | null = null;
let nativeDetectorTested = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let zxingDecoderInstance: any = null;
let zxingDecoderLoading = false;

/**
 * Initializes native BarcodeDetector if supported by the browser (Chrome, Edge, Android WebView).
 * Runs hardware-accelerated detection at 60fps with near-zero latency.
 */
async function getNativeDetector(): Promise<NativeBarcodeDetectorInstance | null> {
  if (typeof window === 'undefined') return null;
  if (nativeDetectorTested) return nativeDetectorInstance;

  nativeDetectorTested = true;
  if ('BarcodeDetector' in window) {
    try {
      const BD = (
        window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => NativeBarcodeDetectorInstance;
        }
      ).BarcodeDetector;

      nativeDetectorInstance = new BD({
        formats: ['qr_code', 'code_128', 'code_39', 'data_matrix', 'ean_13', 'ean_8'],
      });
      return nativeDetectorInstance;
    } catch (err) {
      console.warn('[BarcodeDetector] Native detector init error:', err);
      nativeDetectorInstance = null;
    }
  }
  return null;
}

/**
 * Fallback software decoder using ZXing from html5-qrcode for Safari / Firefox.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getZxingDecoder(): Promise<any> {
  if (zxingDecoderInstance) return zxingDecoderInstance;
  if (zxingDecoderLoading) return null;

  zxingDecoderLoading = true;
  try {
    // Dynamic import to prevent SSR/bundle conflicts
    const { ZXingHtml5QrcodeDecoder } = await import(
      'html5-qrcode/cjs/zxing-html5-qrcode-decoder.js'
    );
    const formats = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
    ];

    zxingDecoderInstance = new ZXingHtml5QrcodeDecoder(formats, false, {
      log: () => {},
      warn: () => {},
      logError: () => {},
      logErrors: () => {},
    });
    return zxingDecoderInstance;
  } catch (err) {
    console.warn('[BarcodeDetector] ZXing fallback init error:', err);
    return null;
  } finally {
    zxingDecoderLoading = false;
  }
}

// Shared offscreen canvas to minimize GC pressure during video decoding
let sharedCanvas: HTMLCanvasElement | null = null;

/**
 * Detects barcodes or QR codes from a live video element or canvas.
 * Continuously scans for QR, Code 128, Code 39, Data Matrix.
 */
export async function detectBarcodeOrQr(
  source: HTMLVideoElement | HTMLCanvasElement
): Promise<BarcodeDetectionResult | null> {
  if (typeof window === 'undefined' || !source) return null;

  // 1. First Priority: Native hardware-accelerated BarcodeDetector (~1-3ms)
  const native = await getNativeDetector();
  if (native) {
    try {
      const results = await native.detect(source);
      if (results && results.length > 0) {
        const raw = results[0].rawValue?.trim();
        if (raw) {
          return {
            rawValue: raw,
            format: results[0].format || 'barcode/qr',
            source: 'native',
          };
        }
      }
    } catch {
      // Fallback to ZXing on frame read error
    }
  }

  // 2. Secondary Fallback: ZXing Software Decoder
  try {
    const decoder = await getZxingDecoder();
    if (!decoder) return null;

    let canvasToDecode: HTMLCanvasElement;
    if (source instanceof HTMLCanvasElement) {
      canvasToDecode = source;
    } else {
      const w = source.videoWidth;
      const h = source.videoHeight;
      if (!w || !h) return null;

      if (!sharedCanvas) {
        sharedCanvas = document.createElement('canvas');
      }
      // Scaled down resolution (max 800px) for high decoding throughput
      const targetW = Math.min(w, 800);
      const targetH = Math.round((h * targetW) / w);
      sharedCanvas.width = targetW;
      sharedCanvas.height = targetH;

      const ctx = sharedCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(source, 0, 0, targetW, targetH);
      canvasToDecode = sharedCanvas;
    }

    const res = await decoder.decodeAsync(canvasToDecode);
    if (res && res.text) {
      const raw = res.text.trim();
      if (raw) {
        return {
          rawValue: raw,
          format: res.format?.toString() || 'qr_or_barcode',
          source: 'zxing',
        };
      }
    }
  } catch {
    // Normal: frame does not contain a recognizable barcode or QR
  }

  return null;
}

/**
 * Extracts clean asset tag from QR or Barcode raw payload.
 * Supports deep links (e.g., https://tooly.app/asset/ZR-1032), query parameters,
 * and standard serial strings (ZR-1032, TOOL-0024, 1032).
 */
export function extractTagFromBarcodePayload(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // 1. If payload contains URL structure, extract target parameter or path
  if (trimmed.includes('/') || trimmed.includes('?')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const paramTag =
        url.searchParams.get('tool') ||
        url.searchParams.get('qr') ||
        url.searchParams.get('tag') ||
        url.searchParams.get('nfc');
      if (paramTag) return paramTag.trim();

      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const lastSeg = segments[segments.length - 1];
        if (/(?:ZR[- ]?)?\d{3,5}/i.test(lastSeg)) {
          return lastSeg.replace(/\s+/g, '-').toUpperCase();
        }
      }
    } catch {
      // Continue to pattern matcher
    }
  }

  // 2. Strict asset tag regex: /(?:ZR[- ]?)?\d{3,5}/i
  const match = trimmed.match(/(?:^|[^A-Za-z0-9])((?:ZR[- ]?)?\d{3,5})(?:$|[^A-Za-z0-9])/i);
  if (match) {
    const matched = match[1].trim();
    // Normalize "ZR 1032" or "ZR1032" to "ZR-1032"
    if (/^ZR\s*(\d{3,5})$/i.test(matched)) {
      return matched.replace(/^ZR\s*(\d{3,5})$/i, 'ZR-$1').toUpperCase();
    }
    return matched.toUpperCase();
  }

  // 3. Known organization prefixes: (TOOL|MOHA|ALI|MH)[- ]?\d{3,5}
  const prefixMatch = trimmed.match(
    /(?:^|[^A-Za-z0-9])((?:TOOL|MOHA|ALI|MH)[-_ ]?\d{3,5})(?:$|[^A-Za-z0-9])/i
  );
  if (prefixMatch) {
    return prefixMatch[1].replace(/\s+/g, '-').toUpperCase();
  }

  return trimmed;
}
