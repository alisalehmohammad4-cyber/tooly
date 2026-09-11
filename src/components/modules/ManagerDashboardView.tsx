'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Wrench,
  Building2,
  Calendar,
  Phone,
  FileSpreadsheet,
  Printer,
  Search,
  ArrowRight,
  Layers,
  Scan,
  History as HistoryIcon,
  Warehouse as WarehouseIcon,
  AlertTriangle,
} from 'lucide-react';
import type { PlantManagerAnalyticsPayload } from '@/app/actions/dashboard';
import UserRoleHeaderPill from '@/components/common/UserRoleHeaderPill';

interface ManagerDashboardViewProps {
  data: PlantManagerAnalyticsPayload;
}

export default function ManagerDashboardView({ data }: ManagerDashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter overdue assets
  const filteredOverdue = useMemo(() => {
    if (!searchQuery.trim()) return data.highRiskOverdueAssets;
    const q = searchQuery.toLowerCase().trim();
    return data.highRiskOverdueAssets.filter(
      (item) =>
        item.toolName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.qrCode.toLowerCase().includes(q) ||
        item.workerName.toLowerCase().includes(q) ||
        (item.workerPhone && item.workerPhone.includes(q)) ||
        item.warehouseName.toLowerCase().includes(q)
    );
  }, [data.highRiskOverdueAssets, searchQuery]);

  // Export Overdue Table to Excel CSV with UTF-8 BOM for proper Hebrew encoding
  const handleExportCsv = () => {
    const headers = [
      'שם הכלי',
      'יצרן',
      'דגם',
      'ברקוד/QR',
      'עובד אחראי',
      'טלפון עובד',
      'אתר שיוך',
      'תאריך החזרה צפוי',
      'ימי איחור',
      'שווי כספי (₪)',
    ];

    const rows = filteredOverdue.map((item) => [
      `"${item.toolName.replace(/"/g, '""')}"`,
      `"${item.brand.replace(/"/g, '""')}"`,
      `"${(item.modelNumber || '').replace(/"/g, '""')}"`,
      `"${item.qrCode}"`,
      `"${item.workerName.replace(/"/g, '""')}"`,
      `"${item.workerPhone || ''}"`,
      `"${item.warehouseName.replace(/"/g, '""')}"`,
      `"${new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}"`,
      item.daysOverdue,
      item.purchaseCost,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `tooly_overdue_report_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Report Handler
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-blue-950 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm print:hidden">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
              title="חזרה לסורק"
            >
              <ArrowRight className="w-5 h-5" />
            </Link>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-blue-600 font-extrabold flex items-center gap-1.5">
                <span>מנהל מפעל ופרויקטים</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span>EXECUTIVE ANALYTICS</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-blue-950 leading-tight">
                לוח בקרה ניהולי ובקרת ציוד
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/warehouse"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition-all"
            >
              <WarehouseIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>עמדת מחסנאי</span>
            </Link>
            <UserRoleHeaderPill />
          </div>
        </div>
      </header>

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block p-4 border-b border-slate-300 mb-4 text-center">
        <h1 className="text-xl font-black">Tooly — דוח בקרה ניהולי למנהל מפעל</h1>
        <p className="text-xs text-slate-600">
          הופק בתאריך {new Date().toLocaleDateString('he-IL')} בשעה{' '}
          {new Date().toLocaleTimeString('he-IL')}
        </p>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {/* 2. 4 SUMMARY KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* KPI 1: Fleet Value */}
          <div className="p-4 rounded-2xl bg-white border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                שווי כולל של הציוד
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-950">
              ₪{data.totalFleetValue.toLocaleString()}
            </div>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
              {data.utilization.totalAssets} כלי עבודה רשומים
            </div>
          </div>

          {/* KPI 2: Fleet Utilization */}
          <div className="p-4 rounded-2xl bg-white border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                ניצולת ציוד בשטח
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-950">
              {data.utilization.utilizationRate}%
            </div>
            <div className="text-xs text-slate-600 font-medium">
              <strong className="text-blue-900 font-bold">{data.utilization.inUse}</strong> בשימוש |{' '}
              <strong className="text-emerald-700 font-bold">{data.utilization.inWarehouse}</strong> במחסן
            </div>
          </div>

          {/* KPI 3: Safety & Calibrations */}
          <div className="p-4 rounded-2xl bg-white border-2 border-rose-100 shadow-sm hover:border-rose-300 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                התרעות בטיחות וכיול
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-600">
              {data.safetyCompliance.overdueCount + data.safetyCompliance.lockedCount}
            </div>
            <div className="text-xs font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md inline-block">
              {data.safetyCompliance.overdueCount} פגי תוקף &bull; {data.safetyCompliance.lockedCount} נעולים
            </div>
          </div>

          {/* KPI 4: Monthly Damage Cost */}
          <div className="p-4 rounded-2xl bg-white border-2 border-amber-100 shadow-sm hover:border-amber-300 transition-all space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                עלות נזקים החודש
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                <Wrench className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-950">
              ₪{data.monthlyDamageCost.toLocaleString()}
            </div>
            <div className="text-xs text-amber-900 font-bold bg-amber-50 px-2 py-0.5 rounded-md inline-block">
              מבוסס דוחות אירוע נזק
            </div>
          </div>
        </div>

        {/* 3. FACILITY DISTRIBUTION GRID */}
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-black text-blue-950">
                התפלגות ציוד לפי אתרים, מכולות ורכבים
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-bold">
              {data.facilityDistribution.length} אתרים פעילים
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {data.facilityDistribution.map((fac) => (
              <div
                key={fac.warehouseId}
                className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      {fac.warehouseCode}
                    </span>
                    <h3 className="text-sm font-black text-blue-950 mt-1">
                      {fac.warehouseName}
                    </h3>
                  </div>
                  <span className="text-xs font-black text-blue-900 bg-white px-2 py-1 rounded-lg border border-slate-200">
                    {fac.totalAssets} כלים
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>ניצולת פעילה</span>
                    <span>{fac.utilizationRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${fac.utilizationRate}%` }}
                      className="bg-blue-600 h-full transition-all"
                    />
                  </div>
                </div>

                {/* Breakdown pills */}
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-bold pt-1">
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">זמינים</div>
                    <div className="text-emerald-700 font-black">{fac.available}</div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">בשטח</div>
                    <div className="text-blue-900 font-black">{fac.checkedOut}</div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">בתיקון</div>
                    <div className="text-rose-600 font-black">{fac.maintenance}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. HIGH-RISK OVERDUE ASSETS TABLE & EXPORT */}
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <div>
                <h2 className="text-base font-black text-blue-950">
                  טבלת כלים בסיכון גבוה (איחור בהחזרה)
                </h2>
                <p className="text-xs text-slate-500">
                  מעקב חריגות וכלים שמועד החזרתם המשוער חלף
                </p>
              </div>
            </div>

            {/* Actions: Search, Excel Export & Print */}
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="ייצוא קובץ Excel (CSV בעברית)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>ייצוא לאקסל</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                title="הדפסת דוח"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span>הדפסה</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative print:hidden">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפש לפי שם כלי, עובד, טלפון, ברקוד או אתר..."
              className="w-full bg-slate-50 text-blue-950 text-xs font-bold pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Table */}
          {filteredOverdue.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
              אין כלים באיחור התואמים את החיפוש
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <tr>
                    <th className="p-3">כלי עבודה</th>
                    <th className="p-3">ברקוד/QR</th>
                    <th className="p-3">עובד אחראי</th>
                    <th className="p-3">טלפון</th>
                    <th className="p-3">אתר שיוך</th>
                    <th className="p-3">מועד צפוי</th>
                    <th className="p-3">ימי איחור</th>
                    <th className="p-3">שווי (₪)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredOverdue.map((item) => (
                    <tr key={item.assetId} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 font-bold text-blue-950">
                        <div>{item.toolName}</div>
                        <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                          {item.brand} {item.modelNumber ? `• ${item.modelNumber}` : ''}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-800" dir="ltr">
                        {item.qrCode}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{item.workerName}</td>
                      <td className="p-3 font-mono text-slate-600" dir="ltr">
                        {item.workerPhone ? (
                          <a
                            href={`tel:${item.workerPhone}`}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-blue-500" />
                            <span>{item.workerPhone}</span>
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-slate-700">{item.warehouseName}</td>
                      <td className="p-3 text-slate-600">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>
                            {new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                          +{item.daysOverdue} ימים
                        </span>
                      </td>
                      <td className="p-3 font-black text-slate-900">
                        ₪{item.purchaseCost.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 5. UNIVERSAL BOTTOM NAVIGATION */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg print:hidden"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          <Link
            href="/"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors"
          >
            <Scan className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">סורק / ניפוק</span>
          </Link>

          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors"
          >
            <Layers className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">קטלוג ומלאי</span>
          </Link>

          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors"
          >
            <HistoryIcon className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">יומן תנועות</span>
          </Link>

          <Link
            href="/dashboard/warehouse"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors"
          >
            <WarehouseIcon className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">עמדת מחסנאי</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
