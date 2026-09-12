'use client';

import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  CheckCircle2,
  Truck,
  AlertTriangle,
  Sparkles,
  Search,
  Building2,
  QrCode,
  Clock,
  Phone,
  FileText,
  Battery,
  Zap,
  Briefcase,
  Calendar,
  PenTool,
  History as HistoryIcon,
  MapPin,
} from 'lucide-react';
import type {
  AuditHistoryPayload,
  AuditHistoryRecord,
  AuditActionType,
} from '@/app/actions/history';
import AppLayout from '@/components/layout/AppLayout';

interface HistoryViewProps {
  initialData: AuditHistoryPayload;
}

const ACTION_FILTERS: Array<{
  value: string;
  labelHe: string;
  icon: React.ReactNode;
  colorClass: string;
}> = [
  {
    value: 'all',
    labelHe: 'כל הפעולות',
    icon: <HistoryIcon className="w-3.5 h-3.5" />,
    colorClass: 'border-zinc-700 text-zinc-200',
  },
  {
    value: 'CHECKOUT',
    labelHe: 'ניפוקים',
    icon: <UserCheck className="w-3.5 h-3.5" />,
    colorClass: 'border-amber-500/40 text-amber-300',
  },
  {
    value: 'CHECKIN',
    labelHe: 'החזרות',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    colorClass: 'border-emerald-500/40 text-emerald-300',
  },
  {
    value: 'TRANSFER_RECEIVE',
    labelHe: 'העברות אתר',
    icon: <Truck className="w-3.5 h-3.5" />,
    colorClass: 'border-blue-500/40 text-blue-300',
  },
  {
    value: 'MAINTENANCE_FLAG',
    labelHe: 'קריאות שירות / תיקון',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    colorClass: 'border-rose-500/40 text-rose-300',
  },
  {
    value: 'ONBOARD',
    labelHe: 'רישום כלי חדש',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    colorClass: 'border-purple-500/40 text-purple-300',
  },
];

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('he-IL', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function getConditionLabel(condition?: string) {
  switch (condition) {
    case 'excellent':
      return 'מעולה כחדש';
    case 'good':
      return 'תקין ומוכן לעבודה';
    case 'needs_repair':
      return 'דורש תיקון / בדיקה';
    case 'retired':
      return 'מושבת / יצא משימוש';
    default:
      return condition || '';
  }
}

function getDamageTypeLabel(damageType?: string) {
  switch (damageType) {
    case 'misuse':
      return 'שימוש לא נכון / חריג';
    case 'wear_tear':
      return 'בלאי טבעי';
    case 'burned_motor':
      return 'מנוע שרוף / עומס יתר';
    case 'impact_drop':
      return 'נפילה / שבר פיזי';
    case 'other':
      return 'אחר';
    default:
      return damageType || '';
  }
}

function getChargePartyLabel(chargeParty?: string) {
  switch (chargeParty) {
    case 'worker':
      return 'חיוב עובד';
    case 'subcontractor':
      return 'חיוב קבלן משנה';
    case 'company':
      return 'חיוב החברה (בלאי)';
    default:
      return chargeParty || '';
  }
}

function renderActionBadge(action: AuditActionType) {
  switch (action) {
    case 'CHECKOUT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300 shadow-sm">
          <UserCheck className="w-3.5 h-3.5 text-amber-600" />
          <span>ניפוק כלי (הוצאה לשימוש)</span>
        </span>
      );
    case 'CHECKIN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>החזרת כלי למחסן</span>
        </span>
      );
    case 'TRANSFER_RECEIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-300 shadow-sm">
          <Truck className="w-3.5 h-3.5 text-blue-600" />
          <span>העברה לאתר אחר</span>
        </span>
      );
    case 'MAINTENANCE_FLAG':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-900 border border-rose-300 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>בתיקון / בדיקה</span>
        </span>
      );
    case 'ONBOARD':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>רישום כלי ראשוני</span>
        </span>
      );
  }
}

