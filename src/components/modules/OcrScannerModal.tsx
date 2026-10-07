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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOcrScanner } from '@/lib/ocr/useOcrScanner';
import { snapTagToAsset, triggerOcrHaptic, playOcrBeep } from '@/lib/ocr/tagParser';
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

  // Video & Stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Concurrency & Debounce Lock refs (1.5s lock prevents double-scanning)
  const isDebounceLockedRef = useRef<boolean>(false);
  const isBarcodeBusyRef = useRef<boolean>(false);
  const isOcrBusyRef = useRef<boolean>(false);

  // Hardware Camera & Stream State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);

  // Clean Back ↔ Front camera state (No 7-camera carousel)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Background OCR Hook
  const {
    isOcrReady,
    initOcr,
    terminateOcr,
    recognizeFrameWithDetails,
  } = useOcrScanner();

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
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
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
      void initOcr();

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
        setCameraError('לא ניתן לגשת למצלמת המכשיר. אנא אשר גישה למצלמה.');
        setCameraActive(false);
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);

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
    [facingMode, initOcr]
  );

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
   * Instant green flash, 50ms haptic pulse, audio beep, and instant handoff to tool.
   */
  const claimDetection = useCallback(
    async (detectedTag: string) => {
      if (isDebounceLockedRef.current || snappedAsset) return;

      // 1. Lock immediately to prevent double-scanning (debounce 1.5s)
      isDebounceLockedRef.current = true;
      setIsTargetLocked(true);
      setCandidateTag(detectedTag);

      // 2. Instant Haptic (50ms) + Audio Beep
      triggerOcrHaptic(50);
      playOcrBeep();

      try {
        const matched = await snapTagToAsset(detectedTag, orgId, warehouseId);
        if (matched) {
          setSnappedAsset(matched);

          // 3. Instant handoff after crisp 280ms visual lock confirmation
          setTimeout(() => {
            onAssetDetected(matched);
            onClose();
          }, 280);
        } else {
          // Tag detected but not found in current organization
          // Release camera lock after 1.5s debounce
          setTimeout(() => {
            isDebounceLockedRef.current = false;
            setIsTargetLocked(false);
          }, 1500);
        }
      } catch (err) {
        console.warn('Error during asset snap verification:', err);
        setTimeout(() => {
          isDebounceLockedRef.current = false;
          setIsTargetLocked(false);
        }, 1500);
      }
    },
    [snappedAsset, orgId, warehouseId, onAssetDetected, onClose]
  );

  /**
   * Silent Dual-Engine Scanning Loop (Runs in background at top speed)
   */
  const performDualScanCycle = useCallback(async () => {
    if (!videoRef.current || !cameraActive || isDebounceLockedRef.current || snappedAsset) {
      return;
    }

    if (videoRef.current.readyState < 2) {
      return;
    }

    const video = videoRef.current;

    // ENGINE A: Barcode & QR Detector
    if (!isBarcodeBusyRef.current && !isDebounceLockedRef.current) {
      isBarcodeBusyRef.current = true;
      void detectBarcodeOrQr(video)
        .then(async (barcodeResult) => {
          if (barcodeResult && barcodeResult.rawValue && !isDebounceLockedRef.current) {
            const cleanTag = extractTagFromBarcodePayload(barcodeResult.rawValue);
            if (cleanTag) {
              await claimDetection(cleanTag);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          isBarcodeBusyRef.current = false;
        });
    }

    // ENGINE B: Heavy-Duty OCR Engine
    if (isOcrReady && !isOcrBusyRef.current && !isDebounceLockedRef.current) {
      isOcrBusyRef.current = true;
      void recognizeFrameWithDetails(video)
        .then(async (ocrDetails) => {
          if (ocrDetails && ocrDetails.tag && !isDebounceLockedRef.current) {
            await claimDetection(ocrDetails.tag);
          }
        })
        .catch(() => {})
        .finally(() => {
          isOcrBusyRef.current = false;
        });
    }
  }, [cameraActive, snappedAsset, isOcrReady, recognizeFrameWithDetails, claimDetection]);

  /**
   * Lifecycle
   */
  useEffect(() => {
    if (isOpen) {
      setSnappedAsset(null);
      setCandidateTag(null);
      setIsTargetLocked(false);
      isDebounceLockedRef.current = false;
      void startCamera();
    } else {
      void stopCamera();
      void terminateOcr();
    }

    return () => {
      void stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, terminateOcr]);

  /**
   * Cadence: runs every 200ms in background
   */
  useEffect(() => {
    if (!cameraActive || snappedAsset) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    scanIntervalRef.current = setInterval(() => {
      void performDualScanCycle();
    }, 200);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraActive, snappedAsset, performDualScanCycle]);

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
        setManualError(`לא נמצא כלי התואם לתגית "${manualTag.trim()}".`);
      }
    } catch {
      setManualError('שגיאה באיתור הכלי.');
    } finally {
      setIsManualSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-950 border border-white/10 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* 1. TOP: SMALL CLEAN HEADER */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. CENTER: FULL-VIEW CLEAN CAMERA FEED WITH THIN MODERN FOCUS FRAME */}
        <div className="relative bg-black aspect-[4/3] sm:aspect-[1/1] max-h-[380px] overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Minimalist Viewfinder Overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={`w-[68%] aspect-square max-w-[240px] relative rounded-3xl flex items-center justify-center transition-all duration-200 ${
                isTargetLocked
                  ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_35px_rgba(16,185,129,0.7)] scale-[1.02]'
                  : 'border border-white/40 bg-white/[0.02]'
              }`}
            >
              {/* 4 Precision Corner Brackets */}
              <div
                className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${
                  isTargetLocked ? 'border-emerald-400' : 'border-white/70'
                } rounded-tl-lg`}
              />
              <div
                className={`absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 ${
                  isTargetLocked ? 'border-emerald-400' : 'border-white/70'
                } rounded-tr-lg`}
              />
              <div
                className={`absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 ${
                  isTargetLocked ? 'border-emerald-400' : 'border-white/70'
                } rounded-bl-lg`}
              />
              <div
                className={`absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 ${
                  isTargetLocked ? 'border-emerald-400' : 'border-white/70'
                } rounded-br-lg`}
              />

              {/* Instant feedback on detection */}
              {isTargetLocked ? (
                <div className="flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-1" />
                  <span className="font-mono text-sm font-black text-white tracking-wider" dir="ltr">
                    {candidateTag}
                  </span>
                </div>
              ) : (
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent shadow-[0_0_8px_#34d399] animate-[bounce_2.5s_infinite]" />
              )}
            </div>
          </div>

          {/* Floating Controls on Camera Feed (Flashlight + Flip Camera) */}
          <div className="absolute bottom-3 inset-x-4 flex items-center justify-between pointer-events-none z-10">
            {/* Flashlight toggle (⚡) */}
            <div className="pointer-events-auto">
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
            <div className="pointer-events-auto">
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

        {/* 3. BOTTOM: SIMPLE MANUAL INPUT */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-white/5 space-y-2">
          <form onSubmit={handleManualSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={manualTag}
              onChange={(e) => setManualTag(e.target.value.toUpperCase())}
              placeholder="הזן מספר תג ידנית (למשל 1065)"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 uppercase transition-colors"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isManualSearching || !manualTag.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm cursor-pointer transition-all shrink-0 active:scale-95"
            >
              {isManualSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              <span>אתר</span>
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
