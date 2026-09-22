'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  X,
  Printer,
  CheckSquare,
  FileSignature,
  Loader2,
  RotateCcw,
  FileSpreadsheet,
  Filter,
  Check,
} from 'lucide-react';
import type {
  AuditHistoryPayload,
  AuditHistoryRecord,
  AuditActionType,
  AuditDateRange,
} from '@/lib/history/auditFilters';
import {
  isWithinDateRange,
  matchesSmartSearch,
} from '@/lib/history/auditFilters';
import AppLayout from '@/components/layout/AppLayout';
import ToolPassportModal from '@/components/modules/ToolPassportModal';

interface HistoryViewProps {
  initialData: AuditHistoryPayload;
}

type QuickChipId = 'all' | 'loans' | 'transfers' | 'maintenance' | 'signed' | 'today';

const ACTION_FILTERS: Array<{
  value: string;
  labelHe: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'all',
    labelHe: 'כל הפעולות',
    icon: <HistoryIcon className="w-3.5 h-3.5" />,
  },
  {
    value: 'CHECKOUT',
    labelHe: 'ניפוקים בשטח',
    icon: <UserCheck className="w-3.5 h-3.5" />,
  },
  {
    value: 'CHECKIN',
    labelHe: 'החזרות למחסן',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  {
    value: 'TRANSFERS',
    labelHe: 'העברות בין אתרים',
    icon: <Truck className="w-3.5 h-3.5" />,
  },
  {
    value: 'MAINTENANCE_FLAG',
    labelHe: 'קריאות שירות / תקלה',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  {
    value: 'ONBOARD',
    labelHe: 'רישום כלי חדש',
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
];

const DATE_RANGE_OPTIONS: Array<{ value: AuditDateRange; label: string }> = [
  { value: 'all', label: 'כל הזמנים' },
  { value: 'today', label: 'היום (משמרת נוכחית)' },
  { value: 'yesterday', label: 'אתמול' },
  { value: 'week', label: '7 ימים אחרונים' },
  { value: 'month', label: '30 ימים אחרונים' },
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
          <UserCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>ניפוק כלי (הוצאה לשימוש)</span>
        </span>
      );
    case 'CHECKIN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>החזרת כלי למחסן</span>
        </span>
      );
    case 'TRANSFER_INIT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-900 border border-indigo-300 shadow-sm">
          <Truck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>יציאה לשינוע (בין אתרים)</span>
        </span>
      );
    case 'TRANSFER_RECEIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-300 shadow-sm">
          <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>קליטת ציוד משינוע</span>
        </span>
      );
    case 'MAINTENANCE_FLAG':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-900 border border-rose-300 shadow-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>בתיקון / בדיקה</span>
        </span>
      );
    case 'ONBOARD':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span>רישום כלי ראשוני</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-slate-50 text-slate-800 border border-slate-300 shadow-sm">
          <span>{action}</span>
        </span>
      );
  }
}

