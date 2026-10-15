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
  /** Width ratio of central ROI (Default: 0.60 = 60% of frame) */
  roiWidthRatio?: number;
  /** Height ratio of central ROI (Default: 0.60 = 60% of frame) */
  roiHeightRatio?: number;
  /** Scaling factor for crisp optical density (Default: 2 = 2x) */
  scale?: number;
  /** Invert output (white text on black background). Default: false (black text on white) */
  invert?: boolean;
  /** Amount of unsharp mask sharpening (Default: 1.5) */
  unsharpAmount?: number;
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
 * Clamps result between 40 and 220 to prevent degenerating in extreme glare or deep shadows.
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
  return Math.max(40, Math.min(220, optimalThreshold));
}

/**
 * Calculates central Region Of Interest (ROI) box coordinates for a given video/canvas dimension.
 * Defaults strictly to the center 60% of the frame (both width and height).
 */
export function getCentralRoiBox(
  sourceWidth: number,
  sourceHeight: number,
  widthRatio = 0.60,
  heightRatio = 0.60
): RoiBox {
  const width = Math.max(1, Math.round(sourceWidth * widthRatio));
  const height = Math.max(1, Math.round(sourceHeight * heightRatio));
  const x = Math.max(0, Math.round((sourceWidth - width) / 2));
  const y = Math.max(0, Math.round((sourceHeight - height) / 2));

  return { x, y, width, height };
}

/**
 * High-performance 2D Unsharp Masking filter.
 * Sharpening edges of worn/dirty numbers and dot-matrix serial tags before OCR:
 * sharp = original + amount * (original - blur).
 */
export function applyUnsharpMask(
  grayData: Uint8Array,
  width: number,
  height: number,
  amount = 1.5
): Uint8Array {
  const len = grayData.length;
  const output = new Uint8Array(len);
  const w = width;
  const h = height;

  for (let y = 0; y < h; y++) {
    const yPrev = y > 0 ? y - 1 : 0;
    const yNext = y < h - 1 ? y + 1 : h - 1;

    const rowCur = y * w;
    const rowPrev = yPrev * w;
    const rowNext = yNext * w;

    for (let x = 0; x < w; x++) {
      const xPrev = x > 0 ? x - 1 : 0;
      const xNext = x < w - 1 ? x + 1 : w - 1;

      const idx = rowCur + x;
      const original = grayData[idx];

      // 3x3 weighted Gaussian-approximated blur kernel
      // [ 1, 2, 1 ]
      // [ 2, 4, 2 ] / 16
      // [ 1, 2, 1 ]
      const blur =
        (grayData[rowPrev + xPrev] +
          (grayData[rowPrev + x] << 1) +
          grayData[rowPrev + xNext] +
          (grayData[rowCur + xPrev] << 1) +
          (original << 2) +
          (grayData[rowCur + xNext] << 1) +
          grayData[rowNext + xPrev] +
          (grayData[rowNext + x] << 1) +
          grayData[rowNext + xNext]) >> 4;

      const diff = original - blur;
      const sharpened = original + amount * diff;
      output[idx] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
  }

  return output;
}

/**
 * Preprocesses a video frame or canvas for industrial field OCR:
 * 1. ROI Cropping: Extracts central 60% width × 60% height region of interest (center 60% of frame).
 * 2. 2x Scale Up: Enhances optical stroke resolution for dot-matrix / printed serial text.
 * 3. Grayscale conversion: Uses ITU-R BT.601 perceptual luminance weights.
 * 4. Unsharp Masking: Sharpens high-frequency edges of serial numbers and printed digits.
 * 5. Dynamic Otsu Adaptive Binarization: High-contrast binarization that wipes out dirt,
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

  // 1. Crop strictly to the target bounding box (center 60% of frame)
  const widthRatio = options?.roiWidthRatio ?? 0.60;
  const heightRatio = options?.roiHeightRatio ?? 0.60;
  const scale = options?.scale ?? 2;
  const invert = options?.invert ?? false;
  const unsharpAmount = options?.unsharpAmount ?? 1.5;

  const roi = getCentralRoiBox(srcWidth, srcHeight, widthRatio, heightRatio);

  // 2. Scale up the image by 2x to enhance resolution of dot-matrix / printed serial text
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(roi.width * scale));
  canvas.height = Math.max(1, Math.round(roi.height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Sharp rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw strictly the central 60% ROI scaled 2x onto the canvas
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

  // 3. Pixel Manipulation for Grayscale, Unsharp Masking & Dynamic Otsu Thresholding
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const pixelCount = data.length / 4;

  const rawGray = new Uint8Array(pixelCount);

  // Step A: Convert to grayscale using ITU-R BT.601: 0.299 R + 0.587 G + 0.114 B
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    rawGray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Step B: Apply Unsharp Masking to sharpen edges of worn numbers and dot-matrix digits
  const sharpGray = applyUnsharpMask(rawGray, canvas.width, canvas.height, unsharpAmount);

  // Step C: Dynamic Range Auto-Stretching on sharpened image
  let minGray = 255;
  let maxGray = 0;
  for (let p = 0; p < pixelCount; p++) {
    const val = sharpGray[p];
    if (val < minGray) minGray = val;
    if (val > maxGray) maxGray = val;
  }

  const range = maxGray - minGray;
  const contrastEnhanced = new Uint8Array(pixelCount);
  if (range > 15 && range < 235) {
    for (let p = 0; p < pixelCount; p++) {
      contrastEnhanced[p] = Math.round(((sharpGray[p] - minGray) / range) * 255);
    }
  } else {
    contrastEnhanced.set(sharpGray);
  }

  // Step D: Calculate optimal dynamic Otsu threshold
  const threshold = calculateOtsuThreshold(contrastEnhanced);

  // Step E: Dynamic Otsu High-Contrast Binarization (Crisp black text on pure white background)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const isDark = contrastEnhanced[p] < threshold;
    const finalVal = invert ? (isDark ? 255 : 0) : (isDark ? 0 : 255);

    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
    data[i + 3] = 255; // Fully opaque
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Captures a clean, sharp center-cropped frame (center 60% of frame) from video/canvas for Cloud OCR.
 */
export function captureSharpCenterCrop(
  source: HTMLVideoElement | HTMLCanvasElement,
  roiRatio = 0.60,
  scale = 2
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const srcWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  if (!srcWidth || !srcHeight) {
    return null;
  }

  const roi = getCentralRoiBox(srcWidth, srcHeight, roiRatio, roiRatio);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(roi.width * scale));
  canvas.height = Math.max(1, Math.round(roi.height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

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

  // High-contrast edge sharpening strictly preserving black text on white backgrounds (never inverted)
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Calculate luminance range
    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = maxLum - minLum;
    // Auto-stretch contrast if contrast is compressed, strictly keeping dark text dark and light background light
    if (range > 20 && range < 235) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, Math.round(((data[i] - minLum) / range) * 255)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(((data[i + 1] - minLum) / range) * 255)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(((data[i + 2] - minLum) / range) * 255)));
      }
      ctx.putImageData(imgData, 0, 0);
    }
  } catch (err) {
    console.warn('[captureSharpCenterCrop] Image processing warning:', err);
  }

  return canvas;
}

