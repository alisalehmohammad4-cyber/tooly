'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSignature,
  X,
  QrCode,
  Search,
  Camera,
  Check,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import SignaturePad from '@/components/ui/SignaturePad';
import OcrScannerModal from '@/components/modules/OcrScannerModal';
import {
  getAssetDetailsByQr,
  dispatchAssetWithSignatureAction,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import type { WarehouseOption } from '../types';

export interface ResolveToolRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWarehouseId: string;
  warehouses: WarehouseOption[];
  organizationId?: string;
  onSuccess: (dispatchedAssetId: string) => Promise<void> | void;
}

export default function ResolveToolRequestModal({
  isOpen,
  onClose,
  selectedWarehouseId,
  warehouses,
  organizationId,
  onSuccess,
}: ResolveToolRequestModalProps) {
  const [dispatchTagInput, setDispatchTagInput] = useState<string>('');
  const [isSearchingAsset, setIsSearchingAsset] = useState<boolean>(false);
  const [dispatchAsset, setDispatchAsset] = useState<ScannedAssetDetails | null>(null);
  const [isTagVerified, setIsTagVerified] = useState<boolean>(false);
  const [dispatchTargetWhId, setDispatchTargetWhId] = useState<string>(() => {
    const firstOther = warehouses.find((w) => w.id && w.id !== selectedWarehouseId && w.id !== 'all');
    return firstOther ? firstOther.id : (warehouses.find((w) => w.id && w.id !== 'all')?.id || '');
  });
  const [dispatchWorkerName, setDispatchWorkerName] = useState<string>('');
  const [dispatchWorkerPhone, setDispatchWorkerPhone] = useState<string>('');
  const [dispatchSignature, setDispatchSignature] = useState<string | null>(null);
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isOcrOpen, setIsOcrOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setDispatchAsset(null);
      setDispatchTagInput('');
      setIsTagVerified(false);
      setDispatchWorkerName('');
      setDispatchWorkerPhone('');
      setDispatchSignature(null);
      setFeedback(null);
    } else {
      const firstOther = warehouses.find((w) => w.id && w.id !== selectedWarehouseId && w.id !== 'all');
      if (firstOther) {
        setDispatchTargetWhId(firstOther.id);
      }
    }
  }, [isOpen, selectedWarehouseId, warehouses]);

  if (!isOpen) return null;

  const handleSearchAsset = async (termToSearch?: string) => {
    const term = (termToSearch || dispatchTagInput).trim();
    if (!term) return;

    setIsSearchingAsset(true);
    setFeedback(null);
    try {
      const asset = await getAssetDetailsByQr(
        term,
        selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined,
        organizationId
      );
      if (asset) {
        setDispatchAsset(asset);
        setIsTagVerified(false);
      } else {
        setDispatchAsset(null);
        setFeedback({
          text: `לא נמצא כלי עבודה התואם לתג/ברקוד "${term}". ודא שהכלי רשום במערכת.`,
          type: 'error',
        });
      }
    } catch {
      setFeedback({
        text: 'שגיאה באיתור הכלי. אנא נסה שנית.',
        type: 'error',
      });
    } finally {
      setIsSearchingAsset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchAsset) {
      setFeedback({ text: 'אנא אמת כלי עבודה להוצאה', type: 'error' });
      return;
    }
    if (!isTagVerified) {
      setFeedback({ text: 'חובה לאשר פיזית את תקינות תג ה-QR על הכלי', type: 'error' });
      return;
    }
    if (!dispatchTargetWhId) {
      setFeedback({ text: 'אנא בחר אתר יעד להוצאת הכלי', type: 'error' });
      return;
    }
    if (!dispatchWorkerName.trim()) {
      setFeedback({ text: 'אנא הזן את שם מקבל הציוד', type: 'error' });
      return;
    }
    if (!dispatchSignature) {
      setFeedback({ text: 'חובה לחתום בחתימה דיגיטלית בלוח החתימה', type: 'error' });
      return;
    }

    setIsSubmittingDispatch(true);
    setFeedback(null);
    try {
      const result = await dispatchAssetWithSignatureAction({
        assetId: dispatchAsset.id,
        targetWarehouseId: dispatchTargetWhId,
        workerName: dispatchWorkerName.trim(),
        workerPhone: dispatchWorkerPhone.trim(),
        signatureData: dispatchSignature,
        isTagVerified: true,
      });

      if (result.success) {
        setFeedback({
          text: result.message || 'הציוד נופק בהצלחה לאתר עם אישור תיוג וחתימה!',
          type: 'success',
        });
        await onSuccess(dispatchAsset.id);
        setTimeout(() => {
          onClose();
          setFeedback(null);
        }, 1200);
      } else {
        alert(`שגיאה בביצוע הפעולה: ${result.error || 'נסה שוב'}`);
        setFeedback({ text: result.error || 'שגיאה בניפוק הציוד', type: 'error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'אירעה שגיאה בלתי צפויה';
      alert(`שגיאה בביצוע הפעולה: ${msg}`);
      setFeedback({ text: msg, type: 'error' });
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white border-2 border-emerald-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-emerald-900 to-teal-950 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/50 flex items-center justify-center border border-emerald-400/30">
                <FileSignature className="w-5 h-5 text-emerald-200" />
              </div>
              <div>
                <h3 className="font-black text-sm text-white">הוצאת ציוד לאתר עבודה</h3>
                <p className="text-[11px] text-emerald-200">נוהל מסירה מבוקר: אישור תיוג וחתימה דיגיטלית</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* STEP 1: Tag & Asset Verification */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                  <span>אימות תג וזיהוי כלי עבודה</span>
                </span>
                {dispatchAsset && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    כלי אותר בהצלחה
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <QrCode className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    dir="ltr"
                    value={dispatchTagInput}
                    onChange={(e) => setDispatchTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSearchAsset();
                      }
                    }}
                    placeholder="הזן תג / QR (למשל ZR-1099, ZR-282)"
                    className="w-full bg-white border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSearchAsset()}
                  disabled={isSearchingAsset || !dispatchTagInput.trim()}
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {isSearchingAsset ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>בדוק כלי</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOcrOpen(true)}
                  className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm transition-all"
                  title="סריקת כלי"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>סרוק כלי</span>
                </button>
              </div>

              {/* Display Scanned Tool Card */}
              {dispatchAsset && (
                <div className="p-3 bg-white rounded-xl border-2 border-emerald-300 shadow-xs space-y-2.5 animate-in fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[11px] font-black text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" dir="ltr">
                          {dispatchAsset.qrCode}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {dispatchAsset.brand}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-900">{dispatchAsset.toolName}</h4>
                      {dispatchAsset.modelNumber && (
                        <p className="text-xs text-slate-500 font-mono" dir="ltr">
                          דגם: {dispatchAsset.modelNumber}
                        </p>
                      )}
                    </div>
                    <div className="text-left text-[11px] text-slate-500 font-bold">
                      <div>מיקום נוכחי:</div>
                      <span className="text-slate-900">{dispatchAsset.warehouseName}</span>
                    </div>
                  </div>

                  {/* PHYSICAL TAG VERIFICATION CHECKBOX */}
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-50/90 border-2 border-amber-300 text-amber-950 cursor-pointer hover:bg-amber-100/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={isTagVerified}
                      onChange={(e) => setIsTagVerified(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs font-black">
                      ☑️ אישור תיוג: נבדק פיזית ותג ה-QR מודבק ותקין על גבי הכלי
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* STEP 2: Target Site & Recipient Details */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
                <span>אתר יעד ופרטי מקבל הציוד</span>
              </span>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  בחר אתר בנייה / מכולת יעד:
                </label>
                <select
                  value={dispatchTargetWhId}
                  onChange={(e) => setDispatchTargetWhId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:border-emerald-600 focus:outline-none"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} {wh.code ? `(${wh.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    שם מקבל הציוד בשטח: *
                  </label>
                  <input
                    type="text"
                    value={dispatchWorkerName}
                    onChange={(e) => setDispatchWorkerName(e.target.value)}
                    placeholder="לדוגמה: אחמד חטיב (מנהל עבודה)"
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    טלפון נייד:
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={dispatchWorkerPhone}
                    onChange={(e) => setDispatchWorkerPhone(e.target.value)}
                    placeholder="05X-XXXXXXX"
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-emerald-600 focus:outline-none text-right"
                  />
                </div>
              </div>
            </div>

            {/* STEP 3: Digital Signature */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                <span>חתימה דיגיטלית של מקבל הציוד</span>
              </span>

              <SignaturePad
                onSignatureChange={(sig) => setDispatchSignature(sig)}
                height={150}
                label="חתימת המקבל לאישור אחריות וקבלת הציוד:"
              />

              <p className="text-[11px] text-slate-500 font-medium pt-1">
                בחתימתו, מאשר מקבל הציוד קבלת הכלי במצב תקין ונושא באחריות המבצעית לשמירתו והחזרתו.
              </p>
            </div>

            {/* STEP 4: Finalize Action */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={
                  isSubmittingDispatch ||
                  !dispatchAsset ||
                  !isTagVerified ||
                  !dispatchWorkerName.trim() ||
                  !dispatchSignature
                }
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
              >
                {isSubmittingDispatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>רושם מסירה...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>אשר מסירה וחתום</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <OcrScannerModal
        isOpen={isOcrOpen}
        onClose={() => setIsOcrOpen(false)}
        onAssetDetected={(asset) => {
          setDispatchAsset({
            id: asset.id,
            qrCode: asset.qrCode,
            toolName: asset.toolName,
            brand: asset.brand,
            modelNumber: asset.modelNumber,
            currentWarehouseId: asset.currentWarehouseId || '',
            warehouseName: asset.warehouseName || '',
            warehouseCode: asset.warehouseCode || 'WH',
            status: asset.status,
            condition: asset.condition || 'good',
            currentAssignedWorker: null,
            version: asset.version || 1,
          });
          setDispatchTagInput(asset.qrCode);
          setIsTagVerified(false);
          setIsOcrOpen(false);
        }}
        warehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        title="סריקת כלי לאימות הוצאה (QR / OCR)"
      />
    </>
  );
}
