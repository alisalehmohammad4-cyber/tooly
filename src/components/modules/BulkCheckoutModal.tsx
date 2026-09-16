'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Trash2,
  Calendar,
  User,
  Phone,
  PenTool,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Battery,
  Zap,
  Briefcase,
  ShieldCheck,
  Layers,
  Lock,
} from 'lucide-react';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import { bulkCheckoutAssetAction } from '@/app/actions/custody';
import type { AssetAccessories } from '@/core/assets/custody.schema';
import SignaturePadModal from '@/components/common/SignaturePadModal';
import { getCurrentGpsCoordinates } from '@/lib/geo';
import { useAuth } from '@/context/AuthContext';
import {
  enqueueSyncAction,
  updateCachedAsset,
  cacheAssets,
} from '@/lib/offline/offlineDb';

interface BulkCheckoutModalProps {
  isOpen: boolean;
  items: ScannedAssetDetails[];
  onClose: () => void;
  onRemoveItem: (assetId: string) => void;
  onBulkCheckoutComplete: (
    message: string,
    updatedAssets: ScannedAssetDetails[]
  ) => void;
}

type DatePreset = 'shift' | 'tomorrow' | '3days' | 'custom';

// Helpers to generate ISO dates for presets
function getEndOfShiftDate(): string {
  const now = new Date();
  const shiftEnd = new Date(now);
  shiftEnd.setHours(17, 0, 0, 0); // 5:00 PM today
  if (shiftEnd.getTime() <= now.getTime()) {
    // If past 5 PM, set 8 hours from now
    return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  }
  return shiftEnd.toISOString();
}

function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(17, 0, 0, 0);
  return tomorrow.toISOString();
}

function getThreeDaysDate(): string {
  const target = new Date();
  target.setDate(target.getDate() + 3);
  target.setHours(17, 0, 0, 0);
  return target.toISOString();
}

