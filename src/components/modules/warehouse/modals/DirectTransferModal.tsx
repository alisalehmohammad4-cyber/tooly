'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  X,
  Search,
  Camera,
  Check,
  AlertTriangle,
  Building2,
  Loader2,
} from 'lucide-react';
import OcrScannerModal from '@/components/modules/OcrScannerModal';
import {
  directStorekeeperTransferAction,
  getLocalAvailableAssetsForTransferAction,
  type AvailableTransferAssetItem,
} from '@/app/actions/transfers';
import type { WarehouseOption } from '../types';

export interface DirectTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWarehouseId: string;
  sourceWarehouseName?: string;
  warehouses: WarehouseOption[];
  onSuccess: (transferredAssetId: string, targetWhId: string) => Promise<void> | void;
}

export default function DirectTransferModal({
  isOpen,
  onClose,
  selectedWarehouseId,
  sourceWarehouseName,
  warehouses,
  onSuccess,
}: DirectTransferModalProps) {
  const [selectedDirectAsset, setSelectedDirectAsset] = useState<AvailableTransferAssetItem | null>(null);
  const [directTargetWarehouseId, setDirectTargetWarehouseId] = useState<string>('');
  const [transporterNotes, setTransporterNotes] = useState<string>('');
  const [directSearchQuery, setDirectSearchQuery] = useState<string>('');
  const [localAvailableAssets, setLocalAvailableAssets] = useState<AvailableTransferAssetItem[]>([]);
  const [isLoadingLocalAssets, setIsLoadingLocalAssets] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isOcrOpen, setIsOcrOpen] = useState<boolean>(false);

  const loadLocalAssets = useCallback(async (whId: string) => {
    setIsLoadingLocalAssets(true);
    try {
      const list = await getLocalAvailableAssetsForTransferAction(whId);
      setLocalAvailableAssets(list);
    } catch (err) {
      console.warn('Error loading local available assets:', err);
    } finally {
      setIsLoadingLocalAssets(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadLocalAssets(selectedWarehouseId);
      const validOther = warehouses.find((w) => w.id && w.id !== 'all' && w.id !== selectedWarehouseId);
      if (validOther && (!directTargetWarehouseId || directTargetWarehouseId === selectedWarehouseId)) {
        setDirectTargetWarehouseId(validOther.id);
      }
    } else {
      setSelectedDirectAsset(null);
      setTransporterNotes('');
      setDirectSearchQuery('');
      setFeedback(null);
    }
  }, [isOpen, selectedWarehouseId, loadLocalAssets, warehouses, directTargetWarehouseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirectAsset) {
      setFeedback({ text: 'אנא בחר כלי עבודה זמין לשילוח מהרשימה', type: 'error' });
      return;
    }
    if (!directTargetWarehouseId) {
      setFeedback({ text: 'אנא בחר מחסן או אתר יעד לקליטת הציוד', type: 'error' });
      return;
    }
    if (selectedDirectAsset.currentWarehouseId === directTargetWarehouseId) {
      setFeedback({ text: 'מחסן המקור ומחסן היעד חייבים להיות שונים', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await directStorekeeperTransferAction({
        assetId: selectedDirectAsset.id,
        targetWarehouseId: directTargetWarehouseId,
        transporterNotes: transporterNotes.trim() || undefined,
        sourceWarehouseId:
          selectedDirectAsset.currentWarehouseId ||
          (selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined),
      });

      if (!res.success) {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'נסה שוב'}`);
        setFeedback({ text: res.error || 'שגיאה בשילוח ישיר', type: 'error' });
        return;
      }

      await onSuccess(selectedDirectAsset.id, directTargetWarehouseId);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת';
      alert(`שגיאה בביצוע הפעולה: ${msg}`);
      setFeedback({ text: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white border-2 border-sky-300 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-sky-950 via-blue-900 to-indigo-950 text-white flex items-center justify-between shrink-0 border-b border-sky-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/30 flex items-center justify-center border border-sky-400/30">
                <Truck className="w-5 h-5 text-sky-200" />
              </div>
              <div>
                <h3 className="font-black text-base text-white flex items-center gap-2">
                  <span>העברה ישירה לאתר אחר</span>
                  <span className="text-[10px] font-bold bg-sky-400/20 text-sky-200 px-2 py-0.5 rounded-full border border-sky-300/30">
                    שילוח מיידי
                  </span>
                </h3>
                <p className="text-xs text-sky-200">
                  שילוח כלי עבודה זמין ממחסן זה ישירות לאתר בנייה או מחסן אחר בארגון
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
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

            {/* Source Warehouse Info */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  מחסן מקור (נוכחי): <strong className="text-slate-900">{sourceWarehouseName || 'מחסן שטח'}</strong>
                </span>
              </div>
              <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                מלאי זמין לשילוח
              </span>
            </div>

            {/* 1. Tool Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>1. בחירת כלי עבודה מהמלאי הזמין <span className="text-rose-500">*</span></span>
                {selectedDirectAsset && (
                  <button
                    type="button"
                    onClick={() => setSelectedDirectAsset(null)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                  >
                    החלף כלי
                  </button>
                )}
              </label>

              {selectedDirectAsset ? (
                <div className="p-3.5 rounded-2xl bg-sky-50/80 border-2 border-sky-400 flex items-center justify-between gap-3 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-sky-950 bg-white px-2 py-0.5 rounded border border-sky-200" dir="ltr">
                        {selectedDirectAsset.qrCode}
                      </span>
                      {selectedDirectAsset.tagNumber && (
                        <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                          {selectedDirectAsset.tagNumber}
                        </span>
                      )}
                      <span className="text-xs font-black text-sky-950">
                        {selectedDirectAsset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {selectedDirectAsset.brand} {selectedDirectAsset.modelNumber ? `• דגם: ${selectedDirectAsset.modelNumber}` : ''} {selectedDirectAsset.serialNumber ? `• מס"ד: ${selectedDirectAsset.serialNumber}` : ''}
                    </p>
                  </div>
                  <Check className="w-5 h-5 text-sky-600 shrink-0" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={directSearchQuery}
                        onChange={(e) => setDirectSearchQuery(e.target.value)}
                        placeholder="סנן לפי תג (למשל: ZR-1099), שם כלי, מותג או מס' סידורי..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
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

                  {isLoadingLocalAssets ? (
                    <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                      <span>טוען כלי עבודה זמינים במחסן...</span>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-1.5 bg-slate-50/50">
                      {localAvailableAssets
                        .filter((a) => {
                          if (!directSearchQuery.trim()) return true;
                          const q = directSearchQuery.toLowerCase();
                          return (
                            a.name.toLowerCase().includes(q) ||
                            a.brand.toLowerCase().includes(q) ||
                            a.qrCode.toLowerCase().includes(q) ||
                            (a.tagNumber && a.tagNumber.toLowerCase().includes(q)) ||
                            (a.modelNumber && a.modelNumber.toLowerCase().includes(q)) ||
                            (a.serialNumber && a.serialNumber.toLowerCase().includes(q))
                          );
                        })
                        .slice(0, 50)
                        .map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => setSelectedDirectAsset(asset)}
                            className="w-full text-right p-2.5 rounded-xl bg-white hover:bg-sky-50/70 border border-slate-200 hover:border-sky-300 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded" dir="ltr">
                                  {asset.qrCode}
                                </span>
                                {asset.tagNumber && (
                                  <span className="font-mono text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                    {asset.tagNumber}
                                  </span>
                                )}
                                <span className="text-xs font-bold text-slate-900">{asset.name}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {asset.brand} {asset.modelNumber ? `• ${asset.modelNumber}` : ''}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg shrink-0">
                              בחר כלי
                            </span>
                          </button>
                        ))}

                      {localAvailableAssets.length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-500">
                          אין כרגע כלים זמינים במחסן זה לשילוח
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Destination Warehouse */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                2. אתר יעד לקליטת הציוד (מחסן מקבל) <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={directTargetWarehouseId}
                onChange={(e) => setDirectTargetWarehouseId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
              >
                <option value="" disabled>
                  בחר אתר יעד...
                </option>
                {warehouses
                  .filter((w) => w.id !== 'all' && w.id !== selectedWarehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* 3. Transporter / Driver Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                3. פרטי המוביל / נהג שינוע או תעודת משלוח (הערות שינוע)
              </label>
              <input
                type="text"
                value={transporterNotes}
                onChange={(e) => setTransporterNotes(e.target.value)}
                placeholder="למשל: נהג אחמד (טנדר 44-555-66), נשלח בדחיפות לעבודות לילה..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Route Summary */}
            {selectedDirectAsset && directTargetWarehouseId && (
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">ממחסן מקור</span>
                  <strong className="text-slate-900">
                    {sourceWarehouseName || 'מחסן מקור'}
                  </strong>
                </div>
                <Truck className="w-4 h-4 text-sky-600" />
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 block">ליעד</span>
                  <strong className="text-sky-900">
                    {warehouses.find((w) => w.id === directTargetWarehouseId)?.name || 'אתר יעד'}
                  </strong>
                </div>
              </div>
            )}

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
                disabled={isSubmitting || !selectedDirectAsset || !directTargetWarehouseId}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-sky-600/20 cursor-pointer transition-all active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>משלח כלי...</span>
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    <span>אשר שילוח והעברה</span>
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
          const found = localAvailableAssets.find((a) => a.id === asset.id || a.qrCode === asset.qrCode);
          if (found) {
            setSelectedDirectAsset(found);
          } else {
            setSelectedDirectAsset({
              id: asset.id,
              name: asset.toolName,
              brand: asset.brand,
              modelNumber: asset.modelNumber,
              qrCode: asset.qrCode,
              tagNumber: asset.qrCode,
              serialNumber: null,
              currentWarehouseId: asset.currentWarehouseId || '',
              currentWarehouseName: asset.warehouseName || '',
            });
          }
          setIsOcrOpen(false);
        }}
        warehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        title="סריקת כלי (QR / OCR)"
      />
    </>
  );
}
