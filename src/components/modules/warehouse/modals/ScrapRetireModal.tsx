'use client';

import React, { useState, useEffect } from 'react';
import {
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { scrapAndRetireAssetAction } from '@/app/actions/maintenance';
import type { MaintenanceAssetItem } from '../types';

export interface ScrapRetireModalProps {
  asset: MaintenanceAssetItem | null;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: (assetId: string) => Promise<void> | void;
}

export default function ScrapRetireModal({
  asset,
  isOpen = true,
  onClose,
  onSuccess,
}: ScrapRetireModalProps) {
  const [retireReason, setRetireReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!asset || !isOpen) {
      setRetireReason('');
      setFeedback(null);
    }
  }, [asset, isOpen]);

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retireReason.trim()) {
      setFeedback({ text: 'חובה לציין סיבת גריטה והשבתה', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await scrapAndRetireAssetAction({
        assetId: asset.assetId,
        reason: retireReason.trim(),
      });
      if (res.success) {
        setFeedback({ text: res.message || 'הכלי נגרט והושבת לצמיתות מהמערכת', type: 'success' });
        await onSuccess(asset.assetId);
        setTimeout(() => {
          onClose();
          setFeedback(null);
          setRetireReason('');
        }, 1200);
      } else {
        alert(`שגיאה בהשבתת הכלי: ${res.error || 'נסה שוב'}`);
        setFeedback({ text: res.error || 'שגיאה בהשבתת הכלי', type: 'error' });
      }
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'שגיאת תקשורת', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full border-2 border-rose-400 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                גריטת כלי והשבתה לצמיתות
              </h3>
              <p className="text-xs text-slate-500">
                הוצאה סופית של הכלי מצי הכלים הפעיל של הארגון
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

        {/* Warning callout */}
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-1.5">
          <div className="font-black text-rose-950 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>שים לב: השבתה בלתי הפיכה</span>
          </div>
          <p className="text-rose-900 text-[11px] leading-relaxed">
            גריטת הכלי תסיר אותו ממצבת הכלים הזמינים להשאלה, תעדכן את יומן המשמורת (Custody Ledger) בפעולת <code>DECOMMISSION</code> ותשמור את היסטוריית הכלי למטרות ביקורת.
          </p>
        </div>

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
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              סיבת גריטה והשבתה מנומקת <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              placeholder="פרט את סיבת הגריטה (למשל: מנוע שרוף ושלדה סדוקה, עלות תיקון עולה על 85% מעלות כלי חדש)..."
              className="w-full bg-slate-50 border border-rose-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-rose-600"
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
              disabled={isSubmitting || !retireReason.trim()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>משבית כלי...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  <span>אשר גריטה והשבתה לצמיתות</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
