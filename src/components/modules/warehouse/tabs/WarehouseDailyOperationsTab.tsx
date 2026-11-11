'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap,
  Scan,
  Printer,
  Sparkles,
  QrCode,
  Search,
  Loader2,
  X,
  ScanLine,
  CheckCircle2,
  ZapOff,
  RotateCcw,
  AlertTriangle,
  FileText,
  Phone,
  MessageCircle,
  Clock,
  Calendar,
  TrendingDown,
  Package,
  Plus,
  Layers,
} from 'lucide-react';
import { useLaserStripOcr } from '@/lib/ocr/useLaserStripOcr';
import { detectBarcodeOrQr, extractTagFromBarcodePayload } from '@/lib/ocr/barcodeDetector';
import { snapTagToAsset, triggerOcrHaptic, playOcrBeep, normalizeFieldTag } from '@/lib/ocr/tagParser';
import type { StorekeeperOperationsPayload, ScannedAssetDetails } from '../types';

export interface WarehouseDailyOperationsTabProps {
  data: StorekeeperOperationsPayload;
  selectedWarehouseId: string;
  isPassportOpen: boolean;
  onOpenCheckout: () => void;
  onOpenCheckin: (preselectedAssetId?: string | null) => void;
  onOpenPassport: (qrCode: string, fallbackItem?: unknown) => Promise<void> | void;
  organizationId?: string;
}

