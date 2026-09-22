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
  Wrench,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOcrScanner } from '@/lib/ocr/useOcrScanner';
import { snapTagToAsset, triggerOcrHaptic, playOcrBeep } from '@/lib/ocr/tagParser';
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
  title = 'סורק תעשייתי OCR לשטח',
  description = 'מערכת זיהוי אופטית מוקשחת לתנאי אבק, סנוור שמש ותגיות שחוקות',
  warehouseId,
}: OcrScannerModalProps) {
  const { currentOrganization } = useAuth();
  const orgId = currentOrganization?.id;

  // Camera & Stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSnappingRef = useRef<boolean>(false);

  // Hardware State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);

  // OCR Recognition State
  const {
    isOcrReady,
    isInitializing,
    isRecognizing,
    ocrProgress,
    ocrError,
    initOcr,
    terminateOcr,
    recognizeFrameWithDetails,
  } = useOcrScanner();

  // Detection & Snap State
  const [candidateTag, setCandidateTag] = useState<string | null>(null);
  const [snappedAsset, setSnappedAsset] = useState<ScannedAssetDetails | null>(null);
  const [isProcessingSnap, setIsProcessingSnap] = useState<boolean>(false);

  // Manual fallback input
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualTag, setManualTag] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isManualSearching, setIsManualSearching] = useState<boolean>(false);

  /**
   * Hardware Controls: Torch / Flashlight toggle
   */
  const toggleTorch = useCallback(async (track: MediaStreamTrack, enabled: boolean) => {
    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as unknown as MediaTrackConstraintSet],
      });
      setTorchEnabled(enabled);
    } catch (e) {
      console.warn('Torch not supported on this device/browser:', e);
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
   * Stop camera tracks and clean up resources
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
          // Disable torch before stopping track
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
        console.warn('Error stopping video stream:', err);
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
   * Start camera stream requesting maximum resolution (ideal: 1920x1080) and continuous focus
   */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // 1. Initialize Tesseract OCR engine in parallel
      void initOcr();

      // 2. Request high-resolution industrial stream
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          // Focus mode continuous for sharp tag barcodes
          advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);

      // 3. Inspect hardware capabilities for Torch support
      const track = stream.getVideoTracks()[0];
      if (track) {
        const getCaps = (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities;
        if (typeof getCaps === 'function') {
          const caps = getCaps.call(track);
          setTorchSupported(Boolean(caps?.torch));
        } else {
          // Some Android WebViews support torch even if getCapabilities is missing
          setTorchSupported(true);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to access camera for OCR:', err);
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'הרשאת גישה למצלמה נדחתה. אנא אשר גישה למצלמה בהגדרות הדפדפן.'
          : 'לא ניתן להפעיל את המצלמה ברזולוציה המבוקשת. אנא השתמש באיתור ידני.';
      setCameraError(msg);
      setCameraActive(false);
    }
  }, [initOcr]);

  /**
   * Execute recognition frame cycle and attempt instant database snapping
   */
  const performOcrCycle = useCallback(async () => {
    if (!videoRef.current || !cameraActive || isRecognizing || isSnappingRef.current) {
      return;
    }

    if (videoRef.current.readyState < 2) {
      return;
    }

    try {
      const details = await recognizeFrameWithDetails(videoRef.current);
      if (!details || !details.tag) return;

      setCandidateTag(details.tag);

      // Attempt automatic snapping against public.assets
      isSnappingRef.current = true;
      setIsProcessingSnap(true);

      const matchedAsset = await snapTagToAsset(details.tag, orgId, warehouseId);

      if (matchedAsset) {
        setSnappedAsset(matchedAsset);
        // Instant haptic + audio lock feedback
        triggerOcrHaptic(100);
        playOcrBeep();

        // Brief 650ms confirmation lock before routing
        setTimeout(() => {
          onAssetDetected(matchedAsset);
          onClose();
        }, 650);
      } else {
        // Tag found in OCR but not registered in this organization
        isSnappingRef.current = false;
        setIsProcessingSnap(false);
      }
    } catch (err) {
      console.warn('Error during OCR frame recognition cycle:', err);
      isSnappingRef.current = false;
      setIsProcessingSnap(false);
    }
  }, [cameraActive, isRecognizing, recognizeFrameWithDetails, orgId, warehouseId, onAssetDetected, onClose]);

  /**
   * Lifecycle: Start/Stop scanner on modal open/close
   */
  useEffect(() => {
    if (isOpen) {
      setSnappedAsset(null);
      setCandidateTag(null);
      isSnappingRef.current = false;
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
   * Recognition Loop: Runs OCR cycle every 450ms when camera is active and ready
   */
  useEffect(() => {
    if (!cameraActive || !isOcrReady || snappedAsset) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    scanIntervalRef.current = setInterval(() => {
      void performOcrCycle();
    }, 450);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraActive, isOcrReady, snappedAsset, performOcrCycle]);

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
        triggerOcrHaptic(100);
        playOcrBeep();
        setTimeout(() => {
          onAssetDetected(asset);
          onClose();
        }, 500);
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">{title}</h3>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                  INDUSTRIAL OCR
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
          {/* Live HTML Video Feed */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* HARDWARE TORCH TOGGLE BUTTON */}
          <div className="absolute top-4 right-4 z-20">
            <button
              type="button"
              onClick={handleToggleTorch}
              className={`px-3.5 py-2 rounded-2xl text-xs font-black flex items-center gap-2 shadow-xl backdrop-blur-md border transition-all cursor-pointer ${
                torchEnabled
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-500/50 scale-105 animate-pulse'
                  : 'bg-slate-900/85 text-white border-slate-700 hover:bg-slate-800'
              }`}
              title={torchEnabled ? 'כיבוי פנס' : 'تشغيل الكشاف / הפעל פנס'}
            >
              {torchEnabled ? (
                <>
                  <ZapOff className="w-4 h-4 fill-slate-950" />
                  <span>כיבוי כשאף</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>🔦 تشغيل الكشاف / Flashlight</span>
                </>
              )}
            </button>
          </div>

          {/* ENGINE STATUS BADGE */}
          <div className="absolute top-4 left-4 z-20">
            {isInitializing ? (
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 border border-slate-700 backdrop-blur-md flex items-center gap-2 text-xs text-amber-300 font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>מאתחל מנוע OCR ({ocrProgress}%)...</span>
              </div>
            ) : isRecognizing || isProcessingSnap ? (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md flex items-center gap-2 text-xs text-emerald-300 font-bold animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>מעבד תמונה (Binarization & Filter)...</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/85 border border-slate-700 backdrop-blur-md flex items-center gap-2 text-xs text-slate-300 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>סורק פעיל - רזולוציה גבוהה</span>
              </div>
            )}
          </div>

          {/* INDUSTRIAL TARGETING OVERLAY: 70% WIDTH x 25% HEIGHT ROI */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Top dark mask */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px]" />

            {/* Central ROI Targeting Box: Exactly 70% width × 25% height */}
            <div className="w-full flex items-center justify-center">
              {/* Left dark mask */}
              <div className="flex-1 h-[140px] sm:h-[160px] bg-black/55 backdrop-blur-[1px]" />

              {/* Viewfinder Frame (70% width) */}
              <div className="w-[78%] sm:w-[70%] h-[140px] sm:h-[160px] relative border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center overflow-hidden bg-emerald-500/5">
                {/* 4 Precision Corner Brackets */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />

                {/* Sweeping Laser Line */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[bounce_2.5s_infinite]" />

                {/* Candidate Tag Watermark / Live feedback */}
                {candidateTag && !snappedAsset && (
                  <div className="absolute bottom-2 px-2.5 py-1 rounded bg-black/75 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-black tracking-wider">
                    קריאה: {candidateTag}
                  </div>
                )}
              </div>

              {/* Right dark mask */}
              <div className="flex-1 h-[140px] sm:h-[160px] bg-black/55 backdrop-blur-[1px]" />
            </div>

            {/* Bottom dark mask with guidance instruction */}
            <div className="w-full flex-1 bg-black/55 backdrop-blur-[1px] flex flex-col items-center pt-3 px-4">
              <span className="text-white text-xs font-bold bg-slate-950/80 px-3 py-1 rounded-full border border-slate-700 text-center shadow-lg">
                כוון את מספר הכלי למסגרת (למשל: <span className="font-mono text-emerald-400">ZR-1099</span>, <span className="font-mono text-emerald-400">TOOL-0024</span>)
              </span>
            </div>
          </div>

          {/* SNAPPED ASSET SUCCESS OVERLAY */}
          {snappedAsset && (
            <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/40 mb-3 animate-bounce">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-xl font-black text-white text-center">
                זוהה ואומת במסד הנתונים!
              </h4>
              <div className="mt-2 text-center space-y-1">
                <span className="font-mono text-lg font-black text-emerald-400 bg-emerald-950/70 px-4 py-1 rounded-xl border border-emerald-500/50 inline-block" dir="ltr">
                  {snappedAsset.qrCode}
                </span>
                <p className="text-sm font-bold text-slate-200">{snappedAsset.toolName}</p>
                <p className="text-xs text-slate-400">
                  {snappedAsset.brand} {snappedAsset.modelNumber ? `• דגם: ${snappedAsset.modelNumber}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* CAMERA ERROR OVERLAY */}
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

        {/* MODAL FOOTER & MANUAL FALLBACK */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          {/* Toggle manual input button */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{showManualInput ? 'הסתר הקלדה ידנית' : 'הקלד תגית ידנית (במידה והמדבקה קרועה)'}</span>
            </button>

            <span className="text-[11px] text-slate-500">
              סינון רעשים: Otsu Adaptive Binarization
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
                    placeholder="למשל: ZR-1099 או MOHA-0001"
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
                  <span>אתר</span>
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
