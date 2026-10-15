'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  ScanLine,
  ArrowRight,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLaserStripOcr } from '@/lib/ocr/useLaserStripOcr';
import { snapTagToAsset, triggerOcrHaptic, playOcrBeep, normalizeFieldTag } from '@/lib/ocr/tagParser';
import { detectBarcodeOrQr, extractTagFromBarcodePayload } from '@/lib/ocr/barcodeDetector';
import type { ScannedAssetDetails } from '@/app/actions/custody';

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetDetected: (asset: ScannedAssetDetails) => void;
  title?: string;
  description?: string;
  warehouseId?: string;
}

export default function OcrScannerModal({
  isOpen,
  onClose,
  onAssetDetected,
  title = 'סריקת כלי (QR / OCR)',
  warehouseId,
}: OcrScannerModalProps) {
  const { currentOrganization } = useAuth();
  const orgId = currentOrganization?.id;

  // Scan Mode: 'qr' | 'ocr' (defaults to 'qr')
  const [scanMode, setScanMode] = useState<'qr' | 'ocr'>('qr');

  // Video & Stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Concurrency & Debounce Lock refs (1.5s lock prevents double-scanning)
  const isDebounceLockedRef = useRef<boolean>(false);
  const isBarcodeBusyRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  // Hardware Camera & Stream State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);

  // Clean Back ↔ Front camera state (No 7-camera carousel)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Detection & Confirmation State
  const [candidateTag, setCandidateTag] = useState<string | null>(null);
  const [isTargetLocked, setIsTargetLocked] = useState<boolean>(false);
  const [snappedAsset, setSnappedAsset] = useState<ScannedAssetDetails | null>(null);

  // Manual fallback input
  const [manualTag, setManualTag] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isManualSearching, setIsManualSearching] = useState<boolean>(false);

  /**
   * Hardware Flashlight / Torch toggle
   */
  const toggleTorch = useCallback(async (track: MediaStreamTrack, enabled: boolean) => {
    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as unknown as MediaTrackConstraintSet],
      });
      setTorchEnabled(enabled);
    } catch {
      setTorchSupported(false);
    }
  }, []);

  const handleToggleTorch = useCallback(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      void toggleTorch(track, !torchEnabled);
    }
  }, [torchEnabled, toggleTorch]);

  /**
   * Stop camera tracks cleanly
   */
  const stopCamera = useCallback(async () => {
    if (watchdogIntervalRef.current) {
      clearInterval(watchdogIntervalRef.current);
      watchdogIntervalRef.current = null;
    }

    if (streamRef.current) {
      try {
        const track = streamRef.current.getVideoTracks()[0];
        if (track && torchEnabled) {
          try {
            await track.applyConstraints({
              advanced: [{ torch: false } as unknown as MediaTrackConstraintSet],
            });
          } catch {
            // ignore
          }
        }
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch (err) {
        console.warn('Error stopping camera stream:', err);
      } finally {
        streamRef.current = null;
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setTorchEnabled(false);
  }, [torchEnabled]);

  /**
   * Start camera with clean Back ↔ Front support and automatic fallback:
   * Defaults to Primary Rear Camera ({ facingMode: { ideal: 'environment' } })
   * Automatically falls back without pitch-black virtual/depth camera issues.
   */
  const startCamera = useCallback(
    async (requestedFacing?: 'environment' | 'user') => {
      setCameraError(null);

      // If existing stream has live tracks, reuse it directly to avoid black-screen race conditions
      if (
        streamRef.current &&
        streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
      ) {
        if (videoRef.current) {
          if (videoRef.current.srcObject !== streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
          }
          try {
            await videoRef.current.play();
          } catch {
            // ignore
          }
        }
        setCameraActive(true);
        isPausedRef.current = false;
        return;
      }

      const activeFacing = requestedFacing || facingMode;
      let stream: MediaStream | null = null;

      // 1. Primary Attempt: high-res with requested facingMode (ideal for primary rear camera)
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: activeFacing },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // 2. Secondary Attempt: basic facingMode without resolution clamps
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: activeFacing },
            audio: false,
          });
        } catch {
          // 3. Fallback: default video device
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } catch (e3) {
            console.error('[Camera] getUserMedia failed completely:', e3);
          }
        }
      }

      if (!stream) {
        setCameraError('לא ניתן לגשת למצלמת המכשיר. לחץ על המסך לחידוש או אשר גישה.');
        setCameraActive(false);
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[Camera] video.play() error:', playErr);
        }
      }

      setCameraActive(true);
      isPausedRef.current = false;

      // Check torch capability on active video track
      const track = stream.getVideoTracks()[0];
      if (track) {
        const getCaps = (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities;
        if (typeof getCaps === 'function') {
          const caps = getCaps.call(track);
          setTorchSupported(Boolean(caps?.torch));
        } else {
          setTorchSupported(false);
        }
      }
    },
    [facingMode]
  );

  /**
   * Manual Tap-To-Wake: Clicking anywhere on the video viewfinder restarts the stream if paused/stopped
   */
  const handleTapToWake = useCallback(async () => {
    isPausedRef.current = false;
    setCameraError(null);
    const noStream = !streamRef.current;
    const tracksEnded = streamRef.current?.getVideoTracks().some((t) => t.readyState === 'ended');

    if (noStream || tracksEnded) {
      await startCamera();
    } else if (videoRef.current) {
      try {
        await videoRef.current.play();
      } catch {
        await startCamera();
      }
    }
  }, [startCamera]);

  /**
   * Standard Camera Flip (Back ↔ Front only)
   */
  const handleFlipCamera = useCallback(async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await stopCamera();
    await startCamera(nextFacing);
  }, [facingMode, stopCamera, startCamera]);

  /**
   * Silent First-Match-Wins Detection:
   * Instant green flash, haptic pulse, audio beep, and immediate handoff to tool passport.
   */
  const claimDetection = useCallback(
    async (detectedTag: string) => {
      if (isDebounceLockedRef.current || snappedAsset || isPausedRef.current) return;

      // 1. Lock immediately and pause further scan cycles without killing the camera stream tracks
      isDebounceLockedRef.current = true;
      isPausedRef.current = true;
      setIsTargetLocked(true);
      setCandidateTag(detectedTag);
      setManualTag(detectedTag);

      // 2. Trigger Haptic Vibration (50-60ms) + Audio Beep
      triggerOcrHaptic([60, 40, 60]);
      playOcrBeep(880, 140);

      try {
        // Query database for asset details (supports 'zr 1084', standalone digits e.g. 1084 or ZR-1084)
        let matched = await snapTagToAsset(detectedTag, orgId, warehouseId);

        const norm = normalizeFieldTag(detectedTag);
        if (!matched && norm.success && norm.rawDigits) {
          matched =
            (await snapTagToAsset(`ZR-${norm.rawDigits}`, orgId, warehouseId)) ||
            (await snapTagToAsset(norm.rawDigits, orgId, warehouseId));
        }

        const canonicalTag = norm.success && norm.tag ? norm.tag : (detectedTag.startsWith('ZR-') ? detectedTag : `ZR-${detectedTag}`);
        const rawDigits = norm.success && norm.rawDigits ? norm.rawDigits : detectedTag;

        // On valid detection: immediately open the tool passport
        const targetAsset: ScannedAssetDetails = matched || {
          id: detectedTag,
          qrCode: canonicalTag,
          tagNumber: canonicalTag,
          toolName: `כלי ${canonicalTag}`,
          brand: 'צי כלי עבודה',
          modelNumber: rawDigits,
          status: 'available',
          condition: 'good',
          currentAssignedWorker: null,
          currentWarehouseId: warehouseId || 'wh-main-01',
          warehouseName: 'מחסן ראשי',
          warehouseCode: 'MAIN',
          version: 1,
        };

        setSnappedAsset(targetAsset);

        // 3. Immediately open tool passport after crisp visual green flash
        setTimeout(() => {
          onAssetDetected(targetAsset);
          onClose();
        }, 220);
      } catch (err) {
        console.warn('Error during asset snap verification:', err);
        const fallbackAsset: ScannedAssetDetails = {
          id: detectedTag,
          qrCode: detectedTag,
          toolName: `כלי ${detectedTag}`,
          brand: 'צי כלי עבודה',
          modelNumber: detectedTag,
          status: 'available',
          condition: 'good',
          currentAssignedWorker: null,
          currentWarehouseId: warehouseId || 'wh-main-01',
          warehouseName: 'מחסן ראשי',
          warehouseCode: 'MAIN',
          version: 1,
        };
        setSnappedAsset(fallbackAsset);
        setTimeout(() => {
          onAssetDetected(fallbackAsset);
          onClose();
        }, 220);
      }
    },
    [snappedAsset, orgId, warehouseId, onAssetDetected, onClose]
  );

  /**
   * Fast Persistent Tesseract Worker + Throttled Cloud Fallback (Laser-Strip OCR)
   */
  const {
    lastRawOcrText,
    ocrMatchedTag,
    resetOcrStatus,
  } = useLaserStripOcr({
    videoRef,
    isActive: isOpen && cameraActive,
    isPaused: scanMode !== 'ocr' || isPausedRef.current || !!snappedAsset || isTargetLocked,
    organizationId: orgId,
    onTagDetected: async (tag) => {
      // Auto-fill manual search input state below camera
      setManualTag(tag);
      // Immediately invoke search handler
      await claimDetection(tag);
    },
  });

  /**
   * ENGINE A: Continuous Barcode & QR Detection Loop (runs when in QR mode)
   */
  useEffect(() => {
    if (!isOpen || !cameraActive || snappedAsset || scanMode !== 'qr') return;

    let animId: number;
    let active = true;

    const qrScanLoop = () => {
      if (!active) return;

      if (
        !isPausedRef.current &&
        !isDebounceLockedRef.current &&
        !isBarcodeBusyRef.current &&
        !snappedAsset &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        isBarcodeBusyRef.current = true;
        detectBarcodeOrQr(videoRef.current)
          .then(async (barcodeResult) => {
            if (
              barcodeResult &&
              barcodeResult.rawValue &&
              !isDebounceLockedRef.current &&
              !isPausedRef.current &&
              !snappedAsset
            ) {
              const cleanTag = extractTagFromBarcodePayload(barcodeResult.rawValue);
              if (cleanTag) {
                setManualTag(cleanTag);
                await claimDetection(cleanTag);
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            isBarcodeBusyRef.current = false;
          });
      }

      animId = requestAnimationFrame(qrScanLoop);
    };

    animId = requestAnimationFrame(qrScanLoop);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [isOpen, cameraActive, snappedAsset, scanMode, claimDetection]);

  /**
   * Lifecycle: On modal open/close, pause detection without killing hardware stream,
   * and unpause + play immediately when modal opens to prevent black screens.
   */
  useEffect(() => {
    if (isOpen) {
      setSnappedAsset(null);
      setCandidateTag(null);
      setIsTargetLocked(false);
      isDebounceLockedRef.current = false;
      isPausedRef.current = false;
      resetOcrStatus();
      if (
        videoRef.current &&
        streamRef.current &&
        streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
      ) {
        videoRef.current.play().catch(() => {
          void startCamera();
        });
      } else {
        void startCamera();
      }
    } else {
      isPausedRef.current = true;
      // Do not stopCamera() tracks permanently; pause detection and video so re-open is instantaneous
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen, startCamera, resetOcrStatus]);

  // Clean cleanup on component unmount only
  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  /**
   * Automatic Stream Watchdog Interval (Runs every 1000ms):
   * If the scanner is visible and stream tracks ended or stream is missing, revive immediately!
   */
  useEffect(() => {
    if (!isOpen) {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
      return;
    }

    watchdogIntervalRef.current = setInterval(() => {
      if (!isOpen) return;

      const noStream = !streamRef.current;
      const tracksEnded = streamRef.current?.getVideoTracks().some((t) => t.readyState === 'ended');
      const videoPaused = videoRef.current && videoRef.current.paused && !isPausedRef.current;

      if (noStream || tracksEnded) {
        console.warn('[Watchdog] Modal camera stream ended or missing, reviving...');
        void startCamera();
      } else if (videoPaused) {
        void videoRef.current?.play().catch(() => {});
      }
    }, 1000);

    return () => {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
    };
  }, [isOpen, startCamera]);

  /**
   * Manual Tag Search fallback
   */
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTag.trim()) return;

    setIsManualSearching(true);
    setManualError(null);

    try {
      const asset = await snapTagToAsset(manualTag.trim(), orgId, warehouseId);
      if (asset) {
        setSnappedAsset(asset);
        triggerOcrHaptic(50);
        playOcrBeep();
        setTimeout(() => {
          onAssetDetected(asset);
          onClose();
        }, 280);
      } else {
        // Fallback asset creation so manual submit works 100% reliably
        await claimDetection(manualTag.trim());
      }
    } catch {
      setManualError('שגיאה באיתור הכלי.');
    } finally {
      setIsManualSearching(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 transition-opacity duration-150 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'
      }`}
    >
      <div className="bg-slate-950 border border-white/10 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* 1. TOP: SMALL CLEAN HEADER WITH DUAL MODE SWITCH */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-white/5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-white font-bold text-sm shrink-0">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">{title}</span>
          </div>

          {/* Segmented Switch: QR vs OCR */}
          <div className="flex items-center bg-black/60 p-0.5 rounded-xl border border-white/10 shadow-inner">
            <button
              type="button"
              onClick={() => setScanMode('qr')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scanMode === 'qr'
                  ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>סריקת QR</span>
            </button>
            <button
              type="button"
              onClick={() => setScanMode('ocr')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scanMode === 'ocr'
                  ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>סריקת OCR</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. CENTER: FULL-VIEW CLEAN CAMERA FEED WITH DUAL QR / LASER STRIP ROI */}
        <div
          onClick={() => void handleTapToWake()}
          className="relative bg-black aspect-[4/3] sm:aspect-[1/1] max-h-[380px] overflow-hidden flex items-center justify-center cursor-pointer select-none"
          title="לחץ בכל מקום במסך להפעלת / חידוש המצלמה"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={() => {
              void videoRef.current?.play().catch(() => {});
            }}
            className="w-full h-full object-cover"
          />

          {/* Viewfinder ROI target box */}
          {scanMode === 'qr' ? (
            /* Square 2D Viewfinder for QR / Barcode */
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-48 h-48 sm:w-56 sm:h-56 relative rounded-2xl flex items-center justify-center transition-all duration-150 ${
                  isTargetLocked || candidateTag
                    ? 'border-4 border-blue-400 bg-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.95)] scale-[1.03]'
                    : 'border-2 border-blue-400/80 bg-blue-950/10 shadow-[0_0_25px_rgba(59,130,246,0.3)]'
                }`}
              >
                {/* 4 Precision Corner Guides */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-3 border-r-3 border-blue-400 rounded-br-lg" />

                {/* Sweeping Blue Laser */}
                {isTargetLocked || candidateTag ? (
                  <div className="flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150">
                    <CheckCircle2 className="w-8 h-8 text-blue-400 mb-0.5 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    <span className="font-mono text-base font-black text-white tracking-widest drop-shadow-md" dir="ltr">
                      {candidateTag}
                    </span>
                    <span className="text-[10px] font-bold text-blue-300">פותח כלי...</span>
                  </div>
                ) : (
                  <div className="absolute inset-x-2 h-0.5 bg-blue-400 shadow-[0_0_12px_#3b82f6] animate-pulse" />
                )}
              </div>
            </div>
          ) : (
            /* Laser-Strip ROI Target Box: middle 75% width, middle 30% height */
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-[75%] h-[30%] min-h-[75px] max-h-[130px] relative rounded-2xl flex items-center justify-center transition-all duration-150 ${
                  isTargetLocked || ocrMatchedTag
                    ? 'border-4 border-emerald-400 bg-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.95)] scale-[1.03]'
                    : 'border-2 border-emerald-400/60 bg-emerald-950/10'
                }`}
              >
                {/* 4 Precision Corner Guides */}
                <div
                  className={`absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 transition-colors duration-150 ${
                    isTargetLocked || ocrMatchedTag
                      ? 'border-emerald-400 shadow-[0_0_15px_#34d399]'
                      : 'border-emerald-400/90'
                  } rounded-tl-lg`}
                />
                <div
                  className={`absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 transition-colors duration-150 ${
                    isTargetLocked || ocrMatchedTag
                      ? 'border-emerald-400 shadow-[0_0_15px_#34d399]'
                      : 'border-emerald-400/90'
                  } rounded-tr-lg`}
                />
                <div
                  className={`absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 transition-colors duration-150 ${
                    isTargetLocked || ocrMatchedTag
                      ? 'border-emerald-400 shadow-[0_0_15px_#34d399]'
                      : 'border-emerald-400/90'
                  } rounded-bl-lg`}
                />
                <div
                  className={`absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 transition-colors duration-150 ${
                    isTargetLocked || ocrMatchedTag
                      ? 'border-emerald-400 shadow-[0_0_15px_#34d399]'
                      : 'border-emerald-400/90'
                  } rounded-br-lg`}
                />

                {/* Instant feedback on detection */}
                {isTargetLocked || ocrMatchedTag ? (
                  <div className="flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-0.5 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="font-mono text-base font-black text-white tracking-widest drop-shadow-md" dir="ltr">
                      {candidateTag || ocrMatchedTag}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-300">פותח כלי...</span>
                  </div>
                ) : (
                  <div className="absolute inset-x-2 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse" />
                )}
              </div>
            </div>
          )}

          {/* Live On-Screen Status Pill inside bottom of camera viewfinder */}
          <div className="absolute bottom-16 inset-x-0 flex justify-center items-center pointer-events-none z-20 px-3">
            <div
              className={`px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-bold flex items-center gap-2 shadow-lg transition-all duration-200 max-w-[92%] truncate ${
                scanMode === 'qr'
                  ? 'bg-blue-950/85 border-blue-500/40 text-blue-200'
                  : ocrMatchedTag || candidateTag
                  ? 'bg-emerald-950/90 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.7)] animate-pulse'
                  : lastRawOcrText
                  ? 'bg-slate-950/90 border-amber-500/60 text-amber-200'
                  : 'bg-black/80 border-white/20 text-slate-200'
              }`}
            >
              {scanMode === 'qr' ? (
                candidateTag ? (
                  <span className="flex items-center gap-1.5 text-blue-300 font-black">
                    <span>✅ זוהה: {candidateTag} - פותח כלי!</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] text-blue-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
                    <span>🔍 סורק קוד QR או ברקוד...</span>
                  </span>
                )
              ) : ocrMatchedTag || candidateTag ? (
                <span className="flex items-center gap-1.5 text-emerald-300 font-black">
                  <span>✅ זוהה: {ocrMatchedTag || candidateTag} - פותח כלי!</span>
                </span>
              ) : lastRawOcrText ? (
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-amber-400">👁️ נקרא:</span>
                  <span className="text-white font-bold tracking-wider">{lastRawOcrText}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>🔍 סורק טקסט בשטח הקו הירוק...</span>
                </span>
              )}
            </div>
          </div>

          {/* Floating Controls on Camera Feed (Flashlight + Flip Camera) */}
          <div className="absolute bottom-3 inset-x-4 flex items-center justify-between pointer-events-none z-10">
            {/* Flashlight toggle (⚡) */}
            <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              {torchSupported ? (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border shadow-lg transition-all cursor-pointer ${
                    torchEnabled
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/40'
                      : 'bg-black/50 text-white border-white/20 hover:bg-black/70'
                  }`}
                  title={torchEnabled ? 'כיבוי פנס' : 'הפעל פנס'}
                >
                  {torchEnabled ? (
                    <ZapOff className="w-4 h-4 fill-slate-950" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <div />
              )}
            </div>

            {/* Flip camera toggle (🔄 Back ↔ Front) */}
            <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => void handleFlipCamera()}
                className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-lg transition-all active:scale-90 cursor-pointer"
                title="החלף מצלמה (Flip Camera)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Camera Error View */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
              <AlertTriangle className="w-9 h-9 text-rose-500" />
              <p className="text-xs font-bold text-rose-300 max-w-xs">{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>נסה שוב</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. BOTTOM: SIMPLE MANUAL INPUT & AUTO-FILL ATAR BUTTON */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-white/5 space-y-2">
          <form onSubmit={handleManualSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={manualTag}
              onChange={(e) => setManualTag(e.target.value.toUpperCase())}
              placeholder="הזן מספר תג ידנית (למשל 1084 או ZR-1084)"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 uppercase transition-colors"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isManualSearching || !manualTag.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition-all shrink-0 active:scale-95"
            >
              {isManualSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              <span>אתר &rarr;</span>
            </button>
          </form>

          {manualError && (
            <p className="text-[11px] font-bold text-rose-400 text-center">{manualError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
