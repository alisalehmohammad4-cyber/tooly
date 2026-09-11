'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Html5Qrcode } from 'html5-qrcode';
import {
  Printer,
  CameraOff,
  QrCode,
  Building2,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowLeft,
  ShieldAlert,
  Loader2,
  Scan,
  UserCheck,
  History as HistoryIcon,
  ShoppingCart,
  Zap,
  HardHat,
  KeyRound,
  FileText,
  Lock,
  BookmarkCheck,
} from 'lucide-react';
import type { Category, Warehouse, AssetCondition } from '@/types/domain';
import { checkQrCodeExists, onboardAsset } from '@/app/actions/assets';
import AssetActionModal from '@/components/modules/AssetActionModal';
import BulkCheckoutModal from '@/components/modules/BulkCheckoutModal';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import {
  getAssetDetailsByQr,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';
import UserRoleHeaderPill from '@/components/common/UserRoleHeaderPill';

interface QuickOnboardViewProps {
  categories: Category[];
  warehouses: Warehouse[];
}

const COMMON_BRANDS = ['DeWalt', 'Milwaukee', 'Makita', 'Bosch', 'Hilti', 'Stihl'];

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'available':
      return 'זמין במלאי';
    case 'checked_out':
      return 'בשימוש';
    case 'maintenance':
      return 'בתיקון / בדיקה';
    default:
      return status;
  }
};

