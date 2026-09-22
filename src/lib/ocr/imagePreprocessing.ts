/**
 * Industrial Canvas Pre-Processing Filter for Harsh Construction Field OCR
 * 
 * Specially designed to eliminate:
 * - Metallic sun glare and specular reflections
 * - Background job-site noise (scaffolding, dirt, workers)
 * - Mud, dust, and grease on tool barcode/tag plates
 * - Low-contrast text in dark container depot environments
 */

export interface PreprocessOptions {
  /** Width ratio of central ROI (Default: 0.70 = 70%) */
  roiWidthRatio?: number;
  /** Height ratio of central ROI (Default: 0.25 = 25%) */
  roiHeightRatio?: number;
  /** Scaling factor for crisp optical density (Default: 2 = 2x) */
  scale?: number;
  /** Invert output (white text on black background). Default: false (black text on white) */
  invert?: boolean;
}

export interface RoiBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes optimal Otsu threshold for binarization.
 * Maximizes inter-class variance between dark text characters and bright label background.
 * Clamps result between 45 and 215 to prevent degenerating in extreme glare or deep shadows.
 */
export function calculateOtsuThreshold(grayData: Uint8Array | Uint8ClampedArray): number {
  const total = grayData.length;
  if (total === 0) return 128;

  // 1. Compute 256-bin grayscale histogram
  const histogram = new Int32Array(256);
  for (let i = 0; i < total; i++) {
    histogram[grayData[i]]++;
  }

  // 2. Compute total sum of all pixel values
  let sumTotal = 0;
  for (let t = 0; t < 256; t++) {
    sumTotal += t * histogram[t];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let optimalThreshold = 128;

  // 3. Search for threshold that maximizes between-class variance
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumTotal - sumBackground) / weightForeground;

    // Between-class variance: wB * wF * (meanB - meanF)^2
    const varianceBetween =
      weightBackground * weightForeground * (meanBackground - meanForeground) * (meanBackground - meanForeground);

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      optimalThreshold = t;
    }
  }

  // Clamped threshold to avoid complete black-out or white-out under blinding flash/glare
  return Math.max(45, Math.min(215, optimalThreshold));
}

/**
 * Calculates central Region Of Interest (ROI) box coordinates for a given video/canvas dimension.
 */
export function getCentralRoiBox(
  sourceWidth: number,
  sourceHeight: number,
  widthRatio = 0.70,
  heightRatio = 0.25
): RoiBox {
  const width = Math.round(sourceWidth * widthRatio);
  const height = Math.round(sourceHeight * heightRatio);
  const x = Math.round((sourceWidth - width) / 2);
  const y = Math.round((sourceHeight - height) / 2);

  return { x, y, width, height };
}

/**
 * Preprocesses a video frame or canvas for industrial field OCR:
 * 1. ROI Cropping: Extracts central 70% width × 25% height region of interest.
 * 2. 2x Scale Up: Enhances optical character stroke definition for Tesseract.
 * 3. Grayscale conversion: Uses ITU-R BT.601 perceptual luminance weights.
 * 4. Otsu Adaptive Binarization: High-contrast binarization that wipes out dirt,
 *    dust smudges, and metallic reflections while keeping tag numbers razor sharp.
 */
export function preprocessFrameForOcr(
  source: HTMLVideoElement | HTMLCanvasElement,
  options?: PreprocessOptions
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const srcWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  if (!srcWidth || !srcHeight) {
    return null;
  }

  const widthRatio = options?.roiWidthRatio ?? 0.70;
  const heightRatio = options?.roiHeightRatio ?? 0.25;
  const scale = options?.scale ?? 2;
  const invert = options?.invert ?? false;

  // 1. Central ROI Cropping coordinates
  const roi = getCentralRoiBox(srcWidth, srcHeight, widthRatio, heightRatio);

  // 2. High-density offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(roi.width * scale));
  canvas.height = Math.max(1, Math.round(roi.height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Sharp rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw only the central ROI scaled onto the canvas
  ctx.drawImage(
    source,
    roi.x,
    roi.y,
    roi.width,
    roi.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // 3. Pixel Manipulation for Grayscale & Otsu Thresholding
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const pixelCount = data.length / 4;

  const grayArray = new Uint8Array(pixelCount);

  // Step A: Convert to grayscale and build pixel array
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // ITU-R BT.601: 0.299 R + 0.587 G + 0.114 B
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayArray[p] = gray;
  }

  // Step B: Calculate optimal Otsu threshold
  const threshold = calculateOtsuThreshold(grayArray);

  // Step C: High-contrast binarization (Black text on crisp white background)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const isDark = grayArray[p] < threshold;
    const finalVal = invert ? (isDark ? 255 : 0) : (isDark ? 0 : 255);

    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
    data[i + 3] = 255; // Fully opaque
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