/**
 * Crops ONLY the horizontal center strip around the green laser line
 * (middle 75% width, middle 30% height of the visible viewfinder),
 * accounting for CSS object-fit: cover on the video element, scaled to a crisp 600x200 canvas.
 * Applies grayscale contrast boost on this 600x200 strip so text like "zr 1084" or "ZR-1084" is bold black on white.
 */
export function cropLaserStripToCanvas(
  video: HTMLVideoElement,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !video) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;

  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Account for CSS object-fit: cover
  const cw = video.clientWidth || video.parentElement?.clientWidth || 0;
  const ch = video.clientHeight || video.parentElement?.clientHeight || 0;

  let visW = vw;
  let visH = vh;
  let visX = 0;
  let visY = 0;

  if (cw > 0 && ch > 0) {
    const scale = Math.max(cw / vw, ch / vh);
    visW = cw / scale;
    visH = ch / scale;
    visX = (vw - visW) / 2;
    visY = (vh - visH) / 2;
  }

  // Laser strip: middle 75% width, middle 30% height of the visible viewfinder
  const cropW = visW * 0.75;
  const cropH = visH * 0.30;
  const cropX = Math.max(0, visX + (visW - cropW) / 2);
  const cropY = Math.max(0, visY + (visH - cropH) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    video,
    cropX,
    cropY,
    cropW,
    cropH,
    0,
    0,
    600,
    200
  );

  // Apply Grayscale Contrast Boost so text like "zr 1084" or "ZR-1084" is bold black on white
  try {
    const imgData = ctx.getImageData(0, 0, 600, 200);
    const data = imgData.data;
    const pixelCount = 600 * 200;
    const gray = new Uint8Array(pixelCount);

    let min = 255;
    let max = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[p] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }

    const range = max - min;
    let threshold = 128;
    if (range > 20) {
      threshold = calculateOtsuThreshold(gray);
    }

    // Determine polarity: count pixels darker than threshold
    let darkCount = 0;
    for (let p = 0; p < pixelCount; p++) {
      if (gray[p] < threshold) darkCount++;
    }
    const isDarkBackground = darkCount > pixelCount * 0.55;

    // High-contrast boost: bold black (0) text on pure white (255) background
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = gray[p];
      let isText = false;
      if (isDarkBackground) {
        isText = g >= threshold;
      } else {
        isText = g < threshold;
      }

      const val = isText ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.warn('[cropLaserStripToCanvas] Contrast boost error:', err);
  }

  return canvas;
}