export default function QuickOnboardView({
  categories,
  warehouses,
}: QuickOnboardViewProps) {
  const { role, openPinModal } = useAuth();

  // Sticky Warehouse State (Retained across scans)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );

  // Category State (Retained across scans)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || ''
  );

  // QR Scanner & Input State
  const [qrCode, setQrCode] = useState<string>('');
  const [manualQrInput, setManualQrInput] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isVerifyingQr, setIsVerifyingQr] = useState<boolean>(false);
  const [qrWarning, setQrWarning] = useState<string | null>(null);

  // Tool Form Details
  const [toolName, setToolName] = useState<string>('');
  const [brand, setBrand] = useState<string>('DeWalt');
  const [modelNumber, setModelNumber] = useState<string>('');
  const [condition, setCondition] = useState<AssetCondition>('good');

  // Status & Continuous Loop Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastEnrolledTool, setLastEnrolledTool] = useState<{
    name: string;
    qrCode: string;
    id: string;
  } | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState<number>(0);

  // Scanned Registered Asset (for quick custody modal)
  const [scannedRegisteredAsset, setScannedRegisteredAsset] =
    useState<ScannedAssetDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

  // Bulk Dispatch Cart State
  const [dispatchCart, setDispatchCart] = useState<ScannedAssetDetails[]>([]);
  const [isRapidDispatchMode, setIsRapidDispatchMode] = useState<boolean>(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);

  // Scanner References
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScannedQrRef = useRef<{ code: string; timestamp: number }>({
    code: '',
    timestamp: 0,
  });

  // Stop scanner instance safely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping html5-qrcode scanner:', err);
      } finally {
        isScanningRef.current = false;
        setScannerActive(false);
      }
    }
  }, []);

  // Add asset to dispatch cart
  const handleAddToCart = useCallback((asset: ScannedAssetDetails) => {
    setDispatchCart((prev) => {
      if (prev.some((item) => item.id === asset.id)) {
        setLastActionMessage(`הכלי "${asset.toolName}" כבר קיים בסל הניפוק`);
        return prev;
      }
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([80, 40, 80]);
        } catch {
          // Vibration not supported
        }
      }
      setLastActionMessage(
        `הכלי "${asset.toolName}" נוסף לסל הניפוק (סה"כ: ${prev.length + 1})`
      );
      return [...prev, asset];
    });
  }, []);

  // Remove single item from dispatch cart
  const handleRemoveFromCart = (assetId: string) => {
    setDispatchCart((prev) => prev.filter((item) => item.id !== assetId));
  };

  // Bulk checkout complete handler
  const handleBulkCheckoutComplete = (
    message: string,
    checkedOutAssets: ScannedAssetDetails[]
  ) => {
    setDispatchCart([]);
    setSessionCount((prev) => prev + checkedOutAssets.length);
    setLastActionMessage(message);
    setLastEnrolledTool(null);
    setScannedRegisteredAsset(null);
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setIsBulkModalOpen(false);
    setScannerActive(true);
  };

  // Handle successful QR detection
  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const cleanQr = decodedText.trim();
      if (!cleanQr) return;

      const now = Date.now();
      // Debounce duplicate frames of the exact same QR code within 1.5 seconds
      if (
        cleanQr === lastScannedQrRef.current.code &&
        now - lastScannedQrRef.current.timestamp < 1500
      ) {
        return;
      }
      lastScannedQrRef.current = { code: cleanQr, timestamp: now };

      // 1. Haptic feedback for field operator
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // Vibration not supported or allowed on browser
        }
      }

      try {
        const existing = await getAssetDetailsByQr(cleanQr);

        if (existing) {
          // RAPID CONTINUOUS DISPATCH MODE (Supervisor & Admin only):
          if (isRapidDispatchMode && role !== 'worker') {
            if (existing.status === 'available') {
              handleAddToCart(existing);
              // In rapid continuous dispatch, do not stop camera — continue scanning!
              return;
            } else {
              // Asset is checked out or needs repair — pause and alert operator
              await stopScanner();
              setScannedRegisteredAsset(existing);
              setIsModalOpen(true);
              setQrWarning(null);
              return;
            }
          }

          // STANDARD MODE / WORKER MODE -> Open custody / tool info modal
          await stopScanner();
          setQrCode(cleanQr);
          setManualQrInput(cleanQr);
          setScannedRegisteredAsset(existing);
          setIsModalOpen(true);
          setQrWarning(null);
          return;
        }

        // TOOL NOT FOUND -> Flow to onboarding
        await stopScanner();
        setQrCode(cleanQr);
        setManualQrInput(cleanQr);
        setIsVerifyingQr(true);
        const exists = await checkQrCodeExists(cleanQr);
        if (exists) {
          setQrWarning(`קוד QR "${cleanQr}" כבר רשום במערכת.`);
        } else {
          setQrWarning(null);
        }
        setScannedRegisteredAsset(null);
      } catch (err) {
        console.error('Error verifying QR code:', err);
      } finally {
        setIsVerifyingQr(false);
      }
    },
    [isRapidDispatchMode, stopScanner, handleAddToCart, role]
  );

  // Synchronize Scanner lifecycle without synchronous effect setState
  useEffect(() => {
    let isCancelled = false;

    if (!qrCode && scannerActive) {
      import('html5-qrcode')
        .then(({ Html5Qrcode }) => {
          if (isCancelled) return;
          const readerElem = document.getElementById('qr-reader');
          if (!readerElem) return;

          if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode('qr-reader');
          }

          if (!isScanningRef.current) {
            scannerRef.current
              .start(
                { facingMode: 'environment' },
                {
                  fps: 10,
                  qrbox: { width: 240, height: 240 },
                  aspectRatio: 1.0,
                },
                handleScanSuccess,
                () => {
                  // Non-QR noise frame, ignore
                }
              )
              .then(() => {
                if (!isCancelled) {
                  isScanningRef.current = true;
                }
              })
              .catch((err: unknown) => {
                if (!isCancelled) {
                  isScanningRef.current = false;
                  setScannerActive(false);
                  const msg =
                    err instanceof Error ? err.message : 'לא ניתן להפעיל את המצלמה.';
                  setScannerError(msg);
                }
              });
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            const msg =
              err instanceof Error ? err.message : 'טעינת רכיב הסורק נכשלה.';
            setScannerError(msg);
          }
        });
    }

    return () => {
      isCancelled = true;
      if (scannerRef.current && isScanningRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            isScanningRef.current = false;
          })
          .catch(() => {});
      }
    };
  }, [qrCode, scannerActive, handleScanSuccess]);

  // Reset QR state and re-open scanner
  const handleReScan = async () => {
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setSubmitError(null);
    setScannerError(null);
    setScannedRegisteredAsset(null);
    setIsModalOpen(false);
    setShowManualInput(false);
    setScannerActive(true);
  };

  // Callback when custody action completes from modal
  const handleModalActionComplete = (message: string) => {
    setLastActionMessage(message);
    setLastEnrolledTool(null);
    setSessionCount((prev) => prev + 1);
    setScannedRegisteredAsset(null);
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setSubmitError(null);
    setIsModalOpen(false);
    setScannerActive(true);
  };

  // Manual QR input submission
  const handleManualQrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQrInput.trim()) return;
    await handleScanSuccess(manualQrInput.trim());
  };

  // Handle Save and loop to next tool
  const handleSubmitAndNext = async () => {
    setSubmitError(null);

    if (!selectedWarehouseId) {
      setSubmitError('אנא בחר מחסן / אתר פעיל.');
      return;
    }
    if (!selectedCategoryId) {
      setSubmitError('אנא בחר קטגוריית כלי.');
      return;
    }
    if (!qrCode) {
      setSubmitError('אנא סרוק או הזן קוד QR תחילה.');
      return;
    }
    if (qrWarning) {
      setSubmitError('לא ניתן לרשום: קוד QR זה כבר רשום במערכת.');
      return;
    }
    if (!toolName.trim()) {
      setSubmitError('שם הכלי הוא שדה חובה (לדוגמה: מברגת אימפקט 18V).');
      return;
    }
    if (!brand.trim()) {
      setSubmitError('שם היצרן / מותג הוא שדה חובה.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await onboardAsset({
        warehouseId: selectedWarehouseId,
        categoryId: selectedCategoryId,
        qrCode: qrCode.trim(),
        toolName: toolName.trim(),
        brand: brand.trim(),
        modelNumber: modelNumber.trim() || undefined,
        condition,
      });

      if (!result.success) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      // Success feedback banner
      setLastEnrolledTool({
        name: toolName.trim(),
        qrCode: qrCode.trim(),
        id: result.assetId,
      });
      setSessionCount((prev) => prev + 1);

      // Reset tool-specific fields, retaining warehouse and category
      setToolName('');
      setModelNumber('');
      setQrCode('');
      setManualQrInput('');
      setQrWarning(null);
      setSubmitError(null);
      setIsSubmitting(false);

      // Re-activate scanner for the continuous field loop
      setScannerActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'רישום הכלי נכשל.';
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-blue-950 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. STICKY TOP BAR: Warehouse Selector (Retained across scans) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25">
              T
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-blue-600 font-bold">
                סורק שטח מהיר
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                Tooly - תפעול שטח
              </h1>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5">
            <UserRoleHeaderPill />

            <Link
              href="/catalog"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="קטלוג כלים"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>קטלוג</span>
            </Link>

            <Link
              href="/history"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="יומן תנועות"
            >
              <HistoryIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>יומן</span>
            </Link>

            {role !== 'worker' && (
              <Link
                href="/print-tags"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
                title="הדפסת תגיות ברקוד"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>תגיות</span>
              </Link>
            )}

            {/* Session Counter Badge */}
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200" title="פעולות בסשן הנוכחי">
              <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
              <span className="text-xs font-black text-blue-700">{sessionCount}</span>
            </div>
          </div>
        </div>

        {/* Sticky Warehouse Selection Dropdown */}
        <div className="mt-3 max-w-lg mx-auto">
          <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            אתר / מחסן פעיל
          </label>
          <div className="relative">
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer transition-colors shadow-sm"
            >
              {warehouses.length > 0 ? (
                warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                    {wh.code ? `[${wh.code}] ` : ''}
                    {wh.name}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  אין מחסנים פעילים זמינים
                </option>
              )}
            </select>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
              ▼
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {/* CUSTODY ACTION SUCCESS TOAST BANNER */}
        {lastActionMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-emerald-800 uppercase tracking-wider">
                פעולת תנועה נרשמה בהצלחה
              </div>
              <div className="text-sm font-bold text-emerald-950 mt-0.5">
                {lastActionMessage}
              </div>
            </div>
          </div>
        )}

        {/* ONBOARD SUCCESS LOOP TOAST BANNER */}
        {lastEnrolledTool && (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-emerald-800 uppercase tracking-wider">
                הכלי נרשם בהצלחה ומוכן לסריקה הבאה
              </div>
              <div className="text-sm font-bold text-emerald-950 truncate">
                {lastEnrolledTool.name}
              </div>
              <div className="text-xs font-mono text-emerald-700 mt-0.5 font-bold">
                קוד: {lastEnrolledTool.qrCode}
              </div>
            </div>
          </div>
        )}

        {/* 2. SCANNER / BARCODE CAPTURE SECTION */}
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                1. סריקת ברקוד או קוד QR
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {/* RAPID CONTINUOUS DISPATCH MODE TOGGLE (Supervisor & Admin only) */}
              {role !== 'worker' && (
                <button
                  type="button"
                  onClick={() => setIsRapidDispatchMode(!isRapidDispatchMode)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer ${
                    isRapidDispatchMode
                      ? 'bg-amber-100 text-amber-950 border-amber-400 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                  title="תפעול מצב סריקה מהירה לסל ניפוק"
                >
                  <Zap
                    className={`w-3.5 h-3.5 ${
                      isRapidDispatchMode ? 'text-amber-600 fill-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{isRapidDispatchMode ? 'ניפוק מהיר: פעיל' : 'ניפוק מרוכז'}</span>
                </button>
              )}

              {qrCode && (
                <button
                  type="button"
                  onClick={handleReScan}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 border border-blue-200 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  סרוק שוב
                </button>
              )}
            </div>
          </div>

          {/* ACTIVE QR CODE PRESENT */}
          {qrCode ? (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-blue-50/60 border-2 border-blue-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      ברקוד / QR שנסרק
                    </div>
                    <div className="text-lg font-mono font-black text-blue-950 truncate" dir="ltr">
                      {qrCode}
                    </div>
                  </div>
                </div>

                {isVerifyingQr ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                ) : scannedRegisteredAsset ? (
                  <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0" />
                ) : qrWarning ? (
                  <ShieldAlert className="w-6 h-6 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                )}
              </div>

              {/* REGISTERED ASSET DETECTED BANNER */}
              {scannedRegisteredAsset && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-300 flex flex-col gap-3 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 inline-block mb-1">
                        כלי רשום במערכת
                      </div>
                      <h3 className="text-base font-black text-blue-950 leading-snug">
                        {scannedRegisteredAsset.toolName}
                      </h3>
                      <div className="text-xs text-blue-800 flex items-center gap-1.5 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>{scannedRegisteredAsset.warehouseName}</span>
                      </div>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                      {scannedRegisteredAsset.status}
                    </span>
                  </div>

                  {/* Lockout / Safety Overdue / Reservation Badges */}
                  {(scannedRegisteredAsset.isLocked ||
                    (scannedRegisteredAsset.safetyInspectionDue &&
                      new Date(scannedRegisteredAsset.safetyInspectionDue).getTime() <
                        new Date().getTime()) ||
                    scannedRegisteredAsset.reservation) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {scannedRegisteredAsset.isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                          <Lock className="w-3 h-3 text-red-600" />
                          כלי נעול מנהלתית
                        </span>
                      )}
                      {scannedRegisteredAsset.safetyInspectionDue &&
                        new Date(scannedRegisteredAsset.safetyInspectionDue).getTime() <
                          new Date().getTime() && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            בדיקת בטיחות פגה
                          </span>
                        )}
                      {scannedRegisteredAsset.reservation && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          <BookmarkCheck className="w-3 h-3 text-amber-600" />
                          משוריין: {scannedRegisteredAsset.reservation.projectName}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-blue-200 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="flex-1 min-h-[50px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 stroke-[2.5]" />
                      <span>ניהול (ניפוק / החזרה / העברה)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPassportOpen(true)}
                      className="min-h-[50px] px-3.5 rounded-xl bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs border border-blue-300 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm"
                      title="צפה בדרכון הכלי המלא"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>דרכון כלי</span>
                    </button>

                    {scannedRegisteredAsset.status === 'available' &&
                      !scannedRegisteredAsset.isLocked && (
                        <button
                          type="button"
                          onClick={() => {
                            handleAddToCart(scannedRegisteredAsset);
                            handleReScan();
                          }}
                          className="min-h-[50px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                          title="הוסף לסל ניפוק וסרוק את הכלי הבא"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>+ הוסף לסל</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={handleReScan}
                      className="min-h-[50px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-900 text-xs font-bold border border-slate-300 active:scale-95 transition-all cursor-pointer"
                    >
                      הבא
                    </button>
                  </div>
                </div>
              )}

              {/* DUPLICATE QR WARNING BANNER */}
              {qrWarning && !scannedRegisteredAsset && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-black text-red-800 uppercase tracking-wide">
                      קוד QR כבר קיים במערכת
                    </div>
                    <div className="text-xs text-red-700 font-medium mt-0.5">
                      {qrWarning}
                    </div>
                    <button
                      type="button"
                      onClick={handleReScan}
                      className="mt-3 min-h-[48px] w-full px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      סרוק קוד אחר
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CAMERA VIEWFINDER & SCAN BOX */
            <div className="space-y-3">
              <div className="relative w-full aspect-square max-h-72 rounded-xl overflow-hidden bg-slate-900 border-2 border-blue-200 flex flex-col items-center justify-center shadow-inner">
                <div id="qr-reader" className="w-full h-full" />

                {scannerError && (
                  <div className="absolute inset-0 bg-white/95 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <CameraOff className="w-10 h-10 text-blue-600" />
                    <div className="text-sm font-bold text-blue-950">
                      אין גישה למצלמה
                    </div>
                    <p className="text-xs text-slate-600 max-w-xs">
                      {scannerError}. ניתן להזין את הקוד ידנית למטה.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualInput(true);
                        setScannerError(null);
                        setScannerActive(true);
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 flex items-center gap-2 hover:bg-blue-100 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> נסה שוב
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Input Toggle */}
              <div className="pt-1">
                {showManualInput ? (
                  <form onSubmit={handleManualQrSubmit} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualQrInput}
                        onChange={(e) => setManualQrInput(e.target.value)}
                        placeholder="הזן ברקוד/QR ידנית (למשל TL-99281)"
                        className="flex-1 min-h-[56px] bg-white text-blue-950 font-mono font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                        dir="ltr"
                      />
                      <button
                        type="submit"
                        className="min-h-[56px] px-5 rounded-xl bg-blue-600 text-white font-black text-sm uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        אישור
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-800 underline py-1 cursor-pointer"
                  >
                    לא מצליח לסרוק? הזן ברקוד ידנית
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. TOOL DETAILS FORM OR REGISTERED ASSET ACTION */}
        {scannedRegisteredAsset ? (
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
              {role === 'worker' ? (
                <HardHat className="w-6 h-6 text-amber-600" />
              ) : (
                <UserCheck className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-base font-black text-blue-950">
                {role === 'worker' ? 'כרטיס כלי' : 'כלי רשום במערכת'} &bull; {scannedRegisteredAsset.toolName}
              </h2>
              <p className="text-xs text-blue-800 max-w-xs mx-auto mt-1">
                סטטוס נוכחי: <strong>{getStatusLabel(scannedRegisteredAsset.status)}</strong> ב-
                <strong>{scannedRegisteredAsset.warehouseName}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className={`w-full min-h-[60px] rounded-xl text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer ${
                role === 'worker'
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25'
              }`}
            >
              {role === 'worker' ? (
                <>
                  <Wrench className="w-5 h-5 stroke-[2.5]" />
                  <span>צפה בכרטיס כלי / דיווח על תקלה</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5 stroke-[2.5]" />
                  <span>פעולות תנועה ומשמורת (ניפוק / החזרה / העברה)</span>
                </>
              )}
            </button>
          </div>
        ) : role === 'worker' ? (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-5 shadow-sm text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-300">
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-amber-950">
                קוד אינו רשום במערכת
              </h2>
              <p className="text-xs text-amber-900 max-w-xs mx-auto mt-1 font-medium">
                פעולת קליטת כלי חדש למחסן שמורה למנהלי עבודה ומנהלי מערכת בלבד.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={openPinModal}
                className="w-full min-h-[50px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
              >
                <KeyRound className="w-4 h-4" />
                <span>כניסת מנהל עבודה (קוד PIN)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQrCode('');
                  setManualQrInput('');
                  setScannerActive(true);
                }}
                className="w-full py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                סרוק כלי קיים
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 space-y-5">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                2. מפרט הכלי החדש
              </h2>
            </div>

            {/* SINGLE-TAP CATEGORY SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                קטגוריית ציוד
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`min-h-[56px] px-3 py-2 rounded-xl text-sm font-black transition-all flex items-center justify-center text-center border-2 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 scale-[1.02]'
                          : 'bg-slate-50 text-blue-950 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-100'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TOOL NAME INPUT */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                שם הכלי <span className="text-blue-600">*</span>
              </label>
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="לדוגמה: פטישון נטען 18V"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* BRAND SELECTION & RAPID PRESETS */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  יצרן / מותג <span className="text-blue-600">*</span>
                </label>
              </div>
              {/* Quick-tap brand pills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      brand.toLowerCase() === b.toLowerCase()
                        ? 'bg-blue-600 text-white border-blue-600 font-black shadow-sm'
                        : 'bg-slate-50 text-blue-900 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="שם היצרן / מותג"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* MODEL NUMBER (OPTIONAL) */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                דגם / מק&quot;ט <span className="text-slate-400 font-normal">(אופציונלי)</span>
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="לדוגמה: DCH273B או 2804-20"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* CONDITION SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2">
                מצב פיזי ראשוני
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'excellent', label: 'מעולה' },
                    { value: 'good', label: 'טוב' },
                    { value: 'needs_repair', label: 'דורש תיקון' },
                  ] as const
                ).map((cond) => {
                  const isSelected = condition === cond.value;
                  return (
                    <button
                      key={cond.value}
                      type="button"
                      onClick={() => setCondition(cond.value)}
                      className={`min-h-[56px] px-2 rounded-xl text-xs sm:text-sm font-black transition-all border-2 flex items-center justify-center text-center cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-slate-50 text-blue-900 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {cond.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SUBMIT ERROR BANNER */}
            {submitError && (
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* 4. PROMINENT SAVE & SCAN NEXT ACTION BUTTON (MIN 56PX) */}
            <button
              type="button"
              onClick={handleSubmitAndNext}
              disabled={isSubmitting || Boolean(qrWarning) || !qrCode}
              className={`w-full min-h-[64px] rounded-xl font-black text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl transition-all active:scale-[0.98] cursor-pointer ${
                !qrCode || Boolean(qrWarning)
                  ? 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed'
                  : isSubmitting
                  ? 'bg-blue-400 text-white cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-600 shadow-blue-600/25'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                  <span>רושם כלי במערכת...</span>
                </>
              ) : (
                <>
                  <span>שמור וסרוק את הכלי הבא</span>
                  <ArrowLeft className="w-6 h-6 stroke-[3]" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* DISPATCH CART FLOATING BAR (Supervisor & Admin only) */}
      {role !== 'worker' && dispatchCart.length > 0 && (
        <aside
          aria-label="סל ניפוק כלים"
          className="fixed bottom-20 left-0 right-0 z-40 px-3 pointer-events-none"
        >
          <div className="max-w-lg mx-auto pointer-events-auto bg-blue-950 text-white p-3.5 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded-xl bg-amber-400 text-blue-950 flex items-center justify-center shrink-0 shadow-md font-black">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center border border-white shadow">
                  {dispatchCart.length}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-300 uppercase tracking-wider">
                  סל ניפוק כלים ({dispatchCart.length})
                </div>
                <div className="text-xs font-bold text-white truncate">
                  {dispatchCart.map((t) => t.toolName).join(' ، ')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDispatchCart([])}
                className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-blue-200 text-xs font-bold transition-colors cursor-pointer"
                title="נקה סל"
              >
                נקה סל
              </button>

              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-blue-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-all active:scale-95 cursor-pointer"
              >
                <span>בדיקה ואישור ניפוק</span>
                <ArrowLeft className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 6. QUICK CUSTODY ACTION MODAL (Check-in, Check-out, Transfer) */}
      <AssetActionModal
        isOpen={isModalOpen}
        asset={scannedRegisteredAsset}
        warehouses={warehouses}
        onClose={() => setIsModalOpen(false)}
        onActionComplete={handleModalActionComplete}
        onAddToCart={handleAddToCart}
        isInCart={dispatchCart.some((i) => i.id === scannedRegisteredAsset?.id)}
      />

      {/* 7. BULK CHECKOUT REVIEW & SIGNATURE MODAL */}
      <BulkCheckoutModal
        isOpen={isBulkModalOpen}
        items={dispatchCart}
        onClose={() => setIsBulkModalOpen(false)}
        onRemoveItem={handleRemoveFromCart}
        onBulkCheckoutComplete={handleBulkCheckoutComplete}
      />

      {/* 8. DIGITAL TOOL PASSPORT MODAL */}
      <ToolPassportModal
        isOpen={isPassportOpen}
        asset={scannedRegisteredAsset}
        onClose={() => setIsPassportOpen(false)}
        onAssetUpdated={(updated) => {
          setScannedRegisteredAsset(updated);
          setLastActionMessage('דרכון הכלי עודכן בהצלחה');
        }}
      />

      {/* 5. UNIVERSAL BOTTOM NAVIGATION BAR (FIXED) */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {/* 1. Scanner (ACTIVE) */}
          <Link
            href="/"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <Scan className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">סורק מהיר / ניפוק</span>
          </Link>

          {/* 2. Tools Catalog */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Layers className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">קטלוג ומלאי</span>
          </Link>

          {/* 3. History */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <HistoryIcon className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">יומן תנועות</span>
          </Link>

          {/* 4. Print QR Tags */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Printer className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">הדפסת תגיות</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
