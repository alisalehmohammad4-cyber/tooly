'use client';

import React, { useState } from 'react';
import { ClipboardCheck, X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { reconcileStockAction } from '@/app/actions/warehouses';

interface StockReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: { id: string; name: string; code?: string | null };
  availableCount: number;
  checkedOutCount: number;
  quarantinedCount: number;
  verifiedAssetIds: string[];
  onSuccess: () => Promise<void> | void;
}

export function StockReconciliationModal({
  isOpen,
  onClose,
  warehouse,
  availableCount,
  checkedOutCount,
  quarantinedCount,
  verifiedAssetIds,
  onSuccess,
}: StockReconciliationModalProps) {
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  if (!isOpen) return null;

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReconciling(true);
    setReconcileFeedback(null);
    try {
      const res = await reconcileStockAction({
        warehouseId: warehouse.id,
        auditedBy: 'אחראי תפעול ראשי',
        verifiedAssetIds,
        discrepancyNotes,
      });
      if (res.success) {
        setReconcileFeedback({
          text: res.message || 'ספירת המלאי אומתה בהצלחה',
          type: 'success',
        });
        await onSuccess();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        alert(res.error || 'שגיאה באימות ספירת מלאי');
        setReconcileFeedback({
          text: res.error || 'שגיאה באימות ספירת מלאי',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה באימות ספירת מלאי';
      alert(msg);
      setReconcileFeedback({ text: msg, type: 'error' });
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-indigo-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/50 flex items-center justify-center border border-emerald-400/30">
              <ClipboardCheck className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">ספירת מלאי מבוקרת וסנכרון מתקן</h3>
              <p className="text-[11px] text-indigo-200">אימות פיזי של הציוד מול ספר המחסן</p>
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

        <form onSubmit={handleReconcileSubmit} className="p-5 space-y-4">
          {reconcileFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                reconcileFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {reconcileFeedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{reconcileFeedback.text}</span>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-1">
            <span className="text-[11px] font-bold text-indigo-900 block">מתקן בביקורת:</span>
            <span className="text-sm font-black text-indigo-950 block">{warehouse.name}</span>
            <div className="flex items-center gap-3 text-xs text-slate-600 pt-1">
              <span>זמינים: <strong>{availableCount}</strong></span>
              <span>בשטח: <strong>{checkedOutCount}</strong></span>
              <span>השבתה: <strong>{quarantinedCount}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              הערות ספירה / ממצאי בדיקה פיזית:
            </label>
            <textarea
              rows={3}
              value={discrepancyNotes}
              onChange={(e) => setDiscrepancyNotes(e.target.value)}
              placeholder="לדוגמה: כל הכלים במדפי המחסן אומתו פיזית, ללא פערים או חוסרים..."
              className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-indigo-600 focus:outline-none resize-none"
            />
          </div>

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
              disabled={isReconciling}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              {isReconciling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>מאמת ספירה...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>אשר ספירת מלאי רשמית</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
