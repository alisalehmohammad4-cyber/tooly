'use client';

import React, { useState } from 'react';
import { ArrowLeftRight, X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { getAssetDetailsByQr, transferAssetAction } from '@/app/actions/custody';

interface InterDepotTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string; code?: string | null }[];
  selectedWarehouseId: string;
  onSuccess: () => Promise<void> | void;
}

export function InterDepotTransferModal({
  isOpen,
  onClose,
  warehouses,
  selectedWarehouseId,
  onSuccess,
}: InterDepotTransferModalProps) {
  const [transferQrCode, setTransferQrCode] = useState('');
  const [transferTargetWhId, setTransferTargetWhId] = useState(
    warehouses?.find((w) => w.id !== selectedWarehouseId)?.id || ''
  );
  const [transferNotes, setTransferNotes] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  if (!isOpen) return null;

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferQrCode.trim()) return;
    setIsTransferring(true);
    setTransferFeedback(null);
    try {
      const asset = await getAssetDetailsByQr(transferQrCode.trim());
      if (!asset) {
        setTransferFeedback({
          text: 'כלי העבודה לא נמצא במערכת לפי ברקוד/QR זה',
          type: 'error',
        });
        setIsTransferring(false);
        return;
      }
      const res = await transferAssetAction({
        assetId: asset.id,
        targetWarehouseId: transferTargetWhId,
        notes: transferNotes || `העברה יזומה ע"י אחראי תפעול ראשי`,
        isDirectTransfer: true,
      });
      if (res.success) {
        setTransferFeedback({
          text: res.message || 'הכלי הועבר בהצלחה למחסן היעד',
          type: 'success',
        });
        setTransferQrCode('');
        setTransferNotes('');
        await onSuccess();
      } else {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'נסה שוב'}`);
        setTransferFeedback({
          text: res.error || 'שגיאה בהעברת הכלי',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      setTransferFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-indigo-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/50 flex items-center justify-center border border-indigo-400/30">
              <ArrowLeftRight className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">ניוד ציוד בין מחסנים ואתרים</h3>
              <p className="text-[11px] text-indigo-200">סמכות תפעולית: העברת בעלות ומיקום כלי</p>
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

        <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
          {transferFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                transferFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {transferFeedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{transferFeedback.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ברקוד / QR של הכלי להעברה <span className="text-indigo-600">*</span>:
            </label>
            <input
              type="text"
              required
              value={transferQrCode}
              onChange={(e) => setTransferQrCode(e.target.value)}
              placeholder="לדוגמה: TOOL-DEW-01 או סריקת ברקוד"
              dir="ltr"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              מתקן / מחסן יעד <span className="text-indigo-600">*</span>:
            </label>
            <select
              value={transferTargetWhId}
              onChange={(e) => setTransferTargetWhId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-indigo-600 focus:outline-none"
            >
              {warehouses
                ?.filter((w) => w.id !== selectedWarehouseId)
                .map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} {wh.code ? `(${wh.code})` : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              סיבת העברה / הערות תפעול:
            </label>
            <textarea
              rows={2}
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="לדוגמה: תגבור ציוד לפרויקט גשרים, החלפת כלי תקול באתר..."
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
              disabled={isTransferring}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              {isTransferring ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>מעביר כלי...</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>בצע ניוד למתקן היעד</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
