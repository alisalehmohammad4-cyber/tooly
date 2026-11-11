'use client';

import React, { useState } from 'react';
import { Zap, X, AlertCircle, Loader2, Search, Check } from 'lucide-react';
import { getAssetDetailsByQr, checkoutToWorkerAction, type ScannedAssetDetails } from '@/app/actions/custody';
import { isAssetAvailable } from '@/lib/assets/status';

interface QuickCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWarehouseId: string;
  organizationId?: string;
  onSuccess: (checkedOutAsset: {
    id: string;
    toolName: string;
    brand: string;
    modelNumber: string | null;
    qrCode: string;
    workerName: string;
    workerPhone: string | null;
    expectedReturnDate: string | null;
    checkoutNotes: string | null;
  }) => void;
}

export function QuickCheckoutModal({
  isOpen,
  onClose,
  selectedWarehouseId,
  organizationId,
  onSuccess,
}: QuickCheckoutModalProps) {
  const [checkoutAssetInput, setCheckoutAssetInput] = useState('');
  const [checkoutAsset, setCheckoutAsset] = useState<ScannedAssetDetails | null>(null);
  const [isSearchingCheckoutAsset, setIsSearchingCheckoutAsset] = useState(false);
  const [checkoutWorkerName, setCheckoutWorkerName] = useState('');
  const [checkoutWorkerPhone, setCheckoutWorkerPhone] = useState('');
  const [checkoutReturnDate, setCheckoutReturnDate] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [checkoutFeedback, setCheckoutFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  if (!isOpen) return null;

  // Search tool by Tag/QR for quick worker checkout
  const handleSearchCheckoutAsset = async (overrideTerm?: string) => {
    const term = (overrideTerm !== undefined ? overrideTerm : checkoutAssetInput).trim();
    if (!term) return;

    setIsSearchingCheckoutAsset(true);
    setCheckoutFeedback(null);
    try {
      const asset = await getAssetDetailsByQr(
        term,
        selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined,
        organizationId
      );
      if (asset) {
        if (!isAssetAvailable(asset.status)) {
          setCheckoutFeedback({
            text: `הכלי שנמצא אינו זמין לניפוק (סטטוס נוכחי: ${asset.status})`,
            type: 'error',
          });
          setCheckoutAsset(null);
        } else {
          setCheckoutAsset(asset);
          setCheckoutFeedback({
            text: `כלי אותר: ${asset.toolName} (${asset.brand})`,
            type: 'success',
          });
        }
      } else {
        setCheckoutAsset(null);
        setCheckoutFeedback({
          text: `לא נמצא כלי עבודה התואם לתג/ברקוד "${term}". ודא שהכלי רשום במערכת.`,
          type: 'error',
        });
      }
    } catch {
      setCheckoutFeedback({
        text: 'שגיאה באיתור הכלי במאגר.',
        type: 'error',
      });
    } finally {
      setIsSearchingCheckoutAsset(false);
    }
  };

  // Submit quick checkout to worker
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutAsset) {
      alert('אנא אתר ובחר כלי עבודה זמין לניפוק');
      return;
    }
    if (!checkoutWorkerName.trim()) {
      alert('אנא הזן את שם מקבל הציוד');
      return;
    }

    setIsSubmittingCheckout(true);
    setCheckoutFeedback(null);
    try {
      const res = await checkoutToWorkerAction({
        assetId: checkoutAsset.id,
        workerName: checkoutWorkerName.trim(),
        workerPhone: checkoutWorkerPhone.trim() || undefined,
        expectedReturnDate: checkoutReturnDate ? new Date(checkoutReturnDate).toISOString() : undefined,
        notes: checkoutNotes.trim() || undefined,
      });

      if (!res.success) {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'נסה שוב'}`);
        setCheckoutFeedback({ text: res.error || 'שגיאה בניפוק כלי עבודה', type: 'error' });
        return;
      }

      onSuccess({
        id: checkoutAsset.id,
        toolName: checkoutAsset.toolName,
        brand: checkoutAsset.brand,
        modelNumber: checkoutAsset.modelNumber || null,
        qrCode: checkoutAsset.qrCode || '',
        workerName: checkoutWorkerName.trim(),
        workerPhone: checkoutWorkerPhone.trim() || null,
        expectedReturnDate: checkoutReturnDate || null,
        checkoutNotes: checkoutNotes.trim() || null,
      });

      onClose();
      setCheckoutAsset(null);
      setCheckoutAssetInput('');
      setCheckoutWorkerName('');
      setCheckoutWorkerPhone('');
      setCheckoutReturnDate('');
      setCheckoutNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת בניפוק כלי עבודה';
      alert(msg);
      setCheckoutFeedback({ text: msg, type: 'error' });
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-blue-300 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-950 text-white flex items-center justify-between shrink-0 border-b border-blue-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/30 flex items-center justify-center border border-blue-400/30">
              <Zap className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <span>ניפוק כלי עבודה לעובד</span>
                <span className="text-[10px] font-bold bg-blue-400/20 text-blue-200 px-2 py-0.5 rounded-full border border-blue-300/30">
                  הנפקה מהירה
                </span>
              </h3>
              <p className="text-xs text-blue-200">
                שיוך כלי עבודה זמין לעובד בשטח ועדכון סטטוס השאלה
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCheckoutSubmit} className="p-5 overflow-y-auto space-y-4 text-right flex-1">
          {checkoutFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
                checkoutFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{checkoutFeedback.text}</span>
            </div>
          )}

          {/* Step 1: Find Asset */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              1. איתור כלי עבודה (ברקוד / תג QR / שם כלי) <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={checkoutAssetInput}
                  onChange={(e) => setCheckoutAssetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSearchCheckoutAsset();
                    }
                  }}
                  placeholder="הקלד ברקוד או תג כלי..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                />
                {checkoutAssetInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutAssetInput('');
                      setCheckoutAsset(null);
                    }}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={isSearchingCheckoutAsset || !checkoutAssetInput.trim()}
                onClick={() => void handleSearchCheckoutAsset()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                {isSearchingCheckoutAsset ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>חפש</span>
              </button>
            </div>
          </div>

          {/* Asset Preview Card */}
          {checkoutAsset && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between">
              <div>
                <div className="font-bold text-xs text-slate-900">
                  {checkoutAsset.toolName} - {checkoutAsset.brand} {checkoutAsset.modelNumber || ''}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  תג: {checkoutAsset.qrCode}
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                זמין לניפוק
              </span>
            </div>
          )}

          {/* Step 2: Worker Info */}
          <div className="space-y-3 pt-1 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 block">
              2. פרטי מקבל הציוד (עובד)
            </label>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                שם עובד <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={checkoutWorkerName}
                onChange={(e) => setCheckoutWorkerName(e.target.value)}
                placeholder="לדוגמה: ישראל ישראלי"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  טלפון עובד
                </label>
                <input
                  type="tel"
                  value={checkoutWorkerPhone}
                  onChange={(e) => setCheckoutWorkerPhone(e.target.value)}
                  placeholder="050-0000000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  תאריך החזרה צפוי
                </label>
                <input
                  type="date"
                  value={checkoutReturnDate}
                  onChange={(e) => setCheckoutReturnDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                הערות ניפוק
              </label>
              <input
                type="text"
                value={checkoutNotes}
                onChange={(e) => setCheckoutNotes(e.target.value)}
                placeholder="הערה אופציונלית..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmittingCheckout || !checkoutAsset || !checkoutWorkerName.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              {isSubmittingCheckout ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>מבצע ניפוק...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>אשר ניפוק לעובד</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