export default function HistoryView({ initialData }: HistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');

  // Filter records in-memory
  const filteredRecords = useMemo(() => {
    let list: AuditHistoryRecord[] = initialData.records;

    if (selectedAction !== 'all') {
      list = list.filter((r) => r.action === selectedAction);
    }

    if (selectedWarehouseId !== 'all') {
      list = list.filter((r) => r.warehouseId === selectedWarehouseId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.toolName.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.qrCode.toLowerCase().includes(q) ||
          (r.targetWorker && r.targetWorker.toLowerCase().includes(q)) ||
          (r.performedBy && r.performedBy.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [initialData.records, selectedAction, selectedWarehouseId, searchQuery]);

  return (
    <AppLayout
      title="Tooly - יומן תנועות ו-GPS"
      subtitle="מעקב כרונולוגי וביקורת"
      requiredRole="any_elevated"
    >
      <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {/* Facility Dropdown Filter */}
        <div>
          <div className="relative">
            <Building2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pr-10 pl-9 py-2 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-sm"
            >
              <option value="all" className="bg-white text-blue-950">
                כל האתרים והמחסנים ({initialData.records.length} רשומות סה&quot;כ)
              </option>
              {initialData.warehouses.map((wh) => (
                <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                  {wh.code ? `[${wh.code}] ` : ''}
                  {wh.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-xs">
              ▼
            </div>
          </div>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי עובד, שם כלי, ברקוד או הערות..."
            className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm pr-10 pl-14 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              נקה
            </button>
          )}
        </div>

        {/* ACTION FILTER PILLS */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {ACTION_FILTERS.map((f) => {
            const isSelected = selectedAction === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSelectedAction(f.value)}
                className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-black shrink-0 border transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md font-black'
                    : 'bg-slate-50 text-blue-950 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
              >
                {f.icon}
                <span>{f.labelHe}</span>
              </button>
            );
          })}
        </div>

        {/* TIMELINE EVENT LIST */}
        {filteredRecords.length === 0 ? (
          <div className="p-10 rounded-2xl border-2 border-dashed border-blue-200 bg-white text-center space-y-3 shadow-sm">
            <FileText className="w-10 h-10 text-blue-400 mx-auto" />
            <div className="text-sm font-bold text-blue-950">
              לא נמצאו רשומות תנועה התואמות לסינון
            </div>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              נסה לשנות את מילות החיפוש או לבחור ב&quot;כל הפעולות&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecords.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 space-y-3 hover:border-blue-300 transition-colors"
              >
                {/* Header: Action Badge & Timestamp */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  {renderActionBadge(item.action)}
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Clock className="w-3 h-3 text-blue-500" />
                    <span>{formatTimestamp(item.createdAt)}</span>
                  </div>
                </div>

                {/* Tool Identity */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      {item.brand}
                    </span>
                    <div className="flex items-center gap-1 font-mono text-xs text-blue-900" dir="ltr">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold">{item.qrCode}</span>
                    </div>
                  </div>
                  <h3 className="text-base font-black text-blue-950 leading-snug">
                    {item.toolName}
                  </h3>
                  {item.modelNumber && (
                    <div className="text-xs font-mono text-slate-500 mt-0.5" dir="ltr">
                      דגם: {item.modelNumber}
                    </div>
                  )}
                </div>

                {/* Custody / Worker Detail if checkout */}
                {item.targetWorker && (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold">
                        <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          נמסר לעובד: <strong>{item.targetWorker}</strong>
                        </span>
                      </div>
                      {item.workerPhone && (
                        <div className="flex items-center gap-1 text-slate-500 text-[11px]" dir="ltr">
                          <Phone className="w-3 h-3 text-blue-500" />
                          <span>{item.workerPhone}</span>
                        </div>
                      )}
                    </div>

                    {/* Return Date & Accessories & Signature Sub-strip */}
                    {(item.expectedReturnDate || item.accessoriesSnapshot || item.signatureData) && (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          {item.expectedReturnDate && (
                            <div className="flex items-center gap-1 font-bold text-blue-900">
                              <Calendar className="w-3.5 h-3.5 text-blue-600" />
                              <span>מועד החזרה צפוי: {formatTimestamp(item.expectedReturnDate)}</span>
                            </div>
                          )}

                          {item.accessoriesSnapshot && (
                            <div className="flex items-center gap-1 text-slate-600 font-bold">
                              <span className="inline-flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                <Battery className="w-3 h-3 text-blue-600" />
                                {item.accessoriesSnapshot.batteriesCount} סוללות
                              </span>
                              {item.accessoriesSnapshot.hasCharger && (
                                <span className="inline-flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-emerald-700">
                                  <Zap className="w-3 h-3" /> מטען מקורי
                                </span>
                              )}
                              {item.accessoriesSnapshot.hasCase && (
                                <span className="inline-flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-blue-700">
                                  <Briefcase className="w-3 h-3" /> ארגז קשיח
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {item.signatureData && (
                          <div className="pt-1.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                              <PenTool className="w-3 h-3 text-blue-600" />
                              <span>חתימת העובד (דיגיטלית)</span>
                            </div>
                            <div className="h-8 w-24 bg-white rounded border border-slate-200 overflow-hidden flex items-center justify-center p-0.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.signatureData}
                                alt="חתימת העובד"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Return Condition Badge if checkin */}
                {item.action === 'CHECKIN' && item.condition && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      מצב בעת ההחזרה: <strong>{getConditionLabel(item.condition)}</strong>
                    </span>
                  </div>
                )}

                {/* Damage Report Card if present */}
                {item.damageReport && item.damageReport.isDamaged && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-black text-red-900">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span>דוח נזק: {getDamageTypeLabel(item.damageReport.damageType)}</span>
                      </div>
                      {item.damageReport.estimatedCost !== undefined && (
                        <span className="bg-white px-2 py-0.5 rounded border border-red-200 text-red-700 font-bold">
                          ₪{item.damageReport.estimatedCost.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-red-800">
                      <span>
                        גורם לחיוב: <strong>{getChargePartyLabel(item.damageReport.chargeParty)}</strong>
                      </span>
                      {item.damageReport.notes && (
                        <span className="italic truncate max-w-[200px]">
                          &ldquo;{item.damageReport.notes}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes / Remarks */}
                {item.notes && (
                  <div className="text-xs text-blue-900 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 italic">
                    &ldquo;{item.notes}&rdquo;
                  </div>
                )}

                {/* Footer: Location, GPS Pin Link & Performed By */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate max-w-[180px]">{item.warehouseName}</span>
                    </div>

                    {item.gps && (
                      <a
                        href={`https://maps.google.com/?q=${item.gps.lat},${item.gps.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 hover:bg-blue-100 transition-colors"
                        title="פתח מיקום GPS ב-Google Maps"
                        dir="ltr"
                      >
                        <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                        <span>{item.gps.lat.toFixed(4)}, {item.gps.lng.toFixed(4)}</span>
                      </a>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    בוצע ע&quot;י: <span className="text-blue-900 font-semibold">{item.performedBy}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
