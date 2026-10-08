'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Search,
  ScanLine,
  Camera,
  CameraOff,
  Building2,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Users,
  Phone,
  Loader2,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import {
  masterLookupAssetsAction,
  type MasterAssetResult,
} from '@/app/actions/organizations';
import { detectBarcodeOrQr, extractTagFromBarcodePayload } from '@/lib/ocr/barcodeDetector';
import { playOcrBeep, triggerOcrHaptic } from '@/lib/ocr/tagParser';

interface MasterScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MasterScanModal({ isOpen, onClose }: MasterScanModalProps) {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<MasterAssetResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MasterAssetResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Camera Barcode / QR State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Search execution
  const executeLookup = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const res = await masterLookupAssetsAction(searchQuery);
      if (res.success) {
        setAssets(res.assets);
        if (res.assets.length === 1) {
          setSelectedAsset(res.assets[0]);
        }
      }
    } catch (err) {
      console.warn('[MasterScanModal] Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      void executeLookup('');
    } else {
      setQuery('');
      setSelectedAsset(null);
      setIsCameraActive(false);
    }
  }, [isOpen, executeLookup]);

  // Debounced live search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void executeLookup(query);
    }, 280);
    return () => clearTimeout(timer);
  }, [query, isOpen, executeLookup]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Start Camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('מצלמה אינה נתמכת בדפדפן זה');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);

      // Start continuous detection interval
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const detectedCode = await detectBarcodeOrQr(videoRef.current);
          if (detectedCode) {
            const rawVal = typeof detectedCode === 'string' ? detectedCode : detectedCode.rawValue;
            const parsedTag = extractTagFromBarcodePayload(rawVal) || rawVal;
            playOcrBeep();
            triggerOcrHaptic(50);
            setQuery(parsedTag);
            stopCamera();
          }
        } catch {
          // ignore frame scan frame errors
        }
      }, 350);
    } catch (err) {
      setCameraError('לא ניתן לגשת למצלמה. בדוק הרשאות.');
      console.warn('[MasterScanModal] Camera init error:', err);
    }
  }, [stopCamera]);

  // Clean up camera on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      dir="rtl"
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-900 border border-purple-500/40 rounded-3xl shadow-2xl shadow-purple-950/50 overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* ============================================================ */}
        {/* MODAL HEADER                                                 */}
        {/* ============================================================ */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 border border-purple-400/40 flex items-center justify-center text-white shadow-md shadow-purple-900/40 shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  סורק שטח ראשי ומאתר כלים גלובלי
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-wide">
                  Master Lookup
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                איתור וסריקת כלי עבודה בכלל הארגונים והמחסנים ללא שיוך למחסן ספציפי
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* ISOLATION BADGE BANNER                                       */}
        {/* ============================================================ */}
        <div className="bg-purple-950/40 border-b border-purple-800/40 px-4 py-2 flex items-center justify-between text-[11px] text-purple-200 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>
              סטטוס: <strong>מנהל על (Platform SuperAdmin)</strong> — חיפוש רוחבי בכלל המערכת ללא אימוץ מחסן לקוח
            </span>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 border border-purple-700/50 hidden sm:inline">
            wh: unassigned (global)
          </span>
        </div>

        {/* ============================================================ */}
        {/* SEARCH & CAMERA SCANNER TOOLBAR                              */}
        {/* ============================================================ */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="הקלד תגית (ZR-1032), מספר סידורי, שם כלי, דגם או שם עובד..."
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 pr-10 transition-colors shadow-inner"
                autoFocus
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={isCameraActive ? stopCamera : startCamera}
              className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                isCameraActive
                  ? 'bg-red-950/60 border-red-500/50 text-red-200'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title={isCameraActive ? 'כבה מצלמה' : 'הפעל מצלמת סריקה'}
            >
              {isCameraActive ? (
                <>
                  <CameraOff className="w-3.5 h-3.5 text-red-400" />
                  <span className="hidden sm:inline">סגור מצלמה</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">סריקת מצלמה</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void executeLookup(query)}
              disabled={isLoading}
              className="px-3 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
              title="רענן תוצאות"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Camera Viewport Drawer */}
          {isCameraActive && (
            <div className="relative rounded-2xl overflow-hidden border border-purple-500/50 bg-black aspect-video max-h-56 flex items-center justify-center shadow-lg">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-purple-400/40 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="w-48 h-32 border-2 border-dashed border-purple-300 rounded-xl animate-pulse flex items-center justify-center text-[10px] text-purple-200 bg-purple-950/20 font-bold">
                  כוון למדבקת ברקוד או QR
                </div>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-bold border border-white/20 cursor-pointer"
              >
                סגור
              </button>
            </div>
          )}

          {cameraError && (
            <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>{cameraError}</span>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* RESULTS & DETAIL SPLIT AREA                                  */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Selected Asset Spotlight Detail (if any) */}
          {selectedAsset && (
            <div className="bg-slate-950/90 border border-purple-500/50 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold shrink-0">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white leading-tight">
                      {selectedAsset.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                      {selectedAsset.brand && (
                        <span className="text-slate-400 font-medium">
                          יצרן: <strong className="text-slate-200">{selectedAsset.brand}</strong>
                        </span>
                      )}
                      {selectedAsset.modelNumber && (
                        <span className="text-slate-400 font-medium">
                          דגם: <strong className="text-slate-200">{selectedAsset.modelNumber}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="shrink-0">
                  {selectedAsset.status === 'in_stock' || selectedAsset.status === 'available' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      זמין במחסן
                    </span>
                  ) : selectedAsset.status === 'checked_out' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      מושאל בשטח
                    </span>
                  ) : selectedAsset.status === 'maintenance' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      בטיפול / תקול
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 border border-slate-600 text-xs font-bold">
                      {selectedAsset.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid Info Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                {/* Tag Number */}
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block">מספר תגית (Tag)</span>
                    <strong className="font-mono text-purple-300 text-sm">{selectedAsset.tagNumber}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedAsset.tagNumber, 'tag')}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    title="העתק תגית"
                  >
                    {copiedField === 'tag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Organization */}
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">סביבת ארגון (Organization)</span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-bold text-white truncate">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{selectedAsset.organizationName}</span>
                  </div>
                </div>

                {/* Warehouse */}
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">מחסן / אתר</span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-bold text-slate-200 truncate">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{selectedAsset.warehouseName || 'ללא שיוך'}</span>
                  </div>
                </div>

                {/* Custody Worker */}
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">עובד מחזיק</span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-bold text-slate-200 truncate">
                    <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{selectedAsset.assignedWorker || 'אין השאלה פעילה'}</span>
                  </div>
                  {selectedAsset.assignedWorkerPhone && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-0.5" dir="ltr">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span>{selectedAsset.assignedWorkerPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Close Spotlight Button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  חזור לרשימת תוצאות
                </button>
              </div>
            </div>
          )}

          {/* Results List */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold mb-2 px-1">
              <span>תוצאות חיפוש גלובלי ({assets.length})</span>
              {isLoading && (
                <div className="flex items-center gap-1.5 text-purple-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>מחפש...</span>
                </div>
              )}
            </div>

            {assets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {assets.map((asset) => {
                  const isSelected = selectedAsset?.id === asset.id;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate">
                          <h4 className="font-black text-xs text-white truncate">{asset.name}</h4>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-purple-300 mt-0.5">
                            <span>תגית: {asset.tagNumber}</span>
                            {asset.brand && (
                              <>
                                <span className="text-slate-600">|</span>
                                <span className="text-slate-400">{asset.brand}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Miniature Status Indicator */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            asset.status === 'in_stock' || asset.status === 'available'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : asset.status === 'checked_out'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {asset.status === 'in_stock' || asset.status === 'available'
                            ? 'זמין'
                            : asset.status === 'checked_out'
                            ? 'מושאל'
                            : 'בטיפול'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800/80 text-slate-400">
                        <div className="flex items-center gap-1 truncate">
                          <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{asset.organizationName}</span>
                        </div>
                        <span className="text-[10px] text-purple-400 font-bold shrink-0">
                          צפה בפרטים ←
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !isLoading ? (
              <div className="py-12 px-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-2">
                  <Search className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">לא נמצאו כלי עבודה</h4>
                <p className="text-xs text-slate-500 max-w-xs">
                  נסה להזין מספר תגית מדויק או חלק משם הכלי. החיפוש מתבצע בכלל הארגונים והמחסנים.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER                                                 */}
        {/* ============================================================ */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="text-[11px] text-slate-500 hidden sm:block">
            לחץ <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Esc</kbd> לסגירה
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all cursor-pointer mr-auto"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
