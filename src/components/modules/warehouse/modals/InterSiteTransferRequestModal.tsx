'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, X, Check, AlertTriangle, Loader2, Search, PackageOpen } from 'lucide-react';
import { createTransferRequestAction, getAvailableAssetsForTransferAction } from '@/app/actions/transfers';
import { AvailableTransferAssetItem } from '../types';

interface InterSiteTransferRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string; code?: string | null }[];
  currentWarehouseId: string;
  onSuccess: () => Promise<void> | void;
}

export function InterSiteTransferRequestModal({
  isOpen,
  onClose,
  warehouses,
  currentWarehouseId,
  onSuccess,
}: InterSiteTransferRequestModalProps) {
  const [transferRequestTargetWhId, setTransferRequestTargetWhId] = useState<string>(
    warehouses.find((w) => w.id !== 'all' && w.id !== currentWarehouseId)?.id || (warehouses[0]?.id !== 'all' ? warehouses[0]?.id : '')
  );
  const [selectedAssetToTransfer, setSelectedAssetToTransfer] = useState<AvailableTransferAssetItem | null>(null);
  const [transferRequestReason, setTransferRequestReason] = useState('');
  const [isSubmittingTransferRequest, setIsSubmittingTransferRequest] = useState(false);
  const [transferRequestFeedback, setTransferRequestFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [availableAssets, setAvailableAssets] = useState<AvailableTransferAssetItem[]>([]);
  const [isLoadingAvailableAssets, setIsLoadingAvailableAssets] = useState(false);

  // Load available assets from all warehouses except the target
  const loadAvailableAssets = useCallback(async (targetWhId: string) => {
    setIsLoadingAvailableAssets(true);
    try {
      const assets = await getAvailableAssetsForTransferAction(targetWhId);
      setAvailableAssets(assets);
    } catch (err) {
      console.warn('Error loading available assets for transfer:', err);
    } finally {
      setIsLoadingAvailableAssets(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && transferRequestTargetWhId) {
      void loadAvailableAssets(transferRequestTargetWhId);
    }
  }, [isOpen, transferRequestTargetWhId, loadAvailableAssets]);

  if (!isOpen) return null;

  const handleSubmitTransferRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetToTransfer) {
      setTransferRequestFeedback({ text: 'אנא בחר כלי עבודה להעברה מהרשימה', type: 'error' });
      return;
    }
    if (!transferRequestTargetWhId) {
      setTransferRequestFeedback({ text: 'אנא בחר מחסן יעד', type: 'error' });
      return;
    }
    setIsSubmittingTransferRequest(true);
    setTransferRequestFeedback(null);
    try {
      const res = await createTransferRequestAction({
        assetId: selectedAssetToTransfer.id,
        sourceWarehouseId: selectedAssetToTransfer.currentWarehouseId,
        targetWarehouseId: transferRequestTargetWhId,
        reason: transferRequestReason,
      });
      if (res.success) {
        setTransferRequestFeedback({
          text: 'בקשת ההעברה נשלחה בהצלחה לאישור אחראי תפעול ראשי!',
          type: 'success',
        });
        setSelectedAssetToTransfer(null);
        setTransferRequestReason('');
        await onSuccess();
        setTimeout(() => {
          onClose();
          setTransferRequestFeedback(null);
        }, 2000);
      } else {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'נסה שוב'}`);
        setTransferRequestFeedback({
          text: res.error || 'שגיאה בהגשת בקשת העברה',
          type: 'error',
        });
      }
    } catch (err) {
      setTransferRequestFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsSubmittingTransferRequest(false);
    }
  };

  const filteredAssets = availableAssets.filter((a) => {
    if (!assetSearchQuery.trim()) return true;
    const q = assetSearchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.brand.toLowerCase().includes(q) ||
      (a.modelNumber && a.modelNumber.toLowerCase().includes(q)) ||
      a.qrCode.toLowerCase().includes(q) ||
      a.currentWarehouseName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
              <ArrowLeftRight className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">בקשת העברת ציוד בין אתרים</h3>
              <p className="text-[11px] text-blue-200">הגשת בקשה מנומקת לאישור אחראי תפעול ראשי</p>
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

        <form onSubmit={handleSubmitTransferRequest} className="p-5 space-y-4 overflow-y-auto flex-1">
          {transferRequestFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                transferRequestFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {transferRequestFeedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{transferRequestFeedback.text}</span>
            </div>
          )}

          {/* Target Warehouse Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              מתקן / מחסן יעד לקליטה <span className="text-blue-600">*</span>:
            </label>
            <select
              value={transferRequestTargetWhId}
              onChange={(e) => {
                setTransferRequestTargetWhId(e.target.value);
                setSelectedAssetToTransfer(null);
              }}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-blue-600 focus:outline-none"
            >
              {warehouses
                .filter((w) => w.id !== 'all')
                .map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} {wh.code ? `(${wh.code})` : ''}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              המחסן שאליו יועבר הכלי לאחר אישור מנהל התפעול
            </p>
          </div>

          {/* Selected Asset or Asset Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              בחר כלי עבודה ממתקן אחר <span className="text-blue-600">*</span>:
            </label>

            {selectedAssetToTransfer ? (
              <div className="p-3.5 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-200 text-blue-900">
                      {selectedAssetToTransfer.currentWarehouseName}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">
                      {selectedAssetToTransfer.qrCode}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-blue-950 mt-1">
                    {selectedAssetToTransfer.name}
                  </h4>
                  <p className="text-xs text-slate-600">
                    {selectedAssetToTransfer.brand} {selectedAssetToTransfer.modelNumber ? `• ${selectedAssetToTransfer.modelNumber}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAssetToTransfer(null)}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 underline shrink-0 cursor-pointer"
                >
                  החלף כלי
                </button>
              </div>
            ) : (
              <div className="space-y-2 border border-slate-200 rounded-2xl p-3 bg-slate-50/50">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    placeholder="חפש כלי לפי שם, דגם, יצרן, מחסן..."
                    className="w-full bg-white border border-slate-300 rounded-xl pr-9 pl-3.5 py-2 text-xs text-slate-900 font-medium focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-slate-100 rounded-xl bg-white border border-slate-200">
                  {isLoadingAvailableAssets ? (
                    <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>טוען כלים זמינים מכלל המחסנים...</span>
                    </div>
                  ) : filteredAssets.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                      <PackageOpen className="w-6 h-6 mx-auto text-slate-300" />
                      <p>לא נמצאו כלים זמינים במחסנים אחרים</p>
                    </div>
                  ) : (
                    filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        onClick={() => setSelectedAssetToTransfer(asset)}
                        className="p-2.5 flex items-center justify-between hover:bg-blue-50/80 cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                              {asset.currentWarehouseName}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                              {asset.qrCode}
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-900 mt-0.5">
                            {asset.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {asset.brand} {asset.modelNumber ? `• ${asset.modelNumber}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                        >
                          בחר
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              סיבת הבקשה / צורך תפעולי באתר <span className="text-blue-600">*</span>:
            </label>
            <textarea
              rows={3}
              required
              value={transferRequestReason}
              onChange={(e) => setTransferRequestReason(e.target.value)}
              placeholder="לדוגמה: מחסור בפטישונים באתר חגית עקב תגבור צוות יציקות..."
              className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-blue-600 focus:outline-none resize-none"
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
              disabled={isSubmittingTransferRequest || !selectedAssetToTransfer}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              {isSubmittingTransferRequest ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>שולח בקשה...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>שלח בקשה לאישור מנהל</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
