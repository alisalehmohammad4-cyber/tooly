'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  X,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react';
import { createSiteToolRequestAction } from '@/app/actions/toolRequests';

export interface SiteToolRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestingWarehouseId?: string;
  onSuccess: () => Promise<void> | void;
}

export default function SiteToolRequestModal({
  isOpen,
  onClose,
  requestingWarehouseId,
  onSuccess,
}: SiteToolRequestModalProps) {
  const [requestToolDesc, setRequestToolDesc] = useState<string>('');
  const [requestQuantity, setRequestQuantity] = useState<number>(1);
  const [requestUrgency, setRequestUrgency] = useState<'NORMAL' | 'URGENT' | 'CRITICAL'>('NORMAL');
  const [requestReason, setRequestReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setRequestToolDesc('');
      setRequestQuantity(1);
      setRequestUrgency('NORMAL');
      setRequestReason('');
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestToolDesc.trim()) {
      setFeedback({ text: 'יש לציין תיאור של כלי העבודה הנדרש', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await createSiteToolRequestAction({
        toolDescription: requestToolDesc,
        quantity: requestQuantity,
        urgency: requestUrgency,
        reason: requestReason,
        requestingWarehouseId,
      });

      if (res.success) {
        setFeedback({ text: res.message || 'הבקשה נשלחה בהצלחה!', type: 'success' });
        await onSuccess();
        setTimeout(() => {
          onClose();
          setFeedback(null);
        }, 1200);
      } else {
        alert(res.error || 'שגיאה בהגשת הבקשה');
        setFeedback({ text: res.error || 'שגיאה בהגשת הבקשה', type: 'error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת';
      alert(msg);
      setFeedback({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
              <Send className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">בקשת ציוד לאתר / מכולה</h3>
              <p className="text-[11px] text-blue-200">הגשת דרישה מבצעית ישירה לאחראי תפעול ראשי</p>
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

          {/* Tool Description & Quick Chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              תיאור כלי העבודה או הציוד הנדרש <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={requestToolDesc}
              onChange={(e) => setRequestToolDesc(e.target.value)}
              placeholder="למשל: פטיש חציבה כבד SDS-Max, משחזת 9 אינץ'..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                'פטיש חציבה SDS-Max',
                'משחזת זוית 9 אינץ\'',
                'רתכת CO2 ניידת',
                'גנרטור מושתק 5.5KVA',
                'מהדק אדמה (ג\'מפינג)',
                'שואב אבק תעשייתי',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setRequestToolDesc(chip)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition-all cursor-pointer"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              כמות נדרשת
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRequestQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={requestQuantity}
                onChange={(e) => setRequestQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 text-center bg-slate-50 border border-slate-300 rounded-xl py-1.5 text-sm font-black text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setRequestQuantity((q) => q + 1)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Urgency Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              רמת דחיפות
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRequestUrgency('NORMAL')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  requestUrgency === 'NORMAL'
                    ? 'bg-blue-50 border-blue-400 text-blue-950 font-black ring-2 ring-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🟢 רגיל</span>
                <span className="text-[10px] text-slate-500 font-normal">אספקה שוטפת</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestUrgency('URGENT')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  requestUrgency === 'URGENT'
                    ? 'bg-amber-50 border-amber-400 text-amber-950 font-black ring-2 ring-amber-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🟡 דחוף</span>
                <span className="text-[10px] text-slate-500 font-normal">למחר בבוקר</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestUrgency('CRITICAL')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  requestUrgency === 'CRITICAL'
                    ? 'bg-rose-50 border-rose-400 text-rose-950 font-black ring-2 ring-rose-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🔴 קריטי</span>
                <span className="text-[10px] text-slate-500 font-normal">עצירת עבודה</span>
              </button>
            </div>
          </div>

          {/* Operational Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              נימוק / סיבה מבצעית (אופציונלי)
            </label>
            <textarea
              rows={2}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="למשל: נדרש ליציקת בטון דחופה מחר, הכלי הקיים הושבת..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Submit Buttons */}
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
              disabled={isSubmitting || !requestToolDesc.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>שולח בקשה...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>שלח בקשת ציוד לאישור</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
