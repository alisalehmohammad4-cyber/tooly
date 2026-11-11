'use client';

import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Building2,
  Sparkles,
} from 'lucide-react';
import { returnFromMaintenanceAction } from '@/app/actions/maintenance';
import type { MaintenanceAssetItem, WarehouseOption } from '../types';

export interface RepairReturnModalProps {
  asset: MaintenanceAssetItem | null;
  isOpen?: boolean;
  onClose: () => void;
  warehouses: WarehouseOption[];
  defaultWarehouseId?: string;
  onSuccess: (assetId: string) => Promise<void> | void;
}

export default function RepairReturnModal({
  asset,
  isOpen = true,
  onClose,
  warehouses,
  defaultWarehouseId,
  onSuccess,
}: RepairReturnModalProps) {
  const [receivingWhId, setReceivingWhId] = useState<string>('');
  const [condition, setCondition] = useState<'good' | 'excellent'>('good');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (asset && isOpen) {
      const def =
        asset.currentWarehouseId && asset.currentWarehouseId !== 'all'
          ? asset.currentWarehouseId
          : defaultWarehouseId && defaultWarehouseId !== 'all'
          ? defaultWarehouseId
          : (warehouses.find((w) => w.id !== 'all')?.id || '');
      setReceivingWhId(def);
      setCondition('good');
      setNotes('');
      setFeedback(null);
    }
  }, [asset, isOpen, defaultWarehouseId, warehouses]);

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingWhId) {
      setFeedback({ text: 'אנא בחר מחסן לקליטת הכלי מהתיקון', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await returnFromMaintenanceAction({
        assetId: asset.assetId,
        receivingWarehouseId: receivingWhId,
        condition,
        notes: notes.trim() || undefined,
      });
      if (res.success) {
        setFeedback({ text: res.message || 'הכלי נקלט בהצלחה מתיקון והוחזר למלאי!', type: 'success' });
        await onSuccess(asset.assetId);
        setTimeout(() => {
          onClose();
          setFeedback(null);
          setNotes('');
        }, 1200);
      } else {
        alert(`שגיאה בקליטת כלי מתיקון: ${res.error || 'נסה שוב'}`);
        setFeedback({ text: res.error || 'שגיאה בקליטת כלי מתיקון', type: 'error' });
      }
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'שגיאת תקשורת', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full border-2 border-emerald-400 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                קליטה מתיקון והחזרה למלאי
              </h3>
              <p className="text-xs text-slate-500">
                סגירת תיק אחזקה, עדכון מצב טכני והשבה לסטטוס זמין (Available)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Asset details card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-300" dir="ltr">
              {asset.qrCode}
            </span>
            <span className="text-xs font-black text-slate-900">
              {asset.toolName}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {asset.brand} {asset.modelNumber ? `• דגם: ${asset.modelNumber}` : ''}
          </div>
          <div className="text-xs text-amber-900 bg-amber-50/70 p-2 rounded-lg mt-2 border border-amber-200">
            <strong>תקלה שדווחה:</strong> {asset.faultDescription}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              מחסן / אתר קולט (יעד ההחזרה) <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={receivingWhId}
              onChange={(e) => setReceivingWhId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
            >
              <option value="" disabled>
                בחר מחסן קולט...
              </option>
              {warehouses
                .filter((w) => w.id !== 'all')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              מצב טכני של הכלי לאחר תיקון
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCondition('good')}
                className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                  condition === 'good'
                    ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950 font-black'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>תקין ומוכן לעבודה</span>
                  <CheckCircle2 className={`w-4 h-4 ${condition === 'good' ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">עבר בדיקה וחזר למלאי</span>
              </button>

              <button
                type="button"
                onClick={() => setCondition('excellent')}
                className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                  condition === 'excellent'
                    ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950 font-black'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>כמו חדש</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  </span>
                  <CheckCircle2 className={`w-4 h-4 ${condition === 'excellent' ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">שופץ או הוחלף מכלול מלא</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              הערות טכנאי / פרטי תיקון (אופציונלי)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="למשל: הוחלפו פחמים, נבדק תחת עומס, כבל חשמל תוקן..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
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
              disabled={isSubmitting || !receivingWhId}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>קולט כלי מתיקון...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>אשר קליטה והחזר למלאי</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
