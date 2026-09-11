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
  ArrowRight,
  ShieldAlert,
  Loader2,
  Scan,
  UserCheck,
  History as HistoryIcon,
} from 'lucide-react';
import type { Category, Warehouse, AssetCondition } from '@/types/domain';
import { checkQrCodeExists, onboardAsset } from '@/app/actions/assets';
import AssetActionModal from '@/components/modules/AssetActionModal';
import {
  getAssetDetailsByQr,
  type ScannedAssetDetails,
} from '@/app/actions/custody';

interface QuickOnboardViewProps {
  categories: Category[];
  warehouses: Warehouse[];
}

const COMMON_BRANDS = ['DeWalt', 'Milwaukee', 'Makita', 'Bosch', 'Hilti', 'Stihl'];

export default function QuickOnboardView({
  categories,
  warehouses,
}: QuickOnboardViewProps) {
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

  // Scanner References
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);

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

  // Handle successful QR detection
  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const cleanQr = decodedText.trim();
      if (!cleanQr) return;

      // 1. Haptic feedback for field operator
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // Vibration not supported or allowed on browser
        }
      }

      // 2. Pause scanner while processing
      await stopScanner();

      // 3. Set QR state and check if already registered in system
      setQrCode(cleanQr);
      setManualQrInput(cleanQr);
      setIsVerifyingQr(true);
      setQrWarning(null);

      try {
        const existing = await getAssetDetailsByQr(cleanQr);
        if (existing) {
          // TOOL ALREADY REGISTERED -> Automatically trigger Quick Custody Modal!
          setScannedRegisteredAsset(existing);
          setIsModalOpen(true);
          setQrWarning(null);
        } else {
          // Check database directly
          const exists = await checkQrCodeExists(cleanQr);
          if (exists) {
            setQrWarning(`QR Code "${cleanQr}" is ALREADY registered in the system.`);
          } else {
            setQrWarning(null);
          }
          setScannedRegisteredAsset(null);
        }
      } catch (err) {
        console.error('Error verifying QR code:', err);
      } finally {
        setIsVerifyingQr(false);
      }
    },
    [stopScanner]
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
                    err instanceof Error ? err.message : 'Camera could not be started.';
                  setScannerError(msg);
                }
              });
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            const msg =
              err instanceof Error ? err.message : 'Failed to load scanner module.';
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
      setSubmitError('Please select a warehouse facility.');
      return;
    }
    if (!selectedCategoryId) {
      setSubmitError('Please select a tool category.');
      return;
    }
    if (!qrCode) {
      setSubmitError('Please scan or enter a tool QR code first.');
      return;
    }
    if (qrWarning) {
      setSubmitError('Cannot onboard: This QR code is already registered.');
      return;
    }
    if (!toolName.trim()) {
      setSubmitError('Tool name is required (e.g., Heavy Duty Impact Driver).');
      return;
    }
    if (!brand.trim()) {
      setSubmitError('Brand is required.');
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
      const msg = err instanceof Error ? err.message : 'Failed to onboard tool.';
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
                Field Quick Onboard
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                Tooly Operations
              </h1>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5">
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Tools Catalog"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Catalog</span>
            </Link>

            <Link
              href="/history"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Audit Ledger"
            >
              <HistoryIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>History</span>
            </Link>

            <Link
              href="/print-tags"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Print QR Tags Sheet"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>طباعة</span>
            </Link>

            {/* Session Counter Badge */}
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
              <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
              <span className="text-xs font-black text-blue-700">{sessionCount}</span>
            </div>
          </div>
        </div>

        {/* Sticky Warehouse Selection Dropdown */}
        <div className="mt-3 max-w-lg mx-auto">
          <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            Active Facility / Warehouse
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
                  No active warehouses available
                </option>
              )}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
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
                Custody Operation Recorded
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
                Successfully Bound &amp; Ready For Next
              </div>
              <div className="text-sm font-bold text-emerald-950 truncate">
                {lastEnrolledTool.name}
              </div>
              <div className="text-xs font-mono text-emerald-700 mt-0.5 font-bold">
                QR: {lastEnrolledTool.qrCode}
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
                1. Scan Asset QR Code
              </h2>
            </div>
            {qrCode && (
              <button
                type="button"
                onClick={handleReScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 border border-blue-200 active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-Scan
              </button>
            )}
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
                      Scanned Barcode
                    </div>
                    <div className="text-lg font-mono font-black text-blue-950 truncate">
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
                        Registered Tool Detected
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

                  <div className="pt-2 border-t border-blue-200 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="flex-1 min-h-[50px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 stroke-[2.5]" />
                      <span>Manage Custody (صرف / إرجاع / نقل)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleReScan}
                      className="min-h-[50px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-900 text-xs font-bold border border-slate-300 active:scale-95 transition-all cursor-pointer"
                    >
                      Next
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
                      QR Already Exists
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
                      Scan Another QR Code
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
                      Camera Not Accessible
                    </div>
                    <p className="text-xs text-slate-600 max-w-xs">
                      {scannerError}. You can enter the QR code manually below.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualInput(true);
                        setScannerError(null);
                        setScannerActive(true);
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 flex items-center gap-2 hover:bg-blue-100"
                    >
                      <RotateCcw className="w-4 h-4" /> Retry Camera
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
                        placeholder="Enter QR/Barcode (e.g. TL-99281)"
                        className="flex-1 min-h-[56px] bg-white text-blue-950 font-mono font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                      />
                      <button
                        type="submit"
                        className="min-h-[56px] px-5 rounded-xl bg-blue-600 text-white font-black text-sm uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        Set
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-800 underline py-1"
                  >
                    Can&apos;t scan? Enter barcode manually
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
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-blue-950">
                Tool Registered &bull; {scannedRegisteredAsset.toolName}
              </h2>
              <p className="text-xs text-blue-800 max-w-xs mx-auto mt-1">
                Currently <strong>{scannedRegisteredAsset.status}</strong> at{' '}
                <strong>{scannedRegisteredAsset.warehouseName}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <UserCheck className="w-5 h-5 stroke-[2.5]" />
              <span>Open Custody Actions (صرف / إرجاع / نقل)</span>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 space-y-5">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                2. Tool Specifications
              </h2>
            </div>

            {/* SINGLE-TAP CATEGORY SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                Category
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
                Tool Name <span className="text-blue-600">*</span>
              </label>
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="e.g. Cordless Rotary Hammer 18V"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* BRAND SELECTION & RAPID PRESETS */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  Manufacturer / Brand <span className="text-blue-600">*</span>
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
                placeholder="Brand name"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* MODEL NUMBER (OPTIONAL) */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                Model / Part Number <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g. DCH273B or 2804-20"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* CONDITION SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2">
                Initial Condition
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'excellent', label: 'Excellent' },
                    { value: 'good', label: 'Good' },
                    { value: 'needs_repair', label: 'Repair Needed' },
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
                  <span>Enrolling Tool...</span>
                </>
              ) : (
                <>
                  <span>Save &amp; Scan Next Tool</span>
                  <ArrowRight className="w-6 h-6 stroke-[3]" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* 6. QUICK CUSTODY ACTION MODAL (Check-in, Check-out, Transfer) */}
      <AssetActionModal
        isOpen={isModalOpen}
        asset={scannedRegisteredAsset}
        warehouses={warehouses}
        onClose={() => setIsModalOpen(false)}
        onActionComplete={handleModalActionComplete}
      />

      {/* 5. UNIVERSAL BOTTOM NAVIGATION BAR (FIXED) */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {/* 1. Scanner (ACTIVE) */}
          <Link
            href="/"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <Scan className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">Scanner</span>
          </Link>

          {/* 2. Tools Catalog */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Layers className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Catalog</span>
          </Link>

          {/* 3. History */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <HistoryIcon className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">History</span>
          </Link>

          {/* 4. Print QR Tags */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Printer className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Print Tags</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
