'use client';

import React from 'react';
import {
  Wrench,
  RefreshCw,
  Loader2,
  CheckCircle2,
  QrCode,
  AlertTriangle,
  Building2,
  Calendar,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import type { MaintenanceAssetItem } from '../types';

export interface WarehouseMaintenanceTabProps {
  maintenanceAssets: MaintenanceAssetItem[];
  isLoadingMaintenance: boolean;
  onRefreshMaintenance: () => Promise<void> | void;
  onOpenPassport: (qrCode: string, asset?: MaintenanceAssetItem) => void;
  onOpenRepairModal: (asset: MaintenanceAssetItem) => void;
  onOpenRetireModal: (asset: MaintenanceAssetItem) => void;
}

export default function WarehouseMaintenanceTab({
  maintenanceAssets,
  isLoadingMaintenance,
  onRefreshMaintenance,
  onOpenPassport,
  onOpenRepairModal,
  onOpenRetireModal,
}: WarehouseMaintenanceTabProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* CHIEF STOREKEEPER: CENTRAL MAINTENANCE & REPAIR HUB (מרכז אחזקה ובקרת תיקונים) */}
      <div className="bg-white border-2 border-amber-300/80 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>מרכז אחזקה ובקרת תיקונים</span>
                <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">
                  (Central Maintenance & Repair Hub)
                </span>
                {maintenanceAssets.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-600 text-white animate-pulse">
                    {maintenanceAssets.length} כלים בטיפול
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ספר מעקב אחזקה מרכזי &bull; שליטה במעבדות שירות, קליטה מתיקון והחזרה למלאי, וגריטת ציוד תקול
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => void onRefreshMaintenance()}
              disabled={isLoadingMaintenance}
              className="px-3 py-1.5 rounded-xl border border-amber-200 hover:bg-amber-50 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMaintenance ? 'animate-spin' : ''}`} />
              <span>רענן נתוני אחזקה</span>
            </button>
          </div>
        </div>

        {isLoadingMaintenance && maintenanceAssets.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
            <span>טוען נתוני תיקונים ומעבדות...</span>
          </div>
        ) : maintenanceAssets.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>כל הציוד הארגוני תקין ועומד לרשות המחסנים והאתרים &bull; אין כרגע כלים בתיקון או במעבדה</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
            {maintenanceAssets.map((asset) => (
              <div
                key={asset.id}
                className="p-4 rounded-2xl bg-gradient-to-br from-white to-amber-50/30 border-2 border-amber-200 shadow-sm flex flex-col justify-between gap-4 hover:border-amber-400 transition-all"
              >
                <div className="space-y-3">
                  {/* Top Bar: Tool Tag & Model + Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenPassport(asset.qrCode, asset)}
                          className="font-mono text-xs font-black text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300 hover:border-amber-500 transition-colors cursor-pointer group flex items-center gap-1 shadow-2xs"
                          title={`לחץ לפתיחת תיק כלי מלא עבור ${asset.qrCode}`}
                          dir="ltr"
                        >
                          <QrCode className="w-3.5 h-3.5 text-amber-700 group-hover:scale-110 transition-transform" />
                          <span className="underline decoration-amber-400">{asset.qrCode}</span>
                        </button>
                        {asset.serialNumber && (
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            מס&quot;ד: {asset.serialNumber}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-black text-slate-900 mt-1">
                        {asset.toolName}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {asset.brand} {asset.modelNumber ? `• דגם: ${asset.modelNumber}` : ''}
                      </p>
                    </div>

                    <span className="text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                      <Wrench className="w-3.5 h-3.5 text-amber-700" />
                      <span>בתיקון / מעבדה</span>
                    </span>
                  </div>

                  {/* Fault Description Callout from custody_ledger */}
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/90 text-xs space-y-1">
                    <div className="font-black text-amber-950 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>תיאור תקלה ודוח פגם:</span>
                    </div>
                    <p className="text-amber-900 font-medium leading-relaxed">
                      {asset.faultDescription}
                    </p>
                  </div>

                  {/* Lab / Tech + Reporting Site + Dispatch Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">מעבדה / טכנאי מטפל</span>
                      <span className="font-black text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="truncate">{asset.assignedTechnicianOrLab}</span>
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold block">מחסן / אתר מדווח</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{asset.reportingWarehouseName}</span>
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 sm:col-span-2 flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>נשלח לתיקון: <strong>{new Date(asset.dispatchedDate).toLocaleDateString('he-IL')}</strong></span>
                      </span>
                      <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                        {asset.elapsedTimeText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Action Buttons on each card */}
                <div className="pt-3 border-t border-amber-200/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenRetireModal(asset)}
                    className="py-2 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>גריטת כלי / השבתה</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenRepairModal(asset)}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>קליטה מתיקון / Return to Stock</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
