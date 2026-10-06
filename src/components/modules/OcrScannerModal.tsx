'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Zap,
  ZapOff,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search,
  Sparkles,
  ArrowRight,
  RotateCcw,
  SwitchCamera,
  QrCode,
  ScanLine,
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
  title = 'סורק שטח מקבילי (QR + OCR)',
  description = 'זיהוי דו-מנועי אוטומטי: קודי QR, ברקודים ותגיות שטח שחוקות (First Match Wins)',
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

  // Device-Agnostic Camera Enumeration
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Dual-Engine Recognition State
  const {
    isOcrReady,
    isInitializing: isOcrInitializing,
    ocrProgress,
    initOcr,
    terminateOcr,
    recognizeFrameWithDetails,
  } = useOcrScanner();

  // Detection & Snap State
  const [candidateTag, setCandidateTag] = useState<string | null>(null);
  const [winningEngine, setWinningEngine] = useState<string | null>(null);
  const [isTargetLocked, setIsTargetLocked] = useState<boolean>(false);
  const [snappedAsset, setSnappedAsset] = useState<ScannedAssetDetails | null>(null);
  const [isProcessingSnap, setIsProcessingSnap] = useState<boolean>(false);

  // Manual fallback input (when sticker is completely destroyed)
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
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
    } catch (e) {
      console.warn('Torch constraint not supported on this device/track:', e);
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
   * Start camera with device-agnostic fallback:
   * 1. Mobile/Tablets: Try ideal 'environment' high-res stream.
   * 2. Laptops/Webcams: Gracefully fall back to default camera without crashing.
   */
  const startCamera = useCallback(
    async (preferredDeviceId?: string, requestedFacing?: 'environment' | 'user') => {
      setCameraError(null);
      try {
        // Pre-warm Tesseract OCR worker in parallel
        void initOcr();

        // Enumerate available videoinput devices
        let devList: MediaDeviceInfo[] = [];
        try {
          if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
            const all = await navigator.mediaDevices.enumerateDevices();
            devList = all.filter((d) => d.kind === 'videoinput');
            setVideoDevices(devList);
          }
        } catch {
          // ignore enumeration errors prior to permission grant
        }

        const activeFacing = requestedFacing || facingMode;
        let stream: MediaStream | null = null;

        // Attempt 1: High-res with ideal environment camera (mobile/tablets)
        try {
          const highResConstraints: MediaStreamConstraints = preferredDeviceId
            ? {
                video: {
                  deviceId: { exact: preferredDeviceId },
                  width: { ideal: 1920, min: 640 },
                  height: { ideal: 1080, min: 480 },
                },
                audio: false,
              }
            : {
                video: {
                  facingMode: { ideal: activeFacing },
                  width: { ideal: 1920, min: 640 },
                  height: { ideal: 1080, min: 480 },
                  advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
                },
                audio: false,
              };
          stream = await navigator.mediaDevices.getUserMedia(highResConstraints);
        } catch (e1) {
          console.warn('[Camera] High-res constraint rejected, falling back to standard resolution:', e1);
          // Attempt 2: Standard constraints without resolution clamp (laptops / basic webcams)
          try {
            const standardConstraints: MediaStreamConstraints = preferredDeviceId
              ? { video: { deviceId: { exact: preferredDeviceId } }, audio: false }
              : { video: { facingMode: { ideal: activeFacing } }, audio: false };
            stream = await navigator.mediaDevices.getUserMedia(standardConstraints);
          } catch (e2) {
            console.warn('[Camera] FacingMode constraint rejected, falling back to default device:', e2);
            // Attempt 3: Pure default camera fallback (laptops with only front webcam)
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }

        if (!stream) {
          throw new Error('לא ניתן לגשת למצלמת המכשיר');
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraActive(true);

        // Re-enumerate to capture populated camera device labels
        try {
          if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
            const refreshed = await navigator.mediaDevices.enumerateDevices();
            const videoOnly = refreshed.filter((d) => d.kind === 'videoinput');
            setVideoDevices(videoOnly);
            if (videoOnly.length > 0 && !preferredDeviceId) {
              const activeTrack = stream.getVideoTracks()[0];
              const settings = activeTrack.getSettings ? activeTrack.getSettings() : null;
              if (settings?.deviceId) {
                const idx = videoOnly.findIndex((d) => d.deviceId === settings.deviceId);
                if (idx !== -1) setCurrentCameraIndex(idx);
              }
            }
          }
        } catch {
          // ignore
        }

        // Inspect torch support on the active video track
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
      } catch (err: unknown) {
        console.error('Failed to access camera:', err);
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'הרשאת גישה למצלמה נדחתה. אנא אשר גישה למצלמה בהגדרות הדפדפן.'
            : 'לא ניתן להפעיל את המצלמה. אנא ודא שהמצלמה אינה תפוסה ביישום אחר.';
        setCameraError(msg);
        setCameraActive(false);
      }
    },
    [facingMode, initOcr]
  );

  /**
   * Device Agnostic Camera Switcher:
   * Cycles through enumerated video devices or toggles facingMode
   */
  const handleSwitchCamera = useCallback(async () => {
    if (videoDevices.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % videoDevices.length;
      setCurrentCameraIndex(nextIndex);
      const nextDevice = videoDevices[nextIndex];
      await stopCamera();
      await startCamera(nextDevice.deviceId);
    } else {
      const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(nextFacing);
      await stopCamera();
      await startCamera(undefined, nextFacing);
    }
  }, [videoDevices, currentCameraIndex, facingMode, stopCamera, startCamera]);

  /**
   * First-Match-Wins Detection Claim:
   * Locks the camera (debounce 1.5s), plays audio beep + 50ms haptic,
   * highlights the green target box, and executes instant asset verification.
   */
  const claimDetection = useCallback(
    async (detectedTag: string, engineSource: string) => {
      if (isDebounceLockedRef.current || snappedAsset) return;

      // 1. Lock immediately to prevent double-scanning
      isDebounceLockedRef.current = true;
      setIsTargetLocked(true);
      setCandidateTag(detectedTag);
      setWinningEngine(engineSource);

      // 2. Instant Confirmation: Audio Beep + 50ms Haptic Pulse
      triggerOcrHaptic(50);
      playOcrBeep();

      setIsProcessingSnap(true);

      try {
        const matched = await snapTagToAsset(detectedTag, orgId, warehouseId);
        if (matched) {
          setSnappedAsset(matched);

          // 3. Instant Handoff after brief 450ms visual confirmation
          setTimeout(() => {
            onAssetDetected(matched);
            onClose();
          }, 450);
        } else {
          // Tag detected but not found in current organization / warehouse
          // Hold camera lock for 1.5s debounce before releasing
          setTimeout(() => {
            isDebounceLockedRef.current = false;
            setIsTargetLocked(false);
            setIsProcessingSnap(false);
            setWinningEngine(null);
          }, 1500);
        }
      } catch (err) {
        console.warn('Error during asset snap verification:', err);
        setTimeout(() => {
          isDebounceLockedRef.current = false;
          setIsTargetLocked(false);
          setIsProcessingSnap(false);
          setWinningEngine(null);
        }, 1500);
      }
    },
    [snappedAsset, orgId, warehouseId, onAssetDetected, onClose]
  );

  /**
   * Parallel Dual-Engine Frame Scanning Cycle:
   * Runs both Engine A (Barcode & QR) and Engine B (Heavy-Duty OCR) simultaneously.
   * Whichever engine matches FIRST immediately claims detection.
   */
  const performDualScanCycle = useCallback(async () => {
    if (!videoRef.current || !cameraActive || isDebounceLockedRef.current || snappedAsset) {
      return;
    }

    if (videoRef.current.readyState < 2) {
      return;
    }

    const video = videoRef.current;

    // ENGINE A: Barcode & QR Detector (QR, Code 128, Code 39, Data Matrix)
    if (!isBarcodeBusyRef.current && !isDebounceLockedRef.current) {
      isBarcodeBusyRef.current = true;
      void detectBarcodeOrQr(video)
        .then(async (barcodeResult) => {
          if (barcodeResult && barcodeResult.rawValue && !isDebounceLockedRef.current) {
            const cleanTag = extractTagFromBarcodePayload(barcodeResult.rawValue);
            if (cleanTag) {
              await claimDetection(cleanTag, `ברקוד / QR (${barcodeResult.format})`);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          isBarcodeBusyRef.current = false;
        });
    }

    // ENGINE B: Heavy-Duty OCR Engine (Otsu adaptive contrast binarization + strict regex filter)
    if (isOcrReady && !isOcrBusyRef.current && !isDebounceLockedRef.current) {
      isOcrBusyRef.current = true;
      void recognizeFrameWithDetails(video)
        .then(async (ocrDetails) => {
          if (ocrDetails && ocrDetails.tag && !isDebounceLockedRef.current) {
            await claimDetection(ocrDetails.tag, 'OCR שטח מוקשח');
          }
        })
        .catch(() => {})
        .finally(() => {
          isOcrBusyRef.current = false;
        });
    }
  }, [cameraActive, snappedAsset, isOcrReady, recognizeFrameWithDetails, claimDetection]);

  /**
   * Lifecycle: Mount/Unmount camera & Tesseract worker
   */
  useEffect(() => {
    if (isOpen) {
      setSnappedAsset(null);
      setCandidateTag(null);
      setWinningEngine(null);
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
   * Continuous Dual-Engine Scan Cadence: runs every 220ms
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
    }, 220);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraActive, snappedAsset, performDualScanCycle]);

  /**
   * Manual Tag Search fallback (for totally illegible / missing stickers)
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
        }, 400);
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
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">{title}</h3>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  DUAL-ENGINE: QR + OCR
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">{description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCANNER VIEWPORT AREA */}
        <div className="relative bg-black flex-1 min-h-[380px] max-h-[500px] overflow-hidden flex items-center justify-center">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* TOP TOOLBAR: SWITCH CAMERA + TORCH / FLASHLIGHT */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {/* SWITCH CAMERA BUTTON (DEVICE AGNOSTIC) */}
            <button
              type="button"
              onClick={() => void handleSwitchCamera()}
              className="px-3 py-2 rounded-2xl text-xs font-black bg-slate-900/85 text-white border border-slate-700 hover:bg-slate-800 flex items-center gap-1.5 shadow-xl backdrop-blur-md cursor-pointer transition-all active:scale-95"
              title="החלף מצלמה (Switch Camera)"
            >
              <SwitchCamera className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">החלף מצלמה</span>
              {videoDevices.length > 1 && (
                <span className="text-[10px] bg-slate-800 text-emerald-300 px-1 rounded-md font-mono">
                  {currentCameraIndex + 1}/{videoDevices.length}
                </span>
              )}
            </button>

            {/* HARDWARE TORCH TOGGLE BUTTON */}
            {torchSupported && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`px-3 py-2 rounded-2xl text-xs font-black flex items-center gap-1.5 shadow-xl backdrop-blur-md border transition-all cursor-pointer ${
                  torchEnabled
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/50 scale-105 animate-pulse'
                    : 'bg-slate-900/85 text-white border-slate-700 hover:bg-slate-800'
                }`}
                title={torchEnabled ? 'כיבוי פנס' : 'הפעל פנס'}
              >
                {torchEnabled ? (
                  <>
                    <ZapOff className="w-4 h-4 fill-slate-950" />
                    <span className="hidden sm:inline">כיבוי פנס</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="hidden sm:inline">🔦 פנס</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* DUAL-ENGINE STATUS BADGE */}
          <div className="absolute top-4 left-4 z-20">
            {isOcrInitializing ? (
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 border border-slate-700 backdrop-blur-md flex items-center gap-2 text-xs text-amber-300 font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>מאתחל מנוע OCR ({ocrProgress}%)...</span>
              </div>
            ) : isTargetLocked ? (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 border border-emerald-300 font-black flex items-center gap-1.5 text-xs shadow-lg shadow-emerald-500/50 animate-bounce">
                <CheckCircle2 className="w-4 h-4" />
                <span>זוהה ע&quot;י {winningEngine}: {candidateTag}</span>
              </div>
            ) : isProcessingSnap ? (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md flex items-center gap-2 text-xs text-emerald-300 font-bold animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>מאמת מול מסד הנתונים...</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 border border-slate-700 backdrop-blur-md flex items-center gap-2 text-xs text-slate-300 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3 h-3 text-emerald-400" />
                  <span>סריקה מקבילית פעילה (QR + OCR)</span>
                </span>
              </div>
            )}
          </div>

          {/* CENTRAL ROI VIEWING BOX (70% WIDTH x 25% HEIGHT) */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Top dark mask */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px]" />

            {/* Central Targeting Box with dynamic green highlight lock */}
            <div className="w-full flex items-center justify-center">
              {/* Left dark mask */}
              <div className="flex-1 h-[140px] sm:h-[160px] bg-black/55 backdrop-blur-[1px]" />

              {/* Viewfinder Frame (70% width) */}
              <div
                className={`w-[78%] sm:w-[70%] h-[140px] sm:h-[160px] relative rounded-2xl flex items-center justify-center overflow-hidden transition-all duration-150 ${
                  isTargetLocked
                    ? 'border-4 border-emerald-400 bg-emerald-500/25 shadow-[0_0_40px_rgba(16,185,129,0.85)] scale-[1.03]'
                    : 'border-2 border-emerald-400/80 bg-emerald-500/5 shadow-[0_0_25px_rgba(16,185,129,0.35)]'
                }`}
              >
                {/* 4 Precision Corner Brackets */}
                <div
                  className={`absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 rounded-tl-sm transition-colors ${
                    isTargetLocked ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <div
                  className={`absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 rounded-tr-sm transition-colors ${
                    isTargetLocked ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <div
                  className={`absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 rounded-bl-sm transition-colors ${
                    isTargetLocked ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />
                <div
                  className={`absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 rounded-br-sm transition-colors ${
                    isTargetLocked ? 'border-emerald-300' : 'border-emerald-400'
                  }`}
                />

                {/* Laser Alignment Line */}
                {isTargetLocked ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/70 backdrop-blur-xs text-center p-2 animate-in fade-in">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce mb-1" />
                    <span className="font-mono text-base font-black text-white" dir="ltr">
                      {candidateTag}
                    </span>
                    <span className="text-[11px] text-emerald-300 font-bold">
                      {winningEngine || 'זוהה בהצלחה'}
                    </span>
                  </div>
                ) : (
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[bounce_2.5s_infinite]" />
                )}
              </div>

              {/* Right dark mask */}
              <div className="flex-1 h-[140px] sm:h-[160px] bg-black/55 backdrop-blur-[1px]" />
            </div>

            {/* Bottom dark mask with operational instructions */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px] flex flex-col items-center pt-3 px-4">
              <span className="text-white text-xs font-bold bg-slate-950/85 px-3 py-1.5 rounded-full border border-slate-700 text-center shadow-lg">
                כוון את קוד ה-QR, הברקוד או תגית הכלי (למשל: <span className="font-mono text-emerald-400">ZR-1099</span>, <span className="font-mono text-emerald-400">1032</span>)
              </span>
            </div>
          </div>

          {/* INSTANT CONFIRMATION OVERLAY UPON DATABASE MATCH */}
          {snappedAsset && (
            <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/40 mb-3 animate-bounce">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-xl font-black text-white text-center">
                אומת בהצלחה במסד הנתונים!
              </h4>
              <div className="mt-2 text-center space-y-1">
                <span
                  className="font-mono text-lg font-black text-emerald-400 bg-emerald-950/70 px-4 py-1 rounded-xl border border-emerald-500/50 inline-block"
                  dir="ltr"
                >
                  {snappedAsset.qrCode}
                </span>
                <p className="text-sm font-bold text-slate-200">{snappedAsset.toolName}</p>
                <p className="text-xs text-slate-400">
                  {snappedAsset.brand} {snappedAsset.modelNumber ? `• דגם: ${snappedAsset.modelNumber}` : ''}
                </p>
                {winningEngine && (
                  <span className="text-[10px] text-emerald-400/90 font-mono inline-block mt-1">
                    מנוע: {winningEngine}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* CAMERA ERROR OVERLAY WITH RETRY */}
          {cameraError && (
            <div className="absolute inset-0 z-30 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-rose-500" />
              <p className="text-sm font-bold text-rose-300 max-w-sm">{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>נסה שוב</span>
              </button>
            </div>
          )}
        </div>

        {/* MODAL FOOTER: NO MANUAL TOGGLES (BOTH ENGINES PARALLEL) + MANUAL FALLBACK */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{showManualInput ? 'הסתר הקלדה ידנית' : 'הקלד תגית ידנית (במידה והמדבקה קרועה)'}</span>
            </button>

            <span className="text-[11px] text-slate-500 font-medium">
              זיהוי מקבילי אוטומטי (First Match Wins)
            </span>
          </div>

          {/* Manual Tag Entry Form */}
          {showManualInput && (
            <form onSubmit={handleManualSearch} className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={manualTag}
                    onChange={(e) => setManualTag(e.target.value.toUpperCase())}
                    placeholder="למשל: ZR-1099, 1032 או MOHA-0001"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isManualSearching || !manualTag.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  {isManualSearching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>אתר כלי</span>
                </button>
              </div>

              {manualError && (
                <p className="text-[11px] font-bold text-rose-400">{manualError}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