export default function HistoryView({ initialData }: HistoryViewProps) {
  // Search & 300ms Debounce State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [isDebouncing, setIsDebouncing] = useState<boolean>(false);

  // Quick Filter Chips
  const [activeChip, setActiveChip] = useState<QuickChipId>('all');

  // Granular Filter Controls
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<AuditDateRange>('all');
  const [hasSignatureOnly, setHasSignatureOnly] = useState<boolean>(false);

  // Modals
  const [selectedReceiptRecord, setSelectedReceiptRecord] = useState<AuditHistoryRecord | null>(null);
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState<boolean>(false);
  const [selectedPassportTag, setSelectedPassportTag] = useState<string | null>(null);

  // 300ms Debounce Handler with Loading Indicator
  useEffect(() => {
    if (searchQuery === debouncedSearchQuery) {
      setIsDebouncing(false);
      return;
    }
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsDebouncing(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearchQuery]);

  // Interactive Click-to-Filter handler
  const handleQuickSearch = (term: string) => {
    setSearchQuery(term);
    setDebouncedSearchQuery(term);
    setIsDebouncing(false);
  };

  // Pre-calculate Quick Chip Counts across initial dataset
  const chipCounts = useMemo(() => {
    const records = initialData.records;
    return {
      all: records.length,
      loans: records.filter((r) => r.action === 'CHECKOUT').length,
      transfers: records.filter(
        (r) => r.action === 'TRANSFER_INIT' || r.action === 'TRANSFER_RECEIVE'
      ).length,
      maintenance: records.filter((r) => r.action === 'MAINTENANCE_FLAG').length,
      signed: records.filter((r) => Boolean(r.signatureData)).length,
      today: records.filter((r) => isWithinDateRange(r.createdAt, 'today')).length,
    };
  }, [initialData.records]);

  // Quick Chips Configuration
  const quickChips: Array<{
    id: QuickChipId;
    label: string;
    icon: React.ReactNode;
    count: number;
    activeClass: string;
  }> = [
    {
      id: 'all',
      label: 'הכל (All)',
      icon: <HistoryIcon className="w-3.5 h-3.5" />,
      count: chipCounts.all,
      activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20',
    },
    {
      id: 'loans',
      label: '📦 הנפקות פתוחות בשטח',
      icon: <UserCheck className="w-3.5 h-3.5" />,
      count: chipCounts.loans,
      activeClass: 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20',
    },
    {
      id: 'transfers',
      label: '🚚 שינוע בין אתרים',
      icon: <Truck className="w-3.5 h-3.5" />,
      count: chipCounts.transfers,
      activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20',
    },
    {
      id: 'maintenance',
      label: '🔧 קריאות תחזוקה',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      count: chipCounts.maintenance,
      activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20',
    },
    {
      id: 'signed',
      label: '✍️ מאומת בחתימה דיגיטלית',
      icon: <PenTool className="w-3.5 h-3.5" />,
      count: chipCounts.signed,
      activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20',
    },
    {
      id: 'today',
      label: "📅 תנועות היום (Today's Shift)",
      icon: <Calendar className="w-3.5 h-3.5" />,
      count: chipCounts.today,
      activeClass: 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/20',
    },
  ];

  // Filter records in-memory combining all criteria
  const filteredRecords = useMemo(() => {
    let list: AuditHistoryRecord[] = initialData.records;

    // 1. Quick Chip preset
    if (activeChip === 'loans') {
      list = list.filter((r) => r.action === 'CHECKOUT');
    } else if (activeChip === 'transfers') {
      list = list.filter(
        (r) => r.action === 'TRANSFER_INIT' || r.action === 'TRANSFER_RECEIVE'
      );
    } else if (activeChip === 'maintenance') {
      list = list.filter((r) => r.action === 'MAINTENANCE_FLAG');
    } else if (activeChip === 'signed') {
      list = list.filter((r) => Boolean(r.signatureData));
    } else if (activeChip === 'today') {
      list = list.filter((r) => isWithinDateRange(r.createdAt, 'today'));
    }

    // 2. Action Filter
    if (selectedAction !== 'all') {
      if (selectedAction === 'TRANSFERS') {
        list = list.filter(
          (r) => r.action === 'TRANSFER_INIT' || r.action === 'TRANSFER_RECEIVE'
        );
      } else {
        list = list.filter((r) => r.action === selectedAction);
      }
    }

    // 3. Facility / Warehouse Filter
    if (selectedWarehouseId !== 'all') {
      list = list.filter((r) => r.warehouseId === selectedWarehouseId);
    }

    // 4. Date Range Filter
    if (selectedDateRange !== 'all') {
      list = list.filter((r) => isWithinDateRange(r.createdAt, selectedDateRange));
    }

    // 5. Signature Only Toggle
    if (hasSignatureOnly) {
      list = list.filter((r) => Boolean(r.signatureData));
    }

    // 6. Multi-field Smart Search (Tool Tag / QR / Worker / Phone / Performed By / Notes)
    if (debouncedSearchQuery.trim()) {
      list = list.filter((r) => matchesSmartSearch(r, debouncedSearchQuery));
    }

    return list;
  }, [
    initialData.records,
    activeChip,
    selectedAction,
    selectedWarehouseId,
    selectedDateRange,
    hasSignatureOnly,
    debouncedSearchQuery,
  ]);

  // Detect whether any non-default filter is active
  const hasActiveFilters =
    Boolean(debouncedSearchQuery.trim()) ||
    activeChip !== 'all' ||
    selectedWarehouseId !== 'all' ||
    selectedAction !== 'all' ||
    selectedDateRange !== 'all' ||
    hasSignatureOnly;

  // Clear all active filters
  const handleClearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setActiveChip('all');
    setSelectedWarehouseId('all');
    setSelectedAction('all');
    setSelectedDateRange('all');
    setHasSignatureOnly(false);
    setIsDebouncing(false);
  };

  // Export Filtered Results to Excel CSV with UTF-8 BOM
  const handleExportCsv = () => {
    const headers = [
      'מזהה רשומה',
      'תאריך ושעה',
      'סוג תנועה',
      'ברקוד / תג QR',
      'שם הכלי',
      'יצרן',
      'דגם',
      'מתקן / אתר',
      'עובד מקבל / מחזיק',
      'טלפון עובד',
      'בוצע ע"י',
      'מצב הכלי',
      'חתימה דיגיטלית',
      'תג מאומת',
      'הערות',
    ];

    const rows = filteredRecords.map((r) => {
      let actionTitle = r.action as string;
      if (r.action === 'CHECKOUT') actionTitle = 'ניפוק כלי בשטח';
      else if (r.action === 'CHECKIN') actionTitle = 'החזרת כלי למחסן';
      else if (r.action === 'TRANSFER_INIT') actionTitle = 'יציאה לשינוע';
      else if (r.action === 'TRANSFER_RECEIVE') actionTitle = 'קליטת שינוע';
      else if (r.action === 'MAINTENANCE_FLAG') actionTitle = 'קריאת שירות / תיקון';
      else if (r.action === 'ONBOARD') actionTitle = 'רישום ראשוני';

      return [
        `"${r.id}"`,
        `"${new Date(r.createdAt).toLocaleString('he-IL')}"`,
        `"${actionTitle}"`,
        `"${r.qrCode}"`,
        `"${(r.toolName || '').replace(/"/g, '""')}"`,
        `"${(r.brand || '').replace(/"/g, '""')}"`,
        `"${(r.modelNumber || '').replace(/"/g, '""')}"`,
        `"${(r.warehouseName || '').replace(/"/g, '""')}"`,
        `"${(r.targetWorker || '').replace(/"/g, '""')}"`,
        `"${r.workerPhone || ''}"`,
        `"${(r.performedBy || '').replace(/"/g, '""')}"`,
        `"${getConditionLabel(r.condition || '')}"`,
        `"${r.signatureData ? 'כן (מאומת)' : 'ללא'}"`,
        `"${r.isTagVerified ? 'כן' : 'לא'}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `tooly_movement_history_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout
      title="Tooly - יומן תנועות ו-GPS"
      subtitle="מעקב כרונולוגי, איתור חכם וביקורת"
      requiredRole="any_elevated"
    >
      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {/* HEADER BAR: TITLE, ACTIONS & EXPORT */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-blue-100 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-blue-950 flex items-center gap-2">
              <HistoryIcon className="w-5 h-5 text-blue-600" />
              <span>יומן תנועות ואישורי מסירה</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              חיפוש מרובה שדות, סינון לפי תגי כלים, עובדים ואימותי חתימות
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="ייצא את הרשומות המסוננות לקובץ אקסל CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ייצוא CSV ({filteredRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfExportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-blue-950 border border-slate-300 font-black text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="הפק דוח מבוקר להדפסה או שמירה כ-PDF"
            >
              <Printer className="w-4 h-4 text-purple-600" />
              <span>הדפסת דוח / PDF</span>
            </button>
          </div>
        </div>

        {/* TOP QUICK-FILTER CHIPS BAR */}
        <div className="bg-white p-3 rounded-2xl border border-blue-100 shadow-sm space-y-2">
          <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-blue-500" />
              <span>סינון מהיר לפי סוג אירוע:</span>
            </span>
            <span className="font-mono text-blue-900 font-bold">
              {filteredRecords.length} / {initialData.records.length} רשומות
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {quickChips.map((chip) => {
              const isSelected = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setActiveChip(chip.id)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-black shrink-0 border transition-all flex items-center gap-2 cursor-pointer active:scale-95 ${
                    isSelected
                      ? chip.activeClass
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* OMNI-SEARCH & DETAILED FILTERS GRID */}
        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm space-y-3">
          {/* DEBOUNCED SEARCH INPUT WITH LIVE SPINNER */}
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש חכם: מספר תג (למשל 960), שם עובד, טלפון, מודל כלי, מנהל מבצע או הערות..."
              className="w-full min-h-[50px] bg-slate-50 text-blue-950 font-bold text-sm pr-10 pl-24 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none placeholder:text-slate-400 shadow-xs transition-colors"
            />
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {isDebouncing && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-200 animate-in fade-in">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>מחפש...</span>
                </div>
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                  title="נקה חיפוש"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* FACILITY, DATE & SIGNATURE DROPDOWNS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Warehouse Dropdown */}
            <div className="relative">
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full min-h-[44px] bg-white text-blue-950 font-bold text-xs pr-9 pl-7 py-2 rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-2xs"
              >
                <option value="all">כל האתרים והמחסנים</option>
                {initialData.warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code ? `[${wh.code}] ` : ''}
                    {wh.name}
                  </option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>

            {/* Date Range Dropdown */}
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
              <select
                value={selectedDateRange}
                onChange={(e) => setSelectedDateRange(e.target.value as AuditDateRange)}
                className="w-full min-h-[44px] bg-white text-blue-950 font-bold text-xs pr-9 pl-7 py-2 rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-2xs"
              >
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>

            {/* Signature Verified Only Toggle */}
            <button
              type="button"
              onClick={() => setHasSignatureOnly((prev) => !prev)}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                hasSignatureOnly
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FileSignature className="w-4 h-4 text-emerald-600" />
                <span>חתימה דיגיטלית בלבד</span>
              </span>
              <span
                className={`w-4 h-4 rounded flex items-center justify-center border ${
                  hasSignatureOnly
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {hasSignatureOnly && <Check className="w-3 h-3" />}
              </span>
            </button>
          </div>

          {/* ACTION SPECIFIC SUB-PILLS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-none">
            {ACTION_FILTERS.map((f) => {
              const isSelected = selectedAction === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setSelectedAction(f.value)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold shrink-0 border transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-950 text-white border-blue-950 shadow-xs font-black'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                  }`}
                >
                  {f.icon}
                  <span>{f.labelHe}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ACTIVE FILTERS BAR & CLEAR ALL */}
        {hasActiveFilters && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="font-black text-blue-950 text-[11px] ml-1">
                מסננים פעילים:
              </span>

              {debouncedSearchQuery.trim() && (
                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>חיפוש: &quot;{debouncedSearchQuery}&quot;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {activeChip !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>
                    צ&apos;יפ:{' '}
                    {quickChips.find((c) => c.id === activeChip)?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveChip('all')}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedWarehouseId !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>
                    אתר:{' '}
                    {initialData.warehouses.find(
                      (w) => w.id === selectedWarehouseId
                    )?.name || selectedWarehouseId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedWarehouseId('all')}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedAction !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>
                    פעולה:{' '}
                    {ACTION_FILTERS.find((a) => a.value === selectedAction)
                      ?.labelHe || selectedAction}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedAction('all')}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedDateRange !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>
                    טווח:{' '}
                    {DATE_RANGE_OPTIONS.find(
                      (d) => d.value === selectedDateRange
                    )?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDateRange('all')}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {hasSignatureOnly && (
                <span className="inline-flex items-center gap-1 bg-white border border-emerald-300 text-emerald-950 px-2.5 py-1 rounded-lg font-bold shadow-2xs">
                  <span>חתימה דיגיטלית בלבד</span>
                  <button
                    type="button"
                    onClick={() => setHasSignatureOnly(false)}
                    className="hover:text-red-600 cursor-pointer p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleClearAllFilters}
              className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-rose-100 hover:text-rose-800 text-blue-900 text-xs font-black flex items-center gap-1 cursor-pointer transition-colors"
              title="איפוס כל המסננים והחיפוש"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>איפוס סינון (Clear All)</span>
            </button>
          </div>
        )}

        {/* TIMELINE EVENT LIST */}
        {filteredRecords.length === 0 ? (
          <div className="p-10 rounded-2xl border-2 border-dashed border-blue-200 bg-white text-center space-y-3 shadow-sm">
            <FileText className="w-10 h-10 text-blue-400 mx-auto" />
            <div className="text-base font-black text-blue-950">
              לא נמצאו תנועות התואמות לחיפוש ולסינון
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              נסה לשנות את מילות החיפוש, לבטל את הסינון הנוכחי או לבחור ב&quot;הכל&quot;.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>נקה את כל המסננים</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecords.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-xs shadow-blue-950/5 space-y-3 hover:border-blue-300 transition-colors"
              >
                {/* Header: Action Badge & Timestamp */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {renderActionBadge(item.action)}
                    {item.isTagVerified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs">
                        <CheckSquare className="w-3 h-3 text-emerald-600" />
                        <span>תג מאומת</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Clock className="w-3 h-3 text-blue-500" />
                    <span>{formatTimestamp(item.createdAt)}</span>
                  </div>
                </div>

                {/* Tool Identity with Click-to-Filter on Badge & Name */}
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      {item.brand}
                    </span>

                    {/* Interactive Open Tool Passport & Lifecycle on Tool QR Tag */}
                    <button
                      type="button"
                      onClick={() => setSelectedPassportTag(item.qrCode)}
                      className="flex items-center gap-1 font-mono text-xs text-blue-900 bg-slate-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer group shadow-2xs"
                      title={`לחץ לפתיחת תיק כלי מלא והיסטוריית חיים עבור ${item.qrCode}`}
                      dir="ltr"
                    >
                      <QrCode className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                      <span className="font-bold underline decoration-blue-300">
                        {item.qrCode}
                      </span>
                    </button>
                  </div>

                  {/* Interactive Click-to-Filter on Tool Name */}
                  <button
                    type="button"
                    onClick={() => handleQuickSearch(item.toolName)}
                    className="text-right text-base font-black text-blue-950 leading-snug hover:text-blue-700 transition-colors cursor-pointer"
                    title={`סנן לפי שם הכלי: ${item.toolName}`}
                  >
                    {item.toolName}
                  </button>

                  {item.modelNumber && (
                    <div className="text-xs font-mono text-slate-500 mt-0.5" dir="ltr">
                      דגם: {item.modelNumber}
                    </div>
                  )}
                </div>

                {/* Custody / Worker Detail if checkout with Interactive Click-to-Filter */}
                {item.targetWorker && (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold">
                        <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          נמסר לעובד:{' '}
                          <button
                            type="button"
                            onClick={() => handleQuickSearch(item.targetWorker || '')}
                            className="font-black underline decoration-amber-400 hover:text-amber-950 transition-colors cursor-pointer"
                            title={`לחץ לסינון כל התנועות של העובד ${item.targetWorker}`}
                          >
                            {item.targetWorker}
                          </button>
                        </span>
                      </div>

                      {item.workerPhone && (
                        <button
                          type="button"
                          onClick={() => handleQuickSearch(item.workerPhone || '')}
                          className="flex items-center gap-1 text-slate-600 hover:text-blue-700 text-[11px] font-mono cursor-pointer transition-colors"
                          title="סנן לפי מספר טלפון זה"
                          dir="ltr"
                        >
                          <Phone className="w-3 h-3 text-blue-500" />
                          <span>{item.workerPhone}</span>
                        </button>
                      )}
                    </div>

                    {/* Return Date & Accessories & Signature Sub-strip */}
                    {(item.expectedReturnDate ||
                      item.accessoriesSnapshot ||
                      item.signatureData) && (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          {item.expectedReturnDate && (
                            <div className="flex items-center gap-1 font-bold text-blue-900">
                              <Calendar className="w-3.5 h-3.5 text-blue-600" />
                              <span>
                                מועד החזרה צפוי: {formatTimestamp(item.expectedReturnDate)}
                              </span>
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
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptRecord(item)}
                              className="py-1 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
                              title="לחץ לפתיחת שובר מסירה חתום"
                            >
                              <div className="h-5 w-12 bg-white rounded border border-blue-200 overflow-hidden flex items-center justify-center p-0.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.signatureData}
                                  alt="חתימת העובד"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </div>
                              <span className="flex items-center gap-1">
                                <FileSignature className="w-3 h-3 text-blue-600" />
                                <span>הצג שובר</span>
                              </span>
                            </button>
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
                  <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 font-medium space-y-1 shadow-2xs">
                    <div className="flex items-center gap-1.5 font-black text-amber-900 text-[11px]">
                      <FileText className="w-3.5 h-3.5 text-amber-700" />
                      <span>📝 הערת תנועה / תיעוד שטח:</span>
                    </div>
                    <p className="text-xs font-bold leading-relaxed whitespace-pre-wrap italic">
                      &ldquo;{item.notes}&rdquo;
                    </p>
                  </div>
                )}

                {/* Footer: Location, GPS Pin Link & Interactive Performed By */}
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
                        <span>
                          {item.gps.lat.toFixed(4)}, {item.gps.lng.toFixed(4)}
                        </span>
                      </a>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    בוצע ע&quot;י:{' '}
                    <button
                      type="button"
                      onClick={() => handleQuickSearch(item.performedBy)}
                      className="text-blue-900 font-semibold underline decoration-blue-200 hover:text-blue-700 cursor-pointer transition-colors"
                      title={`סנן פעולות שבוצעו ע״י ${item.performedBy}`}
                    >
                      {item.performedBy}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF AUDIT REPORT EXPORT PREVIEW MODAL */}
      {isPdfExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border-2 border-purple-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950 via-slate-900 to-blue-950 text-white flex items-center justify-between border-b border-purple-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 text-purple-300 flex items-center justify-center border border-white/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">
                      דוח ביקורת תנועות ציוד ומסירות
                    </h3>
                    <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded-full">
                      רשומות מסוננות ({filteredRecords.length})
                    </span>
                  </div>
                  <p className="text-xs text-purple-200 mt-0.5">
                    Tooly Fleet Management Systems • דוח רשמי לצורכי ביקורת, מעקב והנהלת חשבונות
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.print();
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>הדפס / שמור כ-PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPdfExportModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - Printable Document */}
            <div className="p-6 overflow-y-auto space-y-5 text-slate-800 printable-history-report">
              {/* Report Metadata Strip */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
                <div>
                  <span className="text-slate-500 block text-[10px]">תאריך ושעת הפקה:</span>
                  <span className="text-slate-900 font-mono text-sm">
                    {new Date().toLocaleString('he-IL')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">סה&quot;כ רשומות בדוח:</span>
                  <span className="text-purple-900 font-mono text-sm font-black">
                    {filteredRecords.length} מתוך {initialData.records.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">סטטוס סינון פעיל:</span>
                  <span className="text-blue-900">
                    {hasActiveFilters ? 'סינון מותאם אישית פעיל' : 'כלל תנועות המערכת'}
                  </span>
                </div>
              </div>

              {/* Table of Filtered Records */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-black">
                      <th className="p-2.5">תאריך/שעה</th>
                      <th className="p-2.5">סוג תנועה</th>
                      <th className="p-2.5">תג / QR</th>
                      <th className="p-2.5">כלי ודגם</th>
                      <th className="p-2.5">מקבל ציוד</th>
                      <th className="p-2.5">אתר / מחסן</th>
                      <th className="p-2.5">בוצע ע&quot;י</th>
                      <th className="p-2.5">הערות שטח</th>
                      <th className="p-2.5">חתימה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {formatTimestamp(rec.createdAt)}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {renderActionBadge(rec.action)}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-blue-900 whitespace-nowrap" dir="ltr">
                          {rec.qrCode}
                        </td>
                        <td className="p-2.5">
                          <div className="font-bold text-slate-900">{rec.toolName}</div>
                          <div className="text-[10px] text-slate-500">{rec.brand} {rec.modelNumber || ''}</div>
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">
                          {rec.targetWorker || '—'}
                          {rec.workerPhone && (
                            <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                              {rec.workerPhone}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-600">{rec.warehouseName}</td>
                        <td className="p-2.5 text-slate-600">{rec.performedBy}</td>
                        <td className="p-2.5 text-slate-700 italic max-w-[200px] truncate" title={rec.notes || ''}>
                          {rec.notes ? `"${rec.notes}"` : '—'}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {rec.signatureData ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              מאומת ✓
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">ללא</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
              <span className="text-xs text-slate-500">
                הדוח מוכן להדפסה ישירה בכל מדפסת או שמירה מקומית כקובץ PDF
              </span>
              <button
                type="button"
                onClick={() => setIsPdfExportModalOpen(false)}
                className="py-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer transition-all active:scale-95"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNED DELIVERY RECEIPT INSPECTION MODAL */}
      {selectedReceiptRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Receipt Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
                  <FileSignature className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">שובר מסירה וקבלת ציוד דיגיטלי</h3>
                  <p className="text-[11px] text-blue-200 font-mono" dir="ltr">
                    DOC-ID: {selectedReceiptRecord.id.slice(0, 12)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceiptRecord(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Verification Status Badge */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                {selectedReceiptRecord.isTagVerified ? (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>תג QR פיזי מאומת ומודבק על גבי הכלי</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold">
                    <span>ניפוק סטנדרטי</span>
                  </div>
                )}

                <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {formatTimestamp(
                      selectedReceiptRecord.signedAt || selectedReceiptRecord.createdAt
                    )}
                  </span>
                </div>
              </div>

              {/* Equipment Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  פרטי כלי העבודה
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="font-mono text-xs font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                        dir="ltr"
                      >
                        {selectedReceiptRecord.qrCode}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        {selectedReceiptRecord.brand}
                      </span>
                    </div>
                    <h4 className="text-base font-black text-slate-900">
                      {selectedReceiptRecord.toolName}
                    </h4>
                    {selectedReceiptRecord.modelNumber && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                        דגם: {selectedReceiptRecord.modelNumber}
                      </p>
                    )}
                  </div>
                  <div className="text-left text-xs font-bold text-slate-600">
                    <div>מתקן / אתר:</div>
                    <span className="text-slate-900">{selectedReceiptRecord.warehouseName}</span>
                  </div>
                </div>
              </div>

              {/* Recipient Details */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider block">
                  פרטי מקבל הציוד בשטח
                </span>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-700" />
                    <span className="font-black text-slate-900">
                      {selectedReceiptRecord.targetWorker || selectedReceiptRecord.performedBy}
                    </span>
                  </div>
                  {selectedReceiptRecord.workerPhone && (
                    <div className="flex items-center gap-1 font-mono font-bold text-slate-700" dir="ltr">
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span>{selectedReceiptRecord.workerPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Digital Signature Inspection Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-blue-600" />
                    <span>חתימה דיגיטלית של מקבל הציוד</span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    מאומת דיגיטלית ✓
                  </span>
                </div>

                <div className="w-full h-32 bg-white rounded-xl border-2 border-slate-300 flex items-center justify-center p-2 overflow-hidden shadow-inner">
                  {selectedReceiptRecord.signatureData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedReceiptRecord.signatureData}
                      alt="חתימת מקבל הציוד"
                      className="max-h-full max-w-full object-contain filter contrast-125"
                    />
                  ) : (
                    <span className="text-xs text-slate-400 font-bold">אין חתימה זמינה</span>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  הנני מאשר בזאת קבלת הכלי המפורט לעיל במצב תקין ומקבל אחריות מלאה להחזקתו, שימושו הבטוח והחזרתו למחסן.
                </p>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') window.print();
                }}
                className="py-2 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>הדפס שובר</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedReceiptRecord(null)}
                className="py-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer transition-all active:scale-95"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
      {/* DIGITAL TOOL PASSPORT & LIFECYCLE MODAL */}
      <ToolPassportModal
        isOpen={Boolean(selectedPassportTag)}
        assetTag={selectedPassportTag}
        onClose={() => setSelectedPassportTag(null)}
      />
    </AppLayout>
  );
}
