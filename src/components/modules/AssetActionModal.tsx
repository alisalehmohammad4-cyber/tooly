'use client';

import React, { useState } from 'react';
import {
  X,
  UserCheck,
  CheckCircle2,
  Truck,
  Building2,
  QrCode,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import type { Warehouse, AssetCondition } from '@/types/domain';
import {
  type ScannedAssetDetails,
  checkoutAssetAction,
  checkinAssetAction,
  transferAssetAction,
} from '@/app/actions/custody';

interface AssetActionModalProps {
  asset: ScannedAssetDetails | null;
  warehouses: Warehouse[];
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: (message: string, updatedAsset: ScannedAssetDetails) => void;
}

type ModalTab = 'checkout' | 'checkin' | 'transfer';

export default function AssetActionModal({
  asset,
  warehouses,
  isOpen,
  onClose,
  onActionComplete,
}: AssetActionModalProps) {
  // Tab Mode: auto-select Check-In if already checked_out, otherwise Check-Out
  const initialTab: ModalTab =
    asset?.status === 'checked_out' ? 'checkin' : 'checkout';
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);

  // Form states
  const [workerName, setWorkerName] = useState<string>('');
  const [workerPhone, setWorkerPhone] = useState<string>('');
  const [checkinCondition, setCheckinCondition] =
    useState<AssetCondition>('good');
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );
  const [notes, setNotes] = useState<string>('');

  // Status & loading
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !asset) return null;

  const isAvailable = asset.status === 'available';
  const isCheckedOut = asset.status === 'checked_out';
  const isMaintenance = asset.status === 'maintenance';

  // Handle Checkout Action
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      setActionError('Worker name is required for custody assignment.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const res = await checkoutAssetAction({
      assetId: asset.id,
      workerName: workerName.trim(),
      workerPhone: workerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setActionError(res.error);
      return;
    }

    onActionComplete(res.message, res.asset);
    onClose();
  };

  // Handle Check-in Action
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setActionError(null);

    const res = await checkinAssetAction({
      assetId: asset.id,
      condition: checkinCondition,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setActionError(res.error);
      return;
    }

    onActionComplete(res.message, res.asset);
    onClose();
  };

  // Handle Transfer Action
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWarehouseId) {
      setActionError('Please select a target facility.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const res = await transferAssetAction({
      assetId: asset.id,
      targetWarehouseId,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setActionError(res.error);
      return;
    }

    onActionComplete(res.message, res.asset);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-white border-2 border-blue-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200 text-blue-950">
        {/* TOP TOOL BANNER */}
        <div className="bg-blue-50/80 border-b border-blue-100 p-4 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
              {asset.brand}
            </span>
            <div className="flex items-center gap-1 text-xs font-mono text-blue-900">
              <QrCode className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold">{asset.qrCode}</span>
            </div>
          </div>

          <h2
            id="asset-modal-title"
            className="text-lg font-black text-blue-950 leading-tight pr-8"
          >
            {asset.toolName}
          </h2>

          {asset.modelNumber && (
            <div className="text-xs font-mono text-slate-500 mt-0.5">
              Model: {asset.modelNumber}
            </div>
          )}

          {/* Current Location & Live Status Pill */}
          <div className="mt-3 pt-3 border-t border-blue-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 font-bold">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate max-w-[200px]">{asset.warehouseName}</span>
            </div>

            <div>
              {isAvailable && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Available
                </span>
              )}
              {isCheckedOut && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-amber-50 text-amber-800 border border-amber-300">
                  <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                  Custody: {asset.currentAssignedWorker}
                </span>
              )}
              {isMaintenance && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-red-50 text-red-700 border border-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  Maintenance
                </span>
              )}
            </div>
          </div>
        </div>

        {/* THREE ACTION TABS */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-100/80 border-b border-blue-100 text-xs font-black">
          <button
            type="button"
            onClick={() => {
              setActiveTab('checkout');
              setActionError(null);
            }}
            className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'checkout'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>صرف (Check Out)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('checkin');
              setActionError(null);
            }}
            className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'checkin'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>إرجاع (Check In)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('transfer');
              setActionError(null);
            }}
            className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'transfer'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>نقل (Transfer)</span>
          </button>
        </div>

        {/* TAB CONTENTS & FORMS */}
        <div className="p-4 overflow-y-auto flex-1">
          {actionError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* TAB A: CHECK-OUT FORM */}
          {activeTab === 'checkout' && (
            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Worker Name (اسم المستلم) <span className="text-blue-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="e.g. Ahmad Al-Sayed"
                  className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Worker Phone / Badge ID (رقم الجوال أو الهوية)
                </label>
                <input
                  type="text"
                  value={workerPhone}
                  onChange={(e) => setWorkerPhone(e.target.value)}
                  placeholder="e.g. +966 50 123 4567"
                  className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Notes (ملاحظات الصرف)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Assigned to Site B Project"
                  className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <>
                    <UserCheck className="w-6 h-6 stroke-[2.5]" />
                    <span>Confirm Check-Out (تأكيد صرف العهدة)</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB B: CHECK-IN FORM */}
          {activeTab === 'checkin' && (
            <form onSubmit={handleCheckin} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2">
                  Return Condition (حالة المعدة عند الإرجاع)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: 'good',
                        label: 'سليمة وجاهزة للعمل',
                        sub: 'Good / Ready',
                        color: 'emerald',
                      },
                      {
                        value: 'excellent',
                        label: 'ممتازة كالجديدة',
                        sub: 'Excellent',
                        color: 'emerald',
                      },
                      {
                        value: 'needs_repair',
                        label: 'تحتاج صيانة / فحص',
                        sub: 'Needs Repair',
                        color: 'red',
                      },
                      {
                        value: 'retired',
                        label: 'تالفة / خارج الخدمة',
                        sub: 'Retired',
                        color: 'zinc',
                      },
                    ] as const
                  ).map((cond) => {
                    const isSelected = checkinCondition === cond.value;
                    return (
                      <button
                        key={cond.value}
                        type="button"
                        onClick={() => setCheckinCondition(cond.value)}
                        className={`min-h-[56px] px-3 py-2 rounded-xl text-xs font-black transition-all border-2 text-center flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                            : 'bg-slate-50 text-blue-950 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <span>{cond.label}</span>
                        <span
                          className={`text-[10px] font-bold ${
                            isSelected ? 'text-white/80' : 'text-slate-500'
                          }`}
                        >
                          {cond.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Inspection Notes (ملاحظات الفحص)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Cleaned and tested in good order"
                  className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                    <span>Confirm Check-In (تأكيد إرجاع العهدة)</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB C: TRANSFER FORM */}
          {activeTab === 'transfer' && (
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Target Facility / Warehouse (الموقع الجديد)
                </label>
                <div className="relative">
                  <select
                    value={targetWarehouseId}
                    onChange={(e) => setTargetWarehouseId(e.target.value)}
                    className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-sm"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                        {wh.code ? `[${wh.code}] ` : ''}
                        {wh.name} {wh.id === asset.currentWarehouseId ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-sm">
                    ▼
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  Transfer Dispatch Notes (ملاحظات النقل)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Transferred with crew van for Site B"
                  className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : (
                  <>
                    <Truck className="w-6 h-6 stroke-[2.5]" />
                    <span>Confirm Transfer (تأكيد نقل المعدة)</span>
                    <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
