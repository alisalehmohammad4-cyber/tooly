'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
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
  Printer,
  Scan,
  Layers,
  History as HistoryIcon,
  Phone,
  FileText,
} from 'lucide-react';
import type {
  AuditHistoryPayload,
  AuditHistoryRecord,
  AuditActionType,
} from '@/app/actions/history';

interface HistoryViewProps {
  initialData: AuditHistoryPayload;
}

const ACTION_FILTERS: Array<{
  value: string;
  labelEn: string;
  labelAr: string;
  icon: React.ReactNode;
  colorClass: string;
}> = [
  {
    value: 'all',
    labelEn: 'All Events',
    labelAr: 'الكل',
    icon: <HistoryIcon className="w-3.5 h-3.5" />,
    colorClass: 'border-zinc-700 text-zinc-200',
  },
  {
    value: 'CHECKOUT',
    labelEn: 'Checkouts',
    labelAr: 'صرف عهدة',
    icon: <UserCheck className="w-3.5 h-3.5" />,
    colorClass: 'border-amber-500/40 text-amber-300',
  },
  {
    value: 'CHECKIN',
    labelEn: 'Returns',
    labelAr: 'إرجاع عهدة',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    colorClass: 'border-emerald-500/40 text-emerald-300',
  },
  {
    value: 'TRANSFER_RECEIVE',
    labelEn: 'Transfers',
    labelAr: 'نقل موقع',
    icon: <Truck className="w-3.5 h-3.5" />,
    colorClass: 'border-blue-500/40 text-blue-300',
  },
  {
    value: 'MAINTENANCE_FLAG',
    labelEn: 'Maintenance',
    labelAr: 'صيانة',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    colorClass: 'border-rose-500/40 text-rose-300',
  },
  {
    value: 'ONBOARD',
    labelEn: 'Onboard',
    labelAr: 'تسجيل',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    colorClass: 'border-purple-500/40 text-purple-300',
  },
];

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function renderActionBadge(action: AuditActionType) {
  switch (action) {
    case 'CHECKOUT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300 shadow-sm">
          <UserCheck className="w-3.5 h-3.5 text-amber-600" />
          <span>CHECKOUT &bull; صرف عهدة</span>
        </span>
      );
    case 'CHECKIN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>CHECKIN &bull; إرجاع عهدة</span>
        </span>
      );
    case 'TRANSFER_RECEIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-300 shadow-sm">
          <Truck className="w-3.5 h-3.5 text-blue-600" />
          <span>TRANSFER &bull; نقل موقع</span>
        </span>
      );
    case 'MAINTENANCE_FLAG':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-900 border border-rose-300 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>MAINTENANCE &bull; صيانة</span>
        </span>
      );
    case 'ONBOARD':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>ONBOARD &bull; تسجيل أولي</span>
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
    <div className="min-h-screen bg-slate-50 text-blue-950 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. STICKY TOP HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25">
              T
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-blue-600 font-bold">
                Chronological Trail
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                AUDIT LEDGER / سجل الحركات
              </h1>
            </div>
          </div>

          {/* Operation Counter Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-black text-blue-700">
              {filteredRecords.length}
            </span>
            <span className="text-xs font-bold text-slate-500">Events</span>
          </div>
        </div>

        {/* Facility Dropdown Filter */}
        <div className="mt-3 max-w-lg mx-auto">
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pl-10 pr-9 py-2 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-sm"
            >
              <option value="all" className="bg-white text-blue-950">
                All Facilities ({initialData.records.length} Total Logs)
              </option>
              {initialData.warehouses.map((wh) => (
                <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                  {wh.code ? `[${wh.code}] ` : ''}
                  {wh.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-xs">
              ▼
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* SEARCH INPUT */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by worker, tool name, or QR code..."
            className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm pl-10 pr-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Clear
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
                <span>{f.labelAr}</span>
              </button>
            );
          })}
        </div>

        {/* TIMELINE EVENT LIST */}
        {filteredRecords.length === 0 ? (
          <div className="p-10 rounded-2xl border-2 border-dashed border-blue-200 bg-white text-center space-y-3 shadow-sm">
            <FileText className="w-10 h-10 text-blue-400 mx-auto" />
            <div className="text-sm font-bold text-blue-950">
              No audit records match your filters
            </div>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Try adjusting your search query or switching to All Events.
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
                    <div className="flex items-center gap-1 font-mono text-xs text-blue-900">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold">{item.qrCode}</span>
                    </div>
                  </div>
                  <h3 className="text-base font-black text-blue-950 leading-snug">
                    {item.toolName}
                  </h3>
                  {item.modelNumber && (
                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                      Model: {item.modelNumber}
                    </div>
                  )}
                </div>

                {/* Custody / Worker Detail if checkout */}
                {item.targetWorker && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold">
                      <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Custody Assigned To: <strong>{item.targetWorker}</strong>
                      </span>
                    </div>
                    {item.workerPhone && (
                      <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                        <Phone className="w-3 h-3 text-blue-500" />
                        <span>{item.workerPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Return Condition Badge if checkin */}
                {item.action === 'CHECKIN' && item.condition && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Return Condition: <strong className="uppercase">{item.condition}</strong>
                    </span>
                  </div>
                )}

                {/* Notes / Remarks */}
                {item.notes && (
                  <div className="text-xs text-blue-900 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 italic">
                    &ldquo;{item.notes}&rdquo;
                  </div>
                )}

                {/* Footer: Location & Performed By */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate max-w-[180px]">{item.warehouseName}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    By: <span className="text-blue-900 font-semibold">{item.performedBy}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 3. UNIVERSAL 4-TAB BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {/* 1. Scanner */}
          <Link
            href="/"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Scan className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Scanner</span>
          </Link>

          {/* 2. Catalog */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Layers className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Catalog</span>
          </Link>

          {/* 3. Audit History (ACTIVE) */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <HistoryIcon className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">History</span>
          </Link>

          {/* 4. Print QR Tags */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Printer className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Print Tags</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