function toDatetimeLocal(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

export default function BulkCheckoutModal({
  isOpen,
  items,
  onClose,
  onRemoveItem,
  onBulkCheckoutComplete,
}: BulkCheckoutModalProps) {
  // Form State
  const [workerName, setWorkerName] = useState<string>('');
  const [workerPhone, setWorkerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Date Presets
  const [preset, setPreset] = useState<DatePreset>('shift');
  const [customDate, setCustomDate] = useState<string>(() =>
    toDatetimeLocal(getEndOfShiftDate())
  );

  // Accessories Checklist: Map of assetId -> { batteriesCount, hasCharger, hasCase }
  const [accessoriesMap, setAccessoriesMap] = useState<
    Record<string, AssetAccessories>
  >({});

  // Digital Signature
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSigModalOpen, setIsSigModalOpen] = useState<boolean>(false);

  // Submission & Validation
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Compute active ISO return date
  const resolvedReturnDate = useMemo(() => {
    if (preset === 'shift') return getEndOfShiftDate();
    if (preset === 'tomorrow') return getTomorrowDate();
    if (preset === '3days') return getThreeDaysDate();
    return customDate ? new Date(customDate).toISOString() : getEndOfShiftDate();
  }, [preset, customDate]);

  // Identify any locked or safety-overdue tools in the cart
  const lockedItems = useMemo(() => {
    const now = new Date().getTime();
    return items.filter(
      (item) =>
        item.isLocked ||
        (item.safetyInspectionDue && new Date(item.safetyInspectionDue).getTime() < now)
    );
  }, [items]);

  const { role, assignedWarehouseId, assignedWarehouseName } = useAuth();
  const isStorekeeper = role === 'storekeeper' || role === 'supervisor';

  // Identify any tools in the cart that belong to a different warehouse (strictly enforced for storekeeper)
  const foreignItems = useMemo(() => {
    if (!isStorekeeper || !assignedWarehouseId) return [];
    return items.filter(
      (item) => item.currentWarehouseId && item.currentWarehouseId !== assignedWarehouseId
    );
  }, [isStorekeeper, assignedWarehouseId, items]);

  if (!isOpen) return null;

  // Accessory change handler
  const handleUpdateAccessories = (
    assetId: string,
    updates: Partial<AssetAccessories>
  ) => {
    setAccessoriesMap((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] || {
          batteriesCount: 1,
          hasCharger: true,
          hasCase: true,
        }),
        ...updates,
      },
    }));
  };

  // Submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (items.length === 0) {
      setFormError('סל הניפוק ריק. יש לסרוק כלים תחילה.');
      return;
    }

    if (lockedItems.length > 0) {
      setFormError(
        `קיימים ${lockedItems.length} כלים בסל שנעולים מנהלתית או שפג תוקף בדיקת הבטיחות שלהם. יש להסירם מהסל כדי להמשיך בניפוק.`
      );
      return;
    }

    if (foreignItems.length > 0) {
      setFormError(
        `בסל קיימים ${foreignItems.length} כלים שאינם שייכים למחסן המשויך שלך (${assignedWarehouseName || 'מחסן נוכחי'}). יש להסירם לפני ביצוע הניפוק.`
      );
      return;
    }

    if (!workerName.trim() || workerName.trim().length < 2) {
      setFormError('שם העובד המקבל נדרש (לפחות 2 תווים).');
      return;
    }

    if (!signatureData) {
      setFormError('חתימה דיגיטלית נדרשת לאישור מסירת הציוד.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch silent GPS coordinates
      const gps = await getCurrentGpsCoordinates();

      // Build complete accessories map with defaults for any untouched tools
      const compiledAccessories: Record<string, AssetAccessories> = {};
      items.forEach((tool) => {
        compiledAccessories[tool.id] = accessoriesMap[tool.id] || {
          batteriesCount: 1,
          hasCharger: true,
          hasCase: true,
        };
      });

      const payload = {
        assetIds: items.map((i) => i.id),
        workerName: workerName.trim(),
        workerPhone: workerPhone.trim() || undefined,
        expectedReturnDate: resolvedReturnDate,
        accessories: compiledAccessories,
        signatureData,
        notes: notes.trim() || undefined,
        gps,
      };

      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (isOffline) {
        await enqueueSyncAction('bulk_checkout', payload);
        const updatedAssets = await Promise.all(
          items.map(async (tool) => {
            const updated = await updateCachedAsset(tool.id, {
              status: 'checked_out',
              currentAssignedWorker: workerName.trim(),
              expectedReturnDate: resolvedReturnDate,
              accessories: compiledAccessories[tool.id],
            });
            return (
              updated || {
                ...tool,
                status: 'checked_out' as const,
                currentAssignedWorker: workerName.trim(),
                expectedReturnDate: resolvedReturnDate,
                accessories: compiledAccessories[tool.id],
              }
            );
          })
        );
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([100, 50, 100]); } catch {}
        }
        setIsSubmitting(false);
        onBulkCheckoutComplete(
          `נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (${items.length} כלים נופקו)`,
          updatedAssets
        );
        onClose();
        return;
      }

      const res = await bulkCheckoutAssetAction(payload);

      setIsSubmitting(false);

      if (!res.success) {
        setFormError(res.error);
        return;
      }

      if (res.assets) await cacheAssets(res.assets);
      onBulkCheckoutComplete(res.message, res.assets);
      onClose();
    } catch {
      // Fallback on network failure
      try {
        const compiledAccessories: Record<string, AssetAccessories> = {};
        items.forEach((tool) => {
          compiledAccessories[tool.id] = accessoriesMap[tool.id] || {
            batteriesCount: 1,
            hasCharger: true,
            hasCase: true,
          };
        });
        const payload = {
          assetIds: items.map((i) => i.id),
          workerName: workerName.trim(),
          workerPhone: workerPhone.trim() || undefined,
          expectedReturnDate: resolvedReturnDate,
          accessories: compiledAccessories,
          signatureData,
          notes: notes.trim() || undefined,
        };
        await enqueueSyncAction('bulk_checkout', payload);
        const updatedAssets = await Promise.all(
          items.map(async (tool) => {
            const updated = await updateCachedAsset(tool.id, {
              status: 'checked_out',
              currentAssignedWorker: workerName.trim(),
              expectedReturnDate: resolvedReturnDate,
              accessories: compiledAccessories[tool.id],
            });
            return (
              updated || {
                ...tool,
                status: 'checked_out' as const,
                currentAssignedWorker: workerName.trim(),
                expectedReturnDate: resolvedReturnDate,
                accessories: compiledAccessories[tool.id],
              }
            );
          })
        );
        setIsSubmitting(false);
        onBulkCheckoutComplete(
          `נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (${items.length} כלים נופקו)`,
          updatedAssets
        );
        onClose();
      } catch (innerErr: unknown) {
        setIsSubmitting(false);
        const msg = innerErr instanceof Error ? innerErr.message : 'שגיאה בביצוע הניפוק';
        setFormError(msg);
      }
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-checkout-title"
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
      >
        <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-blue-200 overflow-hidden flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-blue-950 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 id="bulk-checkout-title" className="text-base sm:text-lg font-black leading-tight">
                  ניפוק מרוכז לעובד ({items.length} כלים)
                </h2>
                <p className="text-xs text-blue-200/80 font-semibold">
                  בדיקת נלווים, מועד החזרה וחתימה דיגיטלית
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form
            onSubmit={handleSubmit}
            className="p-4 sm:p-6 pb-14 sm:pb-8 flex-1 overflow-y-auto overscroll-contain space-y-6 text-slate-800"
          >
            {/* Foreign Warehouse Restriction Alert */}
            {foreignItems.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs flex items-start gap-2.5 shadow-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-amber-900">הגבלת סמכות מחסן בניפוק מרוכז</div>
                  <div className="mt-0.5 font-medium">
                    בסל קיימים {foreignItems.length} כלים שאינם שייכים למחסן המשויך שלך ({assignedWarehouseName || 'מחסן נוכחי'}). יש להסיר כלים אלו מסל הניפוק לפני אישור המסירה.
                  </div>
                </div>
              </div>
            )}

            {/* 1. SCANNED TOOLS & ACCESSORIES CHECKLIST */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase font-extrabold text-blue-900 tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  רשימת הכלים ובדיקת אביזרים נלווים ({items.length})
                </label>
                <span className="text-[11px] text-slate-500 font-bold">
                  סמן אביזרים שנמסרו
                </span>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                  סל הניפוק ריק
                </div>
              ) : (
                <div className="space-y-3 max-h-56 sm:max-h-64 overflow-y-auto pr-1">
                  {items.map((tool, idx) => {
                    const acc = accessoriesMap[tool.id] || {
                      batteriesCount: 1,
                      hasCharger: true,
                      hasCase: true,
                    };
                    return (
                      <div
                        key={tool.id}
                        className="p-3 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-slate-200 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <h3 className="text-sm font-black text-blue-950 truncate">
                                {tool.toolName}
                              </h3>
                            </div>
                            <div className="text-xs text-slate-500 font-bold mt-0.5 flex items-center gap-2">
                              <span>{tool.brand}</span>
                              {tool.modelNumber && <span>• {tool.modelNumber}</span>}
                              <span className="font-mono text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded text-[10px]">
                                {tool.qrCode}
                              </span>
                            </div>
                            {(tool.isLocked ||
                              (tool.safetyInspectionDue &&
                                new Date(tool.safetyInspectionDue).getTime() < new Date().getTime())) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tool.isLocked && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                                    <Lock className="w-3 h-3 text-red-600" />
                                    נעול מנהלתית
                                  </span>
                                )}
                                {tool.safetyInspectionDue &&
                                  new Date(tool.safetyInspectionDue).getTime() < new Date().getTime() && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                                      <AlertCircle className="w-3 h-3 text-rose-600" />
                                      פג תוקף בטיחות
                                    </span>
                                  )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(tool.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="הסר כלי מהסל"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Accessories Pills Checklist */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                          {/* Batteries Count Selector */}
                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-xs font-bold">
                            <Battery className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[11px] text-slate-600">סוללות:</span>
                            {[0, 1, 2, 3].map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() =>
                                  handleUpdateAccessories(tool.id, {
                                    batteriesCount: cnt,
                                  })
                                }
                                className={`w-5 h-5 rounded-md text-[11px] font-black transition-all cursor-pointer ${
                                  acc.batteriesCount === cnt
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {cnt}
                              </button>
                            ))}
                          </div>

                          {/* Charger Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAccessories(tool.id, {
                                hasCharger: !acc.hasCharger,
                              })
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              acc.hasCharger
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <Zap className="w-3 h-3" />
                            <span>מטען מקורי {acc.hasCharger ? '✓' : '✗'}</span>
                          </button>

                          {/* Case Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAccessories(tool.id, {
                                hasCase: !acc.hasCase,
                              })
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              acc.hasCase
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <Briefcase className="w-3 h-3" />
                            <span>ארגז / מזוודה {acc.hasCase ? '✓' : '✗'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. RETURN DUE DATE PRESETS */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                מועד החזרה משוער
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'shift', label: 'סוף יום עבודה' },
                  { id: 'tomorrow', label: 'מחר בבוקר' },
                  { id: '3days', label: 'בעוד 3 ימים' },
                  { id: 'custom', label: 'תאריך מותאם' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id as DatePreset)}
                    className={`min-h-[46px] p-2 rounded-xl text-xs font-black transition-all border-2 flex items-center justify-center text-center cursor-pointer ${
                      preset === item.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom Date Input */}
              {preset === 'custom' && (
                <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full min-h-[48px] px-3 py-2 bg-white text-blue-950 font-bold text-sm rounded-xl border-2 border-blue-300 focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              )}
            </div>

            {/* 3. WORKER DETAILS (NAME & PHONE) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  שם העובד המקבל *
                </label>
                <input
                  type="text"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="לדוגמה: ישראל ישראלי"
                  className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm px-3.5 py-2 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  טלפון נייד (רשות)
                </label>
                <input
                  type="tel"
                  value={workerPhone}
                  onChange={(e) => setWorkerPhone(e.target.value)}
                  placeholder="050-0000000"
                  className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm px-3.5 py-2 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* 4. DIGITAL SIGNATURE SECTION */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2 flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-blue-600" />
                חתימה דיגיטלית של העובד *
              </label>

              {!signatureData ? (
                <button
                  type="button"
                  onClick={() => setIsSigModalOpen(true)}
                  className="w-full min-h-[58px] rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-100/70 text-blue-900 font-black text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm"
                >
                  <PenTool className="w-5 h-5 text-blue-600" />
                  <span>פתיחת לוח חתימה דיגיטלית</span>
                </button>
              ) : (
                <div className="p-3 bg-slate-50 rounded-2xl border-2 border-emerald-300 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureData}
                        alt="Signature Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-black text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>החתימה אושרה</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-bold">
                        {workerName || 'חתימת מקבל הציוד'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSigModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-200/80 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    חתום מחדש
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-slate-600 tracking-wider mb-1">
                הערות ניפוק (אתר, מנהל עבודה, מספר פרויקט)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות או פרטים נוספים..."
                className="w-full min-h-[46px] bg-white text-slate-900 text-sm px-3.5 py-2 rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0 || foreignItems.length > 0}
              className={`w-full min-h-[60px] rounded-2xl font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all active:scale-[0.98] cursor-pointer ${
                isSubmitting || items.length === 0 || foreignItems.length > 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>רושם ניפוק במערכת...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span>אישור ניפוק מרוכז ({items.length} כלים)</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Signature Pad Modal Sub-component */}
      <SignaturePadModal
        isOpen={isSigModalOpen}
        onClose={() => setIsSigModalOpen(false)}
        signerName={workerName}
        onConfirm={(dataUrl) => {
          setSignatureData(dataUrl);
          setFormError(null);
        }}
      />
    </>
  );
}
