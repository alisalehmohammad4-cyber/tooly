'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Keyboard,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Loader2,
  ArrowRight,
  Sparkles,
  Camera,
  Layers,
  Check,
  RotateCcw,
  FileText,
} from 'lucide-react';
import {
  checkinFromWorkerAction,
  getCheckedOutAssetsForReturnAction,
  getAssetDetailsByQr,
  type ActiveCheckedOutAssetItem,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';
import { detectBarcodeOrQr, extractTagFromBarcodePayload } from '@/lib/ocr/barcodeDetector';
import { triggerOcrHaptic, playOcrBeep } from '@/lib/ocr/tagParser';
import OcrScannerModal from '@/components/modules/OcrScannerModal';

interface ManualCheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId?: string;
  preSelectedAssetId?: string | null;
  onSuccess?: () => void;
}

type CheckinTab = 'scanner' | 'manual';
type ReturnCondition = 'good' | 'excellent' | 'needs_repair';

export default function ManualCheckinModal({
  isOpen,
  onClose,
  warehouseId,
  preSelectedAssetId,
  onSuccess,
}: ManualCheckinModalProps) {
  const router = useRouter();
  const { currentOrganization } = useAuth();
  const orgId = currentOrganization?.id;

  // Active Top Tab: Scanner vs Manual
  const [activeTab, setActiveTab] = useState<CheckinTab>('manual');
  const [isOcrScannerOpen, setIsOcrScannerOpen] = useState<boolean>(false);

  // Omnisearch Query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active Field Loans
  const [checkedOutList, setCheckedOutList] = useState<ActiveCheckedOutAssetItem[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Return Confirmation State (Step 3)
  const [selectedAsset, setSelectedAsset] = useState<ActiveCheckedOutAssetItem | ScannedAssetDetails | null>(null);
  const [condition, setCondition] = useState<ReturnCondition>('good');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Camera Scanner State (Tab 1 - Minimalist Native Video)
  const [scannerStarted, setScannerStarted] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [manualBarcodeScanInput, setManualBarcodeScanInput] = useState<string>('');
  const [isSearchingBarcode, setIsSearchingBarcode] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isBusyRef = useRef<boolean>(false);

  // Load checked out assets on modal open
  const loadLoans = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingLoans(true);
    setLoadError(null);
    try {
      const list = await getCheckedOutAssetsForReturnAction(warehouseId, orgId);
      setCheckedOutList(list);

      // If preSelectedAssetId is provided, select it directly
      if (preSelectedAssetId) {
        const found = list.find((a) => a.id === preSelectedAssetId || a.qrCode === preSelectedAssetId);
        if (found) {
          setSelectedAsset(found);
        }
      }
    } catch (err) {
      console.error('Failed loading checked-out assets:', err);
      setLoadError('שגיאה בטעינת רשימת הכלים המושאלים מהשרת.');
    } finally {
      setIsLoadingLoans(false);
    }
  }, [isOpen, warehouseId, orgId, preSelectedAssetId]);

  useEffect(() => {
    if (isOpen) {
      void loadLoans();
      setSubmitFeedback(null);
      setNotes('');
      setCondition('good');
    } else {
      setSelectedAsset(null);
      setSearchQuery('');
    }
  }, [isOpen, loadLoans]);

  // Clean stop camera scanner helper
  const stopCameraScanner = useCallback(async () => {
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
        console.warn('Error clearing scanner stream:', err);
      } finally {
        streamRef.current = null;
      }
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerStarted(false);
    setTorchEnabled(false);
  }, [torchEnabled]);

  // Start Camera with Primary Rear lock & iOS graceful fallback
  const startCameraScanner = useCallback(
    async (requestedFacing?: 'environment' | 'user') => {
      setScannerError(null);
      const activeFacing = requestedFacing || facingMode;
      let stream: MediaStream | null = null;

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
            console.error('[ManualCheckin] getUserMedia failed completely:', e3);
          }
        }
      }

      if (!stream) {
        setScannerError('לא ניתן לגשת למצלמת המכשיר. אנא אשר גישה למצלמה.');
        setScannerStarted(false);
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScannerStarted(true);
    },
    [facingMode]
  );

  // Flip Camera (Back ↔ Front only)
  const handleFlipCamera = useCallback(async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await stopCameraScanner();
    await startCameraScanner(nextFacing);
  }, [facingMode, stopCameraScanner, startCameraScanner]);

  // Background frame scan check
  const performScanCheck = useCallback(async () => {
    if (!videoRef.current || isBusyRef.current || selectedAsset || !scannerStarted) return;
    if (videoRef.current.readyState < 2) return;

    isBusyRef.current = true;
    try {
      const res = await detectBarcodeOrQr(videoRef.current);
      if (res && res.rawValue) {
        const clean = extractTagFromBarcodePayload(res.rawValue);
        if (clean) {
          triggerOcrHaptic(50);
          playOcrBeep();
          const asset = await getAssetDetailsByQr(clean, warehouseId, orgId);
          if (asset) {
            setSelectedAsset(asset);
            setSubmitFeedback(null);
            await stopCameraScanner();
          } else {
            setScannerError(`לא נמצא כלי התואם לברקוד "${clean}".`);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      isBusyRef.current = false;
    }
  }, [selectedAsset, scannerStarted, warehouseId, orgId, stopCameraScanner]);

  // Lifecycle for camera scanner
  useEffect(() => {
    if (isOpen && activeTab === 'scanner' && !selectedAsset) {
      void startCameraScanner();
    } else {
      void stopCameraScanner();
    }
    return () => {
      void stopCameraScanner();
    };
  }, [isOpen, activeTab, selectedAsset, startCameraScanner, stopCameraScanner]);

  // Periodic interval
  useEffect(() => {
    if (!scannerStarted || selectedAsset || !isOpen || activeTab !== 'scanner') {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    scanIntervalRef.current = setInterval(() => {
      void performScanCheck();
    }, 200);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [scannerStarted, selectedAsset, isOpen, activeTab, performScanCheck]);

  // Handle Manual Barcode Lookup in Tab 1
  const handleBarcodeManualSearch = async () => {
    const code = manualBarcodeScanInput.trim();
    if (!code) return;
    setIsSearchingBarcode(true);
    setScannerError(null);
    try {
      const asset = await getAssetDetailsByQr(code, warehouseId, orgId);
      if (asset) {
        setSelectedAsset(asset);
        setManualBarcodeScanInput('');
        await stopCameraScanner();
      } else {
        setScannerError(`לא נמצא כלי התואם לקוד "${code}". בדוק את המספר או השתמש בלשונית איתור ידני.`);
      }
    } catch (err) {
      console.error('Error finding asset by barcode:', err);
      setScannerError('שגיאה באיתור הכלי במערכת.');
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  // Live Omnisearch Filter across Tag, Model, Serial, Worker Name & Phone
  const filteredLoans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return checkedOutList;

    return checkedOutList.filter((item) => {
      const matchQr = item.qrCode.toLowerCase().includes(q);
      const matchName = item.toolName.toLowerCase().includes(q);
      const matchBrand = item.brand.toLowerCase().includes(q);
      const matchModel = item.modelNumber ? item.modelNumber.toLowerCase().includes(q) : false;
      const matchSerial = item.serialNumber ? item.serialNumber.toLowerCase().includes(q) : false;
      const matchWorker = item.workerName.toLowerCase().includes(q);
      const matchPhone = item.workerPhone ? item.workerPhone.toLowerCase().includes(q) : false;

      return (
        matchQr ||
        matchName ||
        matchBrand ||
        matchModel ||
        matchSerial ||
        matchWorker ||
        matchPhone
      );
    });
  }, [checkedOutList, searchQuery]);

  // Handle Final Check-in Confirmation
  const handleConfirmCheckin = async () => {
    if (!selectedAsset) return;
    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      const res = await checkinFromWorkerAction({
        assetId: selectedAsset.id,
        condition,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'נסה שוב'}`);
        setSubmitFeedback({
          type: 'error',
          message: res.error || 'שגיאה בקליטת הכלי למחסן.',
        });
        return;
      }

      // Optimistically remove from checked out list immediately:
      setCheckedOutList((prev) => prev.filter((item) => item.id !== selectedAsset.id));

      // Force Next.js to re-fetch Server Components and update all tables/metrics:
      router.refresh();

      setSubmitFeedback({
        type: 'success',
        message: res.message || 'הכלי נקלט בהצלחה והוחזר למלאי המחסן!',
      });
      // Reload list and notify parent
      await loadLoans();
      if (onSuccess) onSuccess();

      // After a moment, clear selected asset so user can check in another or finish
      setTimeout(() => {
        setSelectedAsset(null);
        setNotes('');
        setCondition('good');
        setSubmitFeedback(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת עם השרת';
      alert(`שגיאה בביצוע הפעולה: ${msg}`);
      setSubmitFeedback({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div
        dir="rtl"
        className="relative w-full max-w-2xl bg-white rounded-3xl border-2 border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-blue-200 border border-white/20 shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black leading-tight flex items-center gap-2">
                <span>קליטת ציוד והחזרה למחסן</span>
                <span className="text-[10px] font-bold bg-blue-500/30 text-blue-100 px-2 py-0.5 rounded-full border border-blue-400/30">
                  החזרה מהשטח
                </span>
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5">
                סריקת ברקוד מהירה או איתור ידני מתוך רשימת הכלים המושאלים
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK BANNER (If present) */}
        {submitFeedback && (
          <div
            className={`p-3.5 mx-4 mt-3 rounded-2xl text-xs font-bold flex items-center gap-2.5 border shrink-0 animate-in fade-in ${
              submitFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : 'bg-rose-50 text-rose-950 border-rose-300'
            }`}
          >
            {submitFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div className="flex-1 leading-snug">{submitFeedback.message}</div>
          </div>
        )}

        {/* BODY CONTAINER */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* STEP 3: RETURN CONFIRMATION VIEW (When an asset is selected) */}
          {selectedAsset ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                    ✓
                  </span>
                  <span>אישור קליטת כלי עבודה</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsset(null);
                    setSubmitFeedback(null);
                  }}
                  className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>בחר כלי אחר</span>
                </button>
              </div>

              {/* Selected Tool Details Card */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border-2 border-blue-200 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-black text-blue-950 bg-white px-2.5 py-0.5 rounded-md border border-blue-300" dir="ltr">
                        {selectedAsset.qrCode}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        {selectedAsset.brand}
                      </span>
                      {selectedAsset.modelNumber && (
                        <span className="font-mono text-[11px] text-slate-600 font-bold" dir="ltr">
                          {selectedAsset.modelNumber}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-blue-950">{selectedAsset.toolName}</h3>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold text-slate-500 block">מחסן שיוך:</span>
                    <span className="text-xs font-black text-slate-800">
                      {'warehouseName' in selectedAsset && selectedAsset.warehouseName
                        ? selectedAsset.warehouseName
                        : 'מחסן שטח ראשי'}
                    </span>
                  </div>
                </div>

                {/* Assigned Worker Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white/80 p-2.5 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-bold text-slate-700">מושאל לעובד:</span>
                    <span className="font-black text-blue-950">
                      {'currentAssignedWorker' in selectedAsset && selectedAsset.currentAssignedWorker
                        ? selectedAsset.currentAssignedWorker
                        : 'workerName' in selectedAsset && selectedAsset.workerName
                        ? selectedAsset.workerName
                        : 'עובד שטח'}
                    </span>
                  </div>

                  {'workerPhone' in selectedAsset && selectedAsset.workerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-slate-700">טלפון:</span>
                      <span className="font-mono font-bold text-slate-900" dir="ltr">
                        {selectedAsset.workerPhone}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* CHECKOUT NOTE ALERT BANNER */}
              {(() => {
                const checkoutNote =
                  ('lastCheckoutNote' in selectedAsset && selectedAsset.lastCheckoutNote) ||
                  ('last_checkout_note' in selectedAsset && selectedAsset.last_checkout_note) ||
                  null;
                if (!checkoutNote) return null;
                return (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex items-start gap-2.5 shadow-xs">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <span className="font-black text-amber-900 block">
                        ⚠️ שים לב - הערת ניפוק (Checkout Note):
                      </span>
                      <p className="font-bold text-amber-950 italic text-xs leading-relaxed">
                        &ldquo;{checkoutNote}&rdquo;
                      </p>
                      <span className="text-[10px] text-amber-800 font-bold block">
                        ודא החזרת כל הציוד הנלווה, כבלים או אביזרים שצוינו במעמד הניפוק לפני אישור הקליטה.
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Condition Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-800">
                  מצב הכלי בעת ההחזרה:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Condition 1: Good */}
                  <button
                    type="button"
                    onClick={() => setCondition('good')}
                    className={`p-3 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                      condition === 'good'
                        ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg">✅</span>
                      {condition === 'good' && (
                        <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      )}
                    </div>
                    <div className="font-black text-xs">תקין (Good)</div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      כלי נקי ותקין, מוכן להשאלה הבאה
                    </div>
                  </button>

                  {/* Condition 2: Excellent */}
                  <button
                    type="button"
                    onClick={() => setCondition('excellent')}
                    className={`p-3 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                      condition === 'excellent'
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 text-blue-950 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg">✨</span>
                      {condition === 'excellent' && (
                        <Check className="w-4 h-4 text-blue-600 stroke-[3]" />
                      )}
                    </div>
                    <div className="font-black text-xs">מעולה (Excellent)</div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      כמו חדש ללא שחיקה או פגם
                    </div>
                  </button>

                  {/* Condition 3: Damaged / Needs Repair */}
                  <button
                    type="button"
                    onClick={() => setCondition('needs_repair')}
                    className={`p-3 rounded-2xl border-2 text-right transition-all cursor-pointer ${
                      condition === 'needs_repair'
                        ? 'bg-rose-50/90 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-lg">⚠️</span>
                      {condition === 'needs_repair' && (
                        <Check className="w-4 h-4 text-rose-600 stroke-[3]" />
                      )}
                    </div>
                    <div className="font-black text-xs text-rose-950">
                      תקול - דרוש תיקון (Needs Repair)
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      יועבר לסטטוס בדיקה/תיקון במחסן
                    </div>
                  </button>
                </div>
              </div>

              {/* Notes Input */}
              <div className="space-y-1">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-800">
                  הערות קליטה (אופציונלי):
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הזן הערות כגון: נבדק מנוע, סוללה הוחזרה במלואה, דורש ניקוי מאבק..."
                  rows={2}
                  className="w-full bg-white border-2 border-slate-200 focus:border-blue-600 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:outline-none shadow-xs resize-none"
                />
              </div>

              {/* Final Confirm Check-in Button */}
              <button
                type="button"
                onClick={() => void handleConfirmCheckin()}
                disabled={isSubmitting}
                className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-98 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>קולט כלי ומעדכן מלאי...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>אשר קליטה חזרה למחסן</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* SELECTION STEP: TABS (Camera Scanner vs Manual Omnisearch) */
            <div className="space-y-4">
              {/* TOP TAB TOGGLE */}
              <div className="flex flex-nowrap overflow-x-auto no-scrollbar py-1 gap-2 border-b border-slate-200 sm:border sm:border-slate-200 sm:p-1 sm:bg-slate-100 sm:rounded-2xl">
                {/* Tab 1: Scanner */}
                <button
                  type="button"
                  onClick={() => setActiveTab('scanner')}
                  className={`shrink-0 whitespace-nowrap flex-1 py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'scanner'
                      ? 'bg-white text-blue-950 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-blue-900'
                  }`}
                >
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>📷 סריקת QR / ברקוד</span>
                </button>

                {/* Tab 2: Manual Omnisearch */}
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`shrink-0 whitespace-nowrap flex-1 py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'manual'
                      ? 'bg-white text-blue-950 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-blue-900'
                  }`}
                >
                  <Keyboard className="w-4 h-4 text-indigo-600" />
                  <span>⌨️ איתור ידני (ללא סריקה)</span>
                  {checkedOutList.length > 0 && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded-full">
                      {checkedOutList.length}
                    </span>
                  )}
                </button>
              </div>

              {/* TAB 1: CAMERA SCANNER */}
              {activeTab === 'scanner' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="relative w-full aspect-[4/3] max-w-sm mx-auto bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder frame */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-[68%] aspect-square max-w-[240px] relative rounded-3xl border border-white/40 bg-white/[0.02] flex items-center justify-center">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/70 rounded-br-lg" />
                        <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent shadow-[0_0_8px_#34d399] animate-[bounce_2.5s_infinite]" />
                      </div>
                    </div>

                    {/* Floating flip camera button */}
                    <div className="absolute bottom-3 right-3 pointer-events-auto">
                      <button
                        type="button"
                        onClick={() => void handleFlipCamera()}
                        className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-md transition-all active:scale-90 cursor-pointer"
                        title="החלף מצלמה"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {!scannerStarted && !scannerError && (
                      <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2 p-4 text-center z-10">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <span className="text-xs font-bold">מפעיל מצלמה לסריקה...</span>
                      </div>
                    )}
                  </div>

                  {/* INDUSTRIAL OCR SCANNER TRIGGER */}
                  <button
                    type="button"
                    onClick={async () => {
                      await stopCameraScanner();
                      setIsOcrScannerOpen(true);
                    }}
                    className="w-full max-w-sm mx-auto py-2.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-700/25 cursor-pointer transition-all hover:scale-[1.01] active:scale-95"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>סרוק כלי (QR / OCR)</span>
                  </button>

                  {scannerError && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{scannerError}</span>
                    </div>
                  )}

                  {/* Manual Barcode / Serial Direct Input */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="block text-xs font-black text-slate-800">
                      או הקלד מספר תגית / ברקוד ידנית:
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={manualBarcodeScanInput}
                          onChange={(e) => setManualBarcodeScanInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleBarcodeManualSearch();
                          }}
                          placeholder="לדוגמה: ZR-1099 או 1099..."
                          className="w-full bg-white border-2 border-slate-200 focus:border-blue-600 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleBarcodeManualSearch()}
                        disabled={isSearchingBarcode || !manualBarcodeScanInput.trim()}
                        className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        {isSearchingBarcode ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>אתר כלי</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MANUAL OMNISEARCH & QUICK-LIST */}
              {activeTab === 'manual' && (
                <div className="space-y-3 animate-in fade-in">
                  {/* Live Omnisearch Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="חפש לפי מספר תג (למשל ZR-1099), שם עובד, דגם או מותג..."
                      className="w-full min-h-[44px] bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl pr-10 pl-3 py-2 text-xs font-bold text-slate-900 focus:outline-none transition-all shadow-xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                      >
                        נקה
                      </button>
                    )}
                  </div>

                  {/* Loan List Header */}
                  <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-bold">
                    <span>
                      כלים מושאלים בשטח ({filteredLoans.length} מתוך {checkedOutList.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadLoans()}
                      disabled={isLoadingLoans}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-black cursor-pointer flex items-center gap-1"
                    >
                      {isLoadingLoans ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      <span>רענן</span>
                    </button>
                  </div>

                  {/* Active Field Loans List */}
                  {isLoadingLoans ? (
                    <div className="py-10 text-center text-slate-400 font-bold text-xs space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                      <div>טוען רשימת כלים מושאלים בשטח...</div>
                    </div>
                  ) : loadError ? (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{loadError}</span>
                    </div>
                  ) : filteredLoans.length === 0 ? (
                    <div className="py-10 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-2">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                      <div className="text-xs font-black text-slate-700">
                        {searchQuery
                          ? 'לא נמצאו כלים מושאלים התואמים לחיפוש.'
                          : 'כל הכלים נמצאים כרגע במחסן! אין כלים בהשאלה פעילה.'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {searchQuery
                          ? 'נסה לחפש לפי חלק ממספר התגית, שם העובד או סוג הכלי.'
                          : 'כאשר כלים ינופקו לעובדים, הם יופיעו כאן לקליטה מהירה.'}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {filteredLoans.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            item.isOverdue
                              ? 'bg-rose-50/50 border-rose-200 hover:border-rose-400'
                              : 'bg-white border-slate-200 hover:border-blue-400 shadow-xs'
                          }`}
                        >
                          {/* Left Details (in RTL): Tag, Name, Worker */}
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="font-mono text-[11px] font-black text-blue-950 bg-slate-100 px-2 py-0.5 rounded border border-slate-300"
                                dir="ltr"
                              >
                                {item.qrCode}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase">
                                {item.brand}
                              </span>
                              {item.modelNumber && (
                                <span className="font-mono text-[10px] text-slate-500 font-bold" dir="ltr">
                                  {item.modelNumber}
                                </span>
                              )}
                              {item.isOverdue && (
                                <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>באיחור ({item.daysOverdue} ימים)</span>
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-black text-slate-900 truncate">
                              {item.toolName}
                            </h4>

                            <div className="flex items-center gap-3 text-[11px] text-slate-600 flex-wrap">
                              <div className="flex items-center gap-1 font-bold text-blue-950">
                                <User className="w-3 h-3 text-blue-600" />
                                <span>{item.workerName}</span>
                              </div>

                              {item.workerPhone && (
                                <div className="flex items-center gap-1 font-mono text-slate-500" dir="ltr">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{item.workerPhone}</span>
                                </div>
                              )}

                              {item.timeSinceCheckoutText && (
                                <div className="flex items-center gap-1 text-slate-400">
                                  <Clock className="w-3 h-3" />
                                  <span>הונפק {item.timeSinceCheckoutText}</span>
                                </div>
                              )}
                            </div>

                            {/* Checkout Note Chip */}
                            {item.lastCheckoutNote && (
                              <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/70 text-[11px] text-amber-950 font-medium flex items-center gap-1.5">
                                <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="font-bold">הערת ניפוק:</span>
                                <span className="italic truncate">&ldquo;{item.lastCheckoutNote}&rdquo;</span>
                              </div>
                            )}
                          </div>

                          {/* Action Button: [בחר להחזרה] */}
                          <button
                            type="button"
                            onClick={() => setSelectedAsset(item)}
                            className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>בחר להחזרה</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>קליטת ציוד מעדכנת את סטטוס הכלי במלאי ורושמת אירוע החזרה ביומן.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer shadow-2xs"
          >
            סגור
          </button>
        </div>
      </div>

      {/* INDUSTRIAL OCR SCANNER MODAL */}
      <OcrScannerModal
        isOpen={isOcrScannerOpen}
        onClose={() => setIsOcrScannerOpen(false)}
        onAssetDetected={async (asset) => {
          await stopCameraScanner();
          setSelectedAsset(asset);
          setIsOcrScannerOpen(false);
        }}
        warehouseId={warehouseId}
        title="סריקת כלי (QR / OCR)"
      />
    </div>
  );
}