export default function WarehouseDailyOperationsTab({
  data,
  selectedWarehouseId,
  isPassportOpen,
  onOpenCheckout,
  onOpenCheckin,
  onOpenPassport,
  organizationId,
}: WarehouseDailyOperationsTabProps) {
  // Quick lookup state
  const [passportLookupInput, setPassportLookupInput] = useState<string>('');
  const [isSearchingPassport, setIsSearchingPassport] = useState<boolean>(false);
  const [passportLookupFeedback, setPassportLookupFeedback] = useState<string | null>(null);

  // Inline Camera Scanner State & Hardware Watchdog
  const [isInlineScannerOpen, setIsInlineScannerOpen] = useState<boolean>(false);
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const inlineStreamRef = useRef<MediaStream | null>(null);
  const inlineWatchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inlineIsPausedRef = useRef<boolean>(false);
  const inlineIsDebounceLockedRef = useRef<boolean>(false);
  const inlineIsBarcodeBusyRef = useRef<boolean>(false);

  const [inlineFacingMode, setInlineFacingMode] = useState<'environment' | 'user'>('environment');
  const [inlineTorchSupported, setInlineTorchSupported] = useState<boolean>(false);
  const [inlineTorchEnabled, setInlineTorchEnabled] = useState<boolean>(false);
  const [inlineTargetLocked, setInlineTargetLocked] = useState<boolean>(false);
  const [inlineCandidateTag, setInlineCandidateTag] = useState<string | null>(null);
  const [inlineCameraError, setInlineCameraError] = useState<string | null>(null);
  const [inlineScanMode, setInlineScanMode] = useState<'qr' | 'ocr'>('qr');

  const onOpenPassportRef = useRef(onOpenPassport);
  useEffect(() => {
    onOpenPassportRef.current = onOpenPassport;
  }, [onOpenPassport]);

  // Fast Persistent Tesseract Worker + Throttled Cloud Fallback (Laser-Strip OCR for Inline Viewfinder)
  const {
    lastRawOcrText: inlineLastRawOcrText,
    ocrMatchedTag: inlineOcrMatchedTag,
    resetOcrStatus: resetInlineOcrStatus,
  } = useLaserStripOcr({
    videoRef: inlineVideoRef,
    isActive: isInlineScannerOpen,
    isPaused: inlineScanMode !== 'ocr' || isPassportOpen || inlineTargetLocked,
    organizationId,
    onTagDetected: async (tag, digits) => {
      setPassportLookupInput(tag);
      setInlineCandidateTag(tag);
      setInlineTargetLocked(true);

      if (onOpenPassportRef.current) {
        try {
          await onOpenPassportRef.current(tag);
        } catch (err) {
          console.warn('[InlineOCR] Search with primary tag failed, trying digits fallback:', err);
          await onOpenPassportRef.current(digits);
        }
      }
    },
  });

  const toggleInlineTorch = useCallback(async (track: MediaStreamTrack, enabled: boolean) => {
    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as unknown as MediaTrackConstraintSet],
      });
      setInlineTorchEnabled(enabled);
    } catch {
      setInlineTorchSupported(false);
    }
  }, []);

  const handleToggleInlineTorch = useCallback(() => {
    if (!inlineStreamRef.current) return;
    const track = inlineStreamRef.current.getVideoTracks()[0];
    if (track) {
      void toggleInlineTorch(track, !inlineTorchEnabled);
    }
  }, [inlineTorchEnabled, toggleInlineTorch]);

  const stopInlineCamera = useCallback(async () => {
    if (inlineWatchdogIntervalRef.current) {
      clearInterval(inlineWatchdogIntervalRef.current);
      inlineWatchdogIntervalRef.current = null;
    }
    if (inlineStreamRef.current) {
      try {
        inlineStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (err) {
        console.warn('Error stopping inline stream:', err);
      } finally {
        inlineStreamRef.current = null;
      }
    }
    if (inlineVideoRef.current) {
      inlineVideoRef.current.srcObject = null;
    }
    setInlineTorchEnabled(false);
  }, []);

  const startInlineCamera = useCallback(
    async (requestedFacing?: 'environment' | 'user') => {
      setInlineCameraError(null);

      if (
        inlineStreamRef.current &&
        inlineStreamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
      ) {
        if (inlineVideoRef.current) {
          if (inlineVideoRef.current.srcObject !== inlineStreamRef.current) {
            inlineVideoRef.current.srcObject = inlineStreamRef.current;
          }
          try {
            await inlineVideoRef.current.play();
          } catch {
            // ignore
          }
        }
        inlineIsPausedRef.current = false;
        return;
      }

      const activeFacing = requestedFacing || inlineFacingMode;
      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: activeFacing },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: activeFacing },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } catch (e3) {
            console.error('[InlineCamera] getUserMedia failed completely:', e3);
          }
        }
      }

      if (!stream) {
        setInlineCameraError('לא ניתן לגשת למצלמת המכשיר. לחץ על המסך לחידוש או אשר גישה.');
        return;
      }

      inlineStreamRef.current = stream;
      if (inlineVideoRef.current) {
        inlineVideoRef.current.srcObject = stream;
        try {
          await inlineVideoRef.current.play();
        } catch (playErr) {
          console.warn('[InlineCamera] video.play() error:', playErr);
        }
      }

      inlineIsPausedRef.current = false;

      const track = stream.getVideoTracks()[0];
      if (track) {
        const getCaps = (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities;
        if (typeof getCaps === 'function') {
          const caps = getCaps.call(track);
          setInlineTorchSupported(Boolean(caps?.torch));
        } else {
          setInlineTorchSupported(false);
        }
      }
    },
    [inlineFacingMode]
  );

  const handleInlineTapToWake = useCallback(async () => {
    inlineIsPausedRef.current = false;
    setInlineCameraError(null);
    const noStream = !inlineStreamRef.current;
    const tracksEnded = inlineStreamRef.current?.getVideoTracks().some((t) => t.readyState === 'ended');

    if (noStream || tracksEnded) {
      await startInlineCamera();
    } else if (inlineVideoRef.current) {
      try {
        await inlineVideoRef.current.play();
      } catch {
        await startInlineCamera();
      }
    }
  }, [startInlineCamera]);

  const handleFlipInlineCamera = useCallback(async () => {
    const nextFacing = inlineFacingMode === 'environment' ? 'user' : 'environment';
    setInlineFacingMode(nextFacing);
    await stopInlineCamera();
    await startInlineCamera(nextFacing);
  }, [inlineFacingMode, stopInlineCamera, startInlineCamera]);

  const claimInlineDetection = useCallback(
    async (detectedTag: string) => {
      if (inlineIsDebounceLockedRef.current || inlineIsPausedRef.current) return;

      inlineIsDebounceLockedRef.current = true;
      inlineIsPausedRef.current = true;
      setInlineTargetLocked(true);
      setInlineCandidateTag(detectedTag);

      triggerOcrHaptic([60, 40, 60]);
      playOcrBeep(880, 140);

      try {
        let matched = await snapTagToAsset(detectedTag, organizationId, selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined);

        const norm = normalizeFieldTag(detectedTag);
        if (!matched && norm.success && norm.rawDigits) {
          matched =
            (await snapTagToAsset(`ZR-${norm.rawDigits}`, organizationId, selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined)) ||
            (await snapTagToAsset(norm.rawDigits, organizationId, selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined));
        }

        const canonicalTag = norm.success && norm.tag ? norm.tag : (detectedTag.startsWith('ZR-') ? detectedTag : `ZR-${detectedTag}`);
        const rawDigits = norm.success && norm.rawDigits ? norm.rawDigits : detectedTag;

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
          currentWarehouseId: selectedWarehouseId !== 'all' ? selectedWarehouseId : 'wh-main-01',
          warehouseName: data?.warehouse?.name || 'מחסן ראשי',
          warehouseCode: 'WH',
          version: 1,
        };

        setTimeout(() => {
          if (onOpenPassportRef.current) {
            void onOpenPassportRef.current(targetAsset.qrCode, targetAsset);
          }
          inlineIsDebounceLockedRef.current = false;
          setInlineTargetLocked(false);
          setInlineCandidateTag(null);
        }, 220);
      } catch (err) {
        console.warn('Error in inline detection asset snap:', err);
        inlineIsDebounceLockedRef.current = false;
        setInlineTargetLocked(false);
        setInlineCandidateTag(null);
        inlineIsPausedRef.current = false;
      }
    },
    [organizationId, selectedWarehouseId, data]
  );

  // 60fps Continuous Barcode & QR Detection Loop for Inline Scanner
  useEffect(() => {
    if (!isInlineScannerOpen || isPassportOpen) return;

    let animId: number;
    let active = true;

    const qrScanLoop = () => {
      if (!active) return;

      if (
        !inlineIsPausedRef.current &&
        !inlineIsDebounceLockedRef.current &&
        !inlineIsBarcodeBusyRef.current &&
        !isPassportOpen &&
        inlineVideoRef.current &&
        inlineVideoRef.current.readyState >= 2
      ) {
        inlineIsBarcodeBusyRef.current = true;
        detectBarcodeOrQr(inlineVideoRef.current)
          .then(async (barcodeResult) => {
            if (
              barcodeResult &&
              barcodeResult.rawValue &&
              !inlineIsDebounceLockedRef.current &&
              !inlineIsPausedRef.current &&
              !isPassportOpen
            ) {
              const cleanTag = extractTagFromBarcodePayload(barcodeResult.rawValue);
              if (cleanTag) {
                setPassportLookupInput(cleanTag);
                await claimInlineDetection(cleanTag);
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            inlineIsBarcodeBusyRef.current = false;
          });
      }

      animId = requestAnimationFrame(qrScanLoop);
    };

    animId = requestAnimationFrame(qrScanLoop);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [isInlineScannerOpen, isPassportOpen, claimInlineDetection]);

  // Stream Watchdog: Revives dead or ended camera stream every 1000ms
  useEffect(() => {
    if (!isInlineScannerOpen) {
      if (inlineWatchdogIntervalRef.current) {
        clearInterval(inlineWatchdogIntervalRef.current);
        inlineWatchdogIntervalRef.current = null;
      }
      return;
    }

    inlineWatchdogIntervalRef.current = setInterval(() => {
      if (!isInlineScannerOpen) return;

      const noStream = !inlineStreamRef.current;
      const tracksEnded = inlineStreamRef.current?.getVideoTracks().some((t) => t.readyState === 'ended');
      const videoPaused =
        inlineVideoRef.current &&
        inlineVideoRef.current.paused &&
        !inlineIsPausedRef.current &&
        !isPassportOpen;

      if (noStream || tracksEnded) {
        console.warn('[Watchdog] Inline camera stream ended or missing, reviving...');
        void startInlineCamera();
      } else if (videoPaused) {
        void inlineVideoRef.current?.play().catch(() => {});
      }
    }, 1000);

    return () => {
      if (inlineWatchdogIntervalRef.current) {
        clearInterval(inlineWatchdogIntervalRef.current);
        inlineWatchdogIntervalRef.current = null;
      }
    };
  }, [isInlineScannerOpen, isPassportOpen, startInlineCamera]);

  // Resume stream immediately when ToolPassportModal closes
  useEffect(() => {
    if (!isPassportOpen && isInlineScannerOpen) {
      inlineIsPausedRef.current = false;
      inlineIsDebounceLockedRef.current = false;
      setInlineTargetLocked(false);
      setInlineCandidateTag(null);
      resetInlineOcrStatus();
      if (
        inlineVideoRef.current &&
        inlineStreamRef.current &&
        inlineStreamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
      ) {
        inlineVideoRef.current.play().catch(() => {
          void startInlineCamera();
        });
      } else {
        void startInlineCamera();
      }
    }
  }, [isPassportOpen, isInlineScannerOpen, resetInlineOcrStatus, startInlineCamera]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (inlineWatchdogIntervalRef.current) {
        clearInterval(inlineWatchdogIntervalRef.current);
      }
      if (inlineStreamRef.current) {
        inlineStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handlePassportSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = passportLookupInput.trim();
    if (!term) return;

    setIsSearchingPassport(true);
    setPassportLookupFeedback(null);
    try {
      await onOpenPassport(term);
    } catch {
      setPassportLookupFeedback('שגיאה באיתור הכלי.');
    } finally {
      setIsSearchingPassport(false);
    }
  };

  const getWhatsAppLink = (
    phone: string | null,
    workerName: string,
    toolName: string,
    qrCode: string,
    daysOverdue: number
  ) => {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '972' + clean.slice(1);
    } else if (!clean.startsWith('972')) {
      clean = '972' + clean;
    }

    const msg = `שלום ${workerName}, כאן מחסן ${data.warehouse?.name || 'ראשי'}. תזכורת להחזרת כלי העבודה "${toolName}" (מק"ט ${qrCode}) הנמצא באיחור של ${daysOverdue} ימים. נא לתאם החזרה למחסן בהקדם.`;
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. TOP ACTION GRID: Large, touch-friendly primary action buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Button 1: הנפקה לעובד */}
        <button
          type="button"
          onClick={onOpenCheckout}
          className="min-h-[56px] sm:min-h-[64px] p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 transition-all cursor-pointer"
        >
          <Zap className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          <span>⚡ הנפקה לעובד</span>
        </button>

        {/* Button 2: קליטת כלי והחזרה */}
        <button
          type="button"
          onClick={() => onOpenCheckin(null)}
          className="min-h-[56px] sm:min-h-[64px] p-3 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <Scan className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          <span>📥 קליטת כלי והחזרה</span>
        </button>

        {/* Button 3: הדפסת תגיות TSC */}
        <Link
          href="/print-tags"
          className="min-h-[56px] sm:min-h-[64px] p-3 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-1.5 shadow-sm active:scale-95 transition-all"
        >
          <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          <span>🖨️ הדפסת תגיות TSC</span>
        </Link>

        {/* Button 4: סורק שטח / בדיקת כלי */}
        <button
          type="button"
          onClick={() => setIsInlineScannerOpen((prev) => !prev)}
          className="min-h-[56px] sm:min-h-[64px] p-3 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
        >
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 stroke-[2.5]" />
          <span>{isInlineScannerOpen ? '📷 סגור סורק' : '🔦 סריקת כלי'}</span>
        </button>
      </div>

      {/* 2. COMPACT TOOL PASSPORT LOOKUP */}
      <div className="bg-slate-900 text-white rounded-2xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-slate-200">
            איתור מהיר בתיק כלי (Instant Tool Passport):
          </span>
        </div>
        <form onSubmit={handlePassportSearchSubmit} className="flex items-center gap-2 flex-1 sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={passportLookupInput}
              onChange={(e) => {
                const val = e.target.value;
                setPassportLookupInput(val);
                setPassportLookupFeedback(null);
                if (/^(?:ZR[- ]?)?\d{3,6}$/i.test(val.trim())) {
                  void onOpenPassport(val.trim());
                }
              }}
              placeholder="הזן מספר תג ZR-XXXX או סרוק ברקוד..."
              className="w-full h-9 bg-white/10 text-white text-xs font-bold pr-8 pl-8 rounded-xl border border-slate-700 focus:border-amber-400 focus:outline-none placeholder:text-slate-400"
            />
            {passportLookupInput && (
              <button
                type="button"
                onClick={() => {
                  setPassportLookupInput('');
                  setPassportLookupFeedback(null);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsInlineScannerOpen((prev) => !prev)}
            className={`h-9 px-3 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 ${
              isInlineScannerOpen
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'
            }`}
            title="סריקת מצלמה מהירה (QR + OCR)"
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>{isInlineScannerOpen ? 'סגור מצלמה' : 'סרוק'}</span>
          </button>
          <button
            type="submit"
            disabled={!passportLookupInput.trim() || isSearchingPassport}
            className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition-all active:scale-95 cursor-pointer shrink-0 flex items-center gap-1"
          >
            {isSearchingPassport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>אתר &rarr;</span>}
          </button>
        </form>
      </div>

      {/* INLINE LIVE SCANNER VIEWFINDER */}
      {isInlineScannerOpen && (
        <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-2xl p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
            <div className="flex items-center p-0.5 bg-slate-900 rounded-xl border border-white/10 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setInlineScanMode('qr');
                  resetInlineOcrStatus();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  inlineScanMode === 'qr'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>סריקת QR</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInlineScanMode('ocr');
                  resetInlineOcrStatus();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  inlineScanMode === 'ocr'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>סריקת OCR</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsInlineScannerOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              title="סגור סורק"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            onClick={() => void handleInlineTapToWake()}
            className="relative bg-black aspect-[4/3] sm:aspect-[16/9] max-h-[320px] rounded-xl overflow-hidden flex items-center justify-center cursor-pointer select-none border border-white/10 shadow-inner"
            title="לחץ בכל מקום במסך להפעלת / חידוש המצלמה"
          >
            <video
              ref={inlineVideoRef}
              playsInline
              muted
              autoPlay
              onLoadedMetadata={() => {
                void inlineVideoRef.current?.play().catch(() => {});
              }}
              className="w-full h-full object-cover"
            />

            {inlineScanMode === 'qr' ? (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-[68%] aspect-square max-w-[220px] relative rounded-3xl flex items-center justify-center transition-all duration-200 ${
                    inlineTargetLocked || inlineCandidateTag
                      ? 'border-4 border-blue-400 bg-blue-500/20 shadow-[0_0_35px_rgba(59,130,246,0.8)] scale-[1.02]'
                      : 'border-2 border-white/50 bg-white/[0.02]'
                  }`}
                >
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-3 border-l-3 border-blue-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-3 border-r-3 border-blue-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-3 border-l-3 border-blue-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-3 border-r-3 border-blue-400 rounded-br-xl" />

                  {inlineTargetLocked || inlineCandidateTag ? (
                    <div className="flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150 z-10">
                      <CheckCircle2 className="w-9 h-9 text-blue-400 mb-1 drop-shadow-md" />
                      <span className="font-mono text-sm font-black text-white tracking-widest drop-shadow-md" dir="ltr">
                        {inlineCandidateTag}
                      </span>
                      <span className="text-[10px] font-bold text-blue-300">פותח תיק כלי...</span>
                    </div>
                  ) : (
                    <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_10px_#60a5fa] animate-[bounce_2s_infinite]" />
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-[75%] h-[30%] min-h-[75px] max-h-[120px] relative rounded-2xl flex items-center justify-center transition-all duration-150 ${
                    inlineOcrMatchedTag || inlineTargetLocked
                      ? 'border-4 border-emerald-400 bg-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.9)] scale-102'
                      : 'border-2 border-emerald-400/60 bg-emerald-950/10'
                  }`}
                >
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />

                  <div className="absolute inset-x-2 h-0.5 bg-emerald-400 shadow-[0_0_12px_#10b981] animate-pulse" />

                  {(inlineOcrMatchedTag || inlineCandidateTag) && (
                    <div className="flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-150 z-10">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-0.5 drop-shadow-md" />
                      <span className="font-mono text-sm font-black text-white tracking-widest drop-shadow-md" dir="ltr">
                        {inlineOcrMatchedTag || inlineCandidateTag}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-300">פותח תיק כלי...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="absolute bottom-12 inset-x-0 flex justify-center items-center pointer-events-none z-20 px-3">
              <div
                className={`px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-bold flex items-center gap-2 shadow-lg transition-all duration-200 max-w-[92%] truncate ${
                  inlineOcrMatchedTag || inlineCandidateTag
                    ? inlineScanMode === 'qr'
                      ? 'bg-blue-950/90 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.7)] animate-pulse'
                      : 'bg-emerald-950/90 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.7)] animate-pulse'
                    : inlineScanMode === 'ocr' && inlineLastRawOcrText
                    ? 'bg-slate-950/90 border-amber-500/60 text-amber-200'
                    : 'bg-black/80 border-white/20 text-slate-200'
                }`}
              >
                {inlineOcrMatchedTag || inlineCandidateTag ? (
                  <span className="flex items-center gap-1.5 text-emerald-300 font-black">
                    <span>✅ זוהה: {inlineOcrMatchedTag || inlineCandidateTag} - פותח כלי!</span>
                  </span>
                ) : inlineScanMode === 'ocr' && inlineLastRawOcrText ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-amber-400">👁️ נקרא:</span>
                    <span className="text-white font-bold tracking-wider">{inlineLastRawOcrText}</span>
                  </span>
                ) : inlineScanMode === 'qr' ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-blue-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
                    <span>🔍 סורק קוד QR או ברקוד...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>🔍 סורק טקסט בשטח הקו הירוק...</span>
                  </span>
                )}
              </div>
            </div>

            <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between pointer-events-none z-10">
              <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                {inlineTorchSupported ? (
                  <button
                    type="button"
                    onClick={handleToggleInlineTorch}
                    className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border shadow-md transition-all cursor-pointer ${
                      inlineTorchEnabled
                        ? 'bg-amber-500 text-slate-950 border-amber-300'
                        : 'bg-black/50 text-white border-white/20 hover:bg-black/70'
                    }`}
                    title={inlineTorchEnabled ? 'כיבוי פנס' : 'הפעל פנס'}
                  >
                    {inlineTorchEnabled ? (
                      <ZapOff className="w-3.5 h-3.5 fill-slate-950" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                  </button>
                ) : (
                  <div />
                )}
              </div>

              <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => void handleFlipInlineCamera()}
                  className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-md transition-all active:scale-90 cursor-pointer"
                  title="החלף מצלמה (Flip Camera)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {inlineCameraError && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center space-y-2 z-20">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
                <p className="text-xs font-bold text-rose-300">{inlineCameraError}</p>
                <button
                  type="button"
                  onClick={() => void startInlineCamera()}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>נסה שוב</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {passportLookupFeedback && (
        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{passportLookupFeedback}</span>
        </div>
      )}

      {/* 3. OVERDUE ALERTS BOX (כלים באיחור להחזרה) */}
      {data.overdueAssets.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-950 font-black">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-black">
                כלים באיחור להחזרה &bull; מעקב דחוף ({data.overdueAssets.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
              טיפול מיידי
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
            {data.overdueAssets.map((tool) => {
              const waLink = getWhatsAppLink(
                tool.workerPhone,
                tool.workerName,
                tool.toolName,
                tool.qrCode,
                tool.daysOverdue
              );

              return (
                <div
                  key={tool.assetId}
                  className="p-3 rounded-xl bg-white border border-rose-200 space-y-2 hover:border-rose-300 transition-colors shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                          +{tool.daysOverdue} ימים באיחור
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenPassport(tool.qrCode, tool)}
                          className="font-mono text-[11px] font-black text-rose-950 hover:underline cursor-pointer flex items-center gap-0.5"
                          dir="ltr"
                        >
                          <QrCode className="w-3 h-3 text-rose-600" />
                          <span>{tool.qrCode}</span>
                        </button>
                      </div>
                      <h4 className="text-xs font-black text-slate-900 mt-1 truncate">
                        {tool.toolName}
                      </h4>
                      <div className="text-[11px] text-slate-500">
                        {tool.brand} {tool.modelNumber ? `• ${tool.modelNumber}` : ''}
                      </div>
                    </div>

                    <div className="text-left font-bold text-xs text-slate-700">
                      <div className="text-slate-900 font-black">{tool.workerName}</div>
                      <div className="text-[10px] text-slate-500" dir="ltr">
                        {tool.workerPhone || 'ללא טלפון'}
                      </div>
                    </div>
                  </div>

                  {tool.checkoutNote && (
                    <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[10px] text-amber-950 font-medium flex items-center gap-1">
                      <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                      <span className="italic truncate">&ldquo;{tool.checkoutNote}&rdquo;</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-rose-100 flex items-center gap-1.5">
                    {tool.workerPhone && (
                      <>
                        <a
                          href={`tel:${tool.workerPhone}`}
                          className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-blue-600" />
                          <span>חייג</span>
                        </a>
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>וואטסאפ</span>
                          </a>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenPassport(tool.qrCode, tool)}
                      className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 mr-auto cursor-pointer"
                    >
                      <FileText className="w-3 h-3 text-blue-600" />
                      <span>דרכון</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCheckin(tool.assetId)}
                      className="py-1 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>קליטה מהירה</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ACTIVE FIELD CUSTODY SUMMARY: Live list of tools checked out from this depot */}
      <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-950 font-black">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-black">
              כלים מנופקים בשטח &bull; משמורת פעילה (Active Field Custody)
            </h3>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              {(data.activeLoans || []).length} כלים
            </span>
          </div>
        </div>

        {(!data.activeLoans || data.activeLoans.length === 0) ? (
          <div className="p-5 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
            אין כרגע כלים מנופקים בשטח ממחסן זה. כל הציוד זמין במלאי!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            {data.activeLoans.map((loan) => (
              <div
                key={loan.assetId}
                className="p-3 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-blue-200 transition-colors space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        {loan.qrCode}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {loan.brand} {loan.modelNumber ? `• ${loan.modelNumber}` : ''}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-slate-900 mt-1 truncate">
                      {loan.toolName}
                    </h4>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      {(loan.daysActive ?? 0) === 0 ? 'הונפק היום' : `בשטח ${loan.daysActive} ימים`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200/80 text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>עובד: <strong className="text-slate-900">{loan.workerName}</strong></span>
                    {loan.workerPhone && (
                      <a
                        href={`tel:${loan.workerPhone}`}
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                        dir="ltr"
                      >
                        <Phone className="w-2.5 h-2.5" />
                        <span>{loan.workerPhone}</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenPassport(loan.qrCode, loan)}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold border border-slate-200 cursor-pointer"
                      title="דרכון כלי"
                    >
                      דרכון
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCheckin(loan.assetId)}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                      title="קליטה מהירה למחסן"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>קליטה מהירה</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. RETURNS DUE TODAY (COMPACT CONTAINER) */}
      {data.returnsDueToday.length > 0 && (
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-950 font-black">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-black">
                החזרות צפויות היום במשמרת ({data.returnsDueToday.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              משמרת פעילה
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
            {data.returnsDueToday.map((item) => (
              <div
                key={item.assetId}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black text-blue-950 truncate">
                      {item.toolName}
                    </h4>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5" dir="ltr">
                      {item.brand} &bull; {item.qrCode}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                    היום ב-
                    {new Date(item.expectedReturnDate).toLocaleTimeString('he-IL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 text-slate-600">
                  <span>
                    אצל: <strong>{item.workerName}</strong>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenPassport(item.qrCode, item)}
                      className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200 cursor-pointer"
                    >
                      דרכון
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCheckin(item.assetId)}
                      className="px-2 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black cursor-pointer"
                    >
                      קלוט
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. LOW STOCK ALERTS (COMPACT) */}
      {data.lowStockAlerts.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950 font-black">
              <TrendingDown className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-black">
                התרעות מלאי קריטי במחסן ({data.lowStockAlerts.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              נדרש חידוש מלאי
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {data.lowStockAlerts.map((alert) => (
              <div
                key={alert.categoryId}
                className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 truncate">
                    {alert.categoryName}
                  </span>
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                      alert.status === 'critical'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {alert.status === 'critical' ? 'קריטי' : 'נמוך'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 text-xs">
                  <span className="text-lg font-black text-amber-950">
                    {alert.availableCount}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    זמינים (סף: {alert.minStockThreshold})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. ZERO STATE ALERT */}
      {data.availableCount === 0 && data.checkedOutCount === 0 && data.quarantinedCount === 0 && (
        <div className="p-6 rounded-2xl bg-amber-50/90 border-2 border-amber-200 text-center space-y-2 shadow-sm">
          <div className="w-10 h-10 mx-auto rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
            <Package className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-black text-amber-950">
            אין עדיין כלים רשומים במחסן זה
          </h4>
          <p className="text-xs text-amber-800/90 max-w-md mx-auto">
            ניתן לקלוט כלי עבודה חדשים, לקודד תגיות QR או לנייד כלים ממחסנים אחרים.
          </p>
          <div className="pt-1 flex justify-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>קליטת כלי חדש</span>
            </Link>
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black shadow-sm transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>צפייה בקטלוג הציוד</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
