'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  Building2,
  User,
  Phone,
  Clock,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Wrench,
  Sparkles,
  Loader2,
  X,
  Calendar,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import {
  getFleetNotesFeedAction,
  type FleetNoteItem,
  type FleetNotesFeedFilters,
} from '@/app/actions/history';
import type { WarehouseOption } from '@/app/actions/dashboard';
import { useAuth } from '@/context/AuthContext';

interface ChiefNotesFeedViewProps {
  warehouses?: WarehouseOption[];
  onOpenPassport?: (qrCode: string) => void;
}

type NoteTypeFilter = 'ALL' | 'CHECKOUT' | 'CHECKIN' | 'TRANSFERS' | 'MAINTENANCE';

export default function ChiefNotesFeedView({
  warehouses = [],
  onOpenPassport,
}: ChiefNotesFeedViewProps) {
  const { currentOrganization } = useAuth();
  const orgId = currentOrganization?.id;

  const [notes, setNotes] = useState<FleetNoteItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<NoteTypeFilter>('ALL');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadFeed = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const filters: FleetNotesFeedFilters = {
          query: searchQuery.trim() || undefined,
          type: selectedType,
          warehouseId: selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined,
        };
        const res = await getFleetNotesFeedAction(filters, orgId);
        setNotes(res.notes);
      } catch (err) {
        console.warn('Error loading fleet notes feed:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [searchQuery, selectedType, selectedWarehouseId, orgId]
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  // Client-side quick search for instant latency-free feedback
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase().trim();
    return notes.filter(
      (n) =>
        n.notes.toLowerCase().includes(q) ||
        n.qrCode.toLowerCase().includes(q) ||
        n.toolName.toLowerCase().includes(q) ||
        n.brand.toLowerCase().includes(q) ||
        (n.workerName && n.workerName.toLowerCase().includes(q)) ||
        (n.performedBy && n.performedBy.toLowerCase().includes(q)) ||
        n.warehouseName.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredNotes.length === 0) return;
    const headers = [
      'מזהה',
      'תאריך ושעה',
      'סוג פעולה',
      'תג כלי',
      'שם כלי',
      'מותג',
      'מחסן/אתר',
      'עובד מקבל',
      'טלפון עובד',
      'מנפק/אחראי',
      'הערה/דיווח',
    ];

    const rows = filteredNotes.map((n) => [
      n.id,
      new Date(n.createdAt).toLocaleString('he-IL'),
      n.action,
      n.qrCode,
      n.toolName,
      n.brand,
      n.warehouseName,
      n.workerName || '',
      n.workerPhone || '',
      n.performedBy,
      `"${n.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tooly_field_notes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export / Print View
  const handlePrint = () => {
    window.print();
  };

  const getTypeStyle = (action: string) => {
    switch (action) {
      case 'CHECKOUT':
        return {
          badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
          badgeText: 'הערת ניפוק',
          calloutBg: 'bg-blue-50/70 border-blue-200 text-blue-950',
          accentColor: 'text-blue-700',
          icon: <FileText className="w-3.5 h-3.5 text-blue-600" />,
        };
      case 'CHECKIN':
        return {
          badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          badgeText: 'הערת החזרה / תקינות',
          calloutBg: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
          accentColor: 'text-emerald-700',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
        };
      case 'TRANSFER_INIT':
      case 'TRANSFER_RECEIVE':
      case 'TRANSFER':
        return {
          badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
          badgeText: 'הערת שינוע שטח',
          calloutBg: 'bg-purple-50/70 border-purple-200 text-purple-950',
          accentColor: 'text-purple-700',
          icon: <Truck className="w-3.5 h-3.5 text-purple-600" />,
        };
      case 'MAINTENANCE_FLAG':
      case 'MAINTENANCE':
        return {
          badgeBg: 'bg-amber-50 text-amber-900 border-amber-300',
          badgeText: 'דיווח תקלה / תיקון',
          calloutBg: 'bg-amber-50/90 border-amber-300 text-amber-950',
          accentColor: 'text-amber-800',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
        };
      default:
        return {
          badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
          badgeText: 'הערת תיעוד',
          calloutBg: 'bg-slate-50 border-slate-200 text-slate-900',
          accentColor: 'text-slate-700',
          icon: <FileText className="w-3.5 h-3.5 text-slate-500" />,
        };
    }
  };

  return (
    <div className="bg-white border-2 border-indigo-200/90 rounded-3xl p-5 shadow-sm space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                מרכז הערות ותיעוד שטח
              </h3>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200 font-mono" dir="ltr">
                Field Notes Feed
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ריכוז חי וקבוע של כלל הערות הניפוק, דוחות הנזק, יומני השינוע ודברי העובדים במעמד מסירת ציוד
            </p>
          </div>
        </div>

        {/* TOP ACTIONS */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadFeed(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="רענן הזנה"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">רענן</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredNotes.length === 0}
            className="py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="ייצוא קובץ CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={filteredNotes.length === 0}
            className="py-1.5 px-3 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="הדפסה / שמירה כ-PDF"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            <span>הדפס</span>
          </button>
        </div>
      </div>

      {/* SEARCH AND FILTER CONTROLS */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* Live Search Input */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש חופשי בהערות: מילים (כבל, תקלה, דיסק, פגום), מספר תג כלי, עובד, מחסן..."
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-2xl pr-10 pl-9 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Warehouse Dropdown */}
          <div className="relative">
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none transition-all cursor-pointer shadow-xs"
            >
              <option value="all">🏢 כלל המחסנים והאתרים</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} {wh.code ? `(${wh.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Type Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedType('ALL')}
            className={`py-1.5 px-3 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedType === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>📑 כל ההערות</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-mono">
              {notes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('CHECKOUT')}
            className={`py-1.5 px-3 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedType === 'CHECKOUT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            <span>📝 הערות ניפוק (Checkouts)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('MAINTENANCE')}
            className={`py-1.5 px-3 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedType === 'MAINTENANCE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <span>⚠️ דיווחי תקלות ונזק</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('TRANSFERS')}
            className={`py-1.5 px-3 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedType === 'TRANSFERS'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <span>🚚 הערות שינוע בין אתרים</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('CHECKIN')}
            className={`py-1.5 px-3 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedType === 'CHECKIN'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span>✅ הערות קליטה והחזרה</span>
          </button>
        </div>
      </div>

      {/* NOTES LIST FEED */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-xs font-bold text-slate-500">טוען יומן הערות שטח מכלל הארגון...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-10 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex flex-col items-center justify-center gap-2">
          <FileText className="w-8 h-8 text-slate-300" />
          <span>לא נמצאו הערות שטח תואמות לסינון המבוקש</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-indigo-600 underline font-bold mt-1 cursor-pointer"
            >
              נקה חיפוש
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between px-1">
            <span>מציג {filteredNotes.length} הערות מתועדות</span>
            <span>מסודר לפי האירוע האחרון</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredNotes.map((item) => {
              const style = getTypeStyle(item.action);

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3 group"
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Tool Tag, Model, Action Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenPassport?.(item.qrCode)}
                            className="font-mono text-[11px] font-black text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1 group/btn shadow-2xs"
                            title={`לחץ לפתיחת תיק כלי מלא עבור ${item.qrCode}`}
                            dir="ltr"
                          >
                            <QrCode className="w-3 h-3 text-indigo-600 group-hover/btn:scale-110 transition-transform" />
                            <span className="underline decoration-indigo-300">{item.qrCode}</span>
                          </button>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{item.warehouseName}</span>
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 mt-1">
                          {item.toolName}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {item.brand} {item.modelNumber ? `• ${item.modelNumber}` : ''}
                        </p>
                      </div>

                      {/* Action Pill */}
                      <span
                        className={`text-[10px] font-black px-2 py-1 rounded-lg border flex items-center gap-1 shrink-0 ${style.badgeBg}`}
                      >
                        {style.icon}
                        <span>{style.badgeText}</span>
                      </span>
                    </div>

                    {/* Prominent Styled Note Callout Box */}
                    <div
                      className={`p-3 rounded-xl border text-xs font-medium space-y-1 shadow-2xs ${style.calloutBg}`}
                    >
                      <div className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${style.accentColor}`}>
                        <FileText className="w-3 h-3" />
                        <span>תוכן ההערה / דיווח שטח:</span>
                      </div>
                      <p className="text-xs font-bold leading-relaxed whitespace-pre-wrap">
                        &ldquo;{item.notes}&rdquo;
                      </p>
                    </div>

                    {/* Worker & Operator Badges */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-0.5">
                      {item.workerName && (
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <User className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>עובד: {item.workerName}</span>
                          </div>
                          {item.workerPhone && (
                            <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                              {item.workerPhone}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1.5 text-[11px] text-slate-600 font-bold">
                        <span className="text-slate-400 font-normal">נרשם ע&quot;י:</span>
                        <span className="text-slate-900 truncate">{item.performedBy}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Timestamp */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span dir="ltr">
                        {new Date(item.createdAt).toLocaleDateString('he-IL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpenPassport?.(item.qrCode)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>פתח תיק כלי מלא</span>
                      <span dir="ltr">&larr;</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
