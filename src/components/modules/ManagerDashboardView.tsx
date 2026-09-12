'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  AlertTriangle,
  Users,
  UserPlus,
  CheckCircle2,
  Check,
  X,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { PlantManagerAnalyticsPayload } from '@/app/actions/dashboard';
import type { AppUser } from '@/types/domain';
import {
  getStorekeepersListAction,
  createStorekeeperAction,
  updateStorekeeperWarehouseAction,
  toggleUserActiveAction,
} from '@/app/actions/users';
import AppLayout from '@/components/layout/AppLayout';

interface ManagerDashboardViewProps {
  data: PlantManagerAnalyticsPayload;
}

export default function ManagerDashboardView({ data }: ManagerDashboardViewProps) {
  // Main Tab Navigation: Analytics vs User Management
  const [activeTab, setActiveTab] = useState<'analytics' | 'users'>('analytics');

  // Analytics Search Query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Storekeepers Management State
  const [storekeepers, setStorekeepers] = useState<AppUser[]>([]);
  const [isLoadingStorekeepers, setIsLoadingStorekeepers] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // New Storekeeper Form State
  const [newFullName, setNewFullName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPinCode, setNewPinCode] = useState<string>('');
  const [newAssignedWarehouseId, setNewAssignedWarehouseId] = useState<string>(
    data.facilityDistribution[0]?.warehouseId || 'wh-main-01'
  );
  const [isSavingUser, setIsSavingUser] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load storekeepers list
  const loadStorekeepers = useCallback(async () => {
    setIsLoadingStorekeepers(true);
    try {
      const list = await getStorekeepersListAction();
      setStorekeepers(list);
    } catch (err) {
      console.warn('Error loading storekeepers:', err);
    } finally {
      setIsLoadingStorekeepers(false);
    }
  }, []);

  // Fetch storekeepers whenever User tab is opened
  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        void loadStorekeepers();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loadStorekeepers]);

  // Handle warehouse reassignment
  const handleWarehouseReassign = async (userId: string, newWarehouseId: string) => {
    try {
      const res = await updateStorekeeperWarehouseAction(userId, newWarehouseId);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'שיוך המחסן עודכן בהצלחה',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בעדכון שיוך המחסן',
          type: 'error',
        });
      }
    } catch {
      setFeedbackMessage({ text: 'שגיאה בעדכון שיוך המחסן', type: 'error' });
    }
  };

  // Handle user active toggle
  const handleToggleActive = async (userId: string, currentStatus?: boolean) => {
    const newStatus = !(currentStatus ?? true);
    try {
      const res = await toggleUserActiveAction(userId, newStatus);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'סטטוס המשתמש עודכן',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בעדכון סטטוס המשתמש',
          type: 'error',
        });
      }
    } catch {
      setFeedbackMessage({ text: 'שגיאה בעדכון סטטוס המשתמש', type: 'error' });
    }
  };

  // Handle create new storekeeper
  const handleCreateStorekeeper = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSavingUser(true);

    try {
      const res = await createStorekeeperAction({
        fullName: newFullName,
        username: newUsername,
        pinCode: newPinCode,
        assignedWarehouseId: newAssignedWarehouseId,
      });

      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'מחסנאי חדש נוצר בהצלחה',
          type: 'success',
        });
        setNewFullName('');
        setNewUsername('');
        setNewPinCode('');
        setIsAddModalOpen(false);
        await loadStorekeepers();
      } else {
        setFormError(res.error || 'שגיאה ביצירת המחסנאי');
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'שגיאה ביצירת המחסנאי');
    } finally {
      setIsSavingUser(false);
    }
  };

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
    <AppLayout
      title="Tooly - מנהל מפעל ופרויקטים"
      subtitle="לוח בקרה ניהולי ובקרת ציוד"
      requiredRole="admin"
    >
      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block p-4 border-b border-slate-300 mb-4 text-center">
        <h1 className="text-xl font-black">Tooly — דוח בקרה ניהולי למנהל מפעל</h1>
        <p className="text-xs text-slate-600">
          הופק בתאריך {new Date().toLocaleDateString('he-IL')} בשעה{' '}
          {new Date().toLocaleTimeString('he-IL')}
        </p>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {/* Navigation Tab Switcher */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-purple-950 shadow-sm border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span>📊 סקירה, מדדי ביצוע ואיחורים</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-purple-950 shadow-sm border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-purple-600" />
            <span>👥 ניהול משתמשים ומחסנאים (Storekeeper Access Control)</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-red-50 border-red-300 text-red-950'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: ANALYTICS & FLEET METRICS                             */}
        {/* ============================================================ */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 4 SUMMARY KPI CARDS */}
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
                <div className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md inline-block">
                  {data.utilization.inUse} מתוך {data.utilization.totalAssets} בכלים בשימוש
                </div>
              </div>

              {/* KPI 3: Safety Compliance */}
              <div className="p-4 rounded-2xl bg-white border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    תאימות בטיחות
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-purple-950">
                  {data.safetyCompliance.complianceRate}%
                </div>
                <div className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md inline-block">
                  {data.safetyCompliance.lockedCount} כלים נעולים / בדיקה
                </div>
              </div>

              {/* KPI 4: Monthly Damage Cost */}
              <div className="p-4 rounded-2xl bg-white border-2 border-amber-100 shadow-sm hover:border-amber-300 transition-all space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    עלות נזקים חודשית
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                    <Wrench className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-900">
                  ₪{data.monthlyDamageCost.toLocaleString()}
                </div>
                <div className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-block">
                  הערכת עלויות תיקונים
                </div>
              </div>
            </div>

            {/* SITE INVENTORY BREAKDOWN */}
            <div className="p-5 rounded-2xl bg-white border-2 border-blue-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-blue-950 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>התפלגות ציוד לפי אתרים ומחסנים</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    פירוט נפח פעילות, כלים מושאלים וסטטוס בכל מתקן
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.facilityDistribution.map((fac) => (
                  <div
                    key={fac.warehouseId}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-blue-950">{fac.warehouseName}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                        {fac.warehouseCode}
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

            {/* OVERDUE ASSETS TABLE */}
            <div className="p-5 rounded-2xl bg-white border-2 border-rose-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-rose-950 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>כלים באיחור החזרה - סיכון אובדן</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    רשימת הכלים שלא הוחזרו בתום מועד ההשאלה עם פרטי התקשרות לעובדים
                  </p>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>ייצוא לאקסל (CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all shadow-sm cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>הדפסת דוח</span>
                  </button>
                </div>
              </div>

              {/* Search filter */}
              <div className="relative print:hidden">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
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
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: STOREKEEPER ACCESS CONTROL & WAREHOUSE SCOPING        */}
        {/* ============================================================ */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Add Button */}
            <div className="p-5 rounded-2xl bg-white border-2 border-purple-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-black text-purple-950">
                    בקרת גישה ושיוך מחסנים למחסנאים
                  </h2>
                </div>
                <p className="text-xs text-slate-500">
                  כל מחסנאי מורשה משויך בלעדית למחסן פעיל. פעולות ניפוק והעברה מוגבלות לכלי המחסן שלו בלבד.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>➕ הוספת מחסנאי חדש</span>
                </button>
              </div>
            </div>

            {/* Add Storekeeper Modal / Panel */}
            {isAddModalOpen && (
              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-4 border-b border-purple-200 pb-3">
                  <div className="flex items-center gap-2 font-black text-sm text-purple-950">
                    <UserPlus className="w-4 h-4 text-purple-700" />
                    <span>טופס רישום מחסנאי מורשה חדש</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setFormError(null);
                    }}
                    className="p-1 rounded-lg hover:bg-purple-200 text-purple-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateStorekeeper} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        שם מלא של המחסנאי <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        placeholder="לדוגמה: ירון כהן"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        שם משתמש לכניסה (Username) <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="לדוגמה: yaron"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        קוד כניסה סודי (PIN - 4 ספרות) <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        value={newPinCode}
                        onChange={(e) => setNewPinCode(e.target.value)}
                        placeholder="לדוגמה: 4321"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        מחסן / אתר באחריות <span className="text-purple-600">*</span>:
                      </label>
                      <select
                        value={newAssignedWarehouseId}
                        onChange={(e) => setNewAssignedWarehouseId(e.target.value)}
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-purple-600 focus:outline-none"
                      >
                        {data.facilityDistribution.map((fac) => (
                          <option key={fac.warehouseId} value={fac.warehouseId}>
                            {fac.warehouseName} [{fac.warehouseCode}]
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="py-2.5 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUser}
                      className="py-2.5 px-5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingUser ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>שומר במערכת...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>הוסף מחסנאי למערכת</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Storekeepers Table */}
            <div className="p-5 rounded-2xl bg-white border-2 border-purple-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-purple-950 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-700" />
                    <span>רשימת מחסנאי שטח מורשים ({storekeepers.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    עדכון שיוך מחסנים בזמן אמת, שינוי סטטוס חשבון ובקרת תפעול
                  </p>
                </div>

                {isLoadingStorekeepers && (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-purple-50 text-purple-950 font-black border-b border-purple-100">
                    <tr>
                      <th className="p-3.5">שם מלא</th>
                      <th className="p-3.5">שם משתמש</th>
                      <th className="p-3.5">קוד כניסה (PIN)</th>
                      <th className="p-3.5">מחסן משויך (הגבלת פעילות)</th>
                      <th className="p-3.5">סטטוס</th>
                      <th className="p-3.5 text-center">פעולות הנהלה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {storekeepers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                          לא נמצאו מחסנאים במערכת
                        </td>
                      </tr>
                    ) : (
                      storekeepers.map((sk) => {
                        const isActive = sk.isActive ?? true;
                        return (
                          <tr
                            key={sk.id}
                            className={`hover:bg-purple-50/30 transition-colors ${
                              !isActive ? 'opacity-60 bg-slate-50' : ''
                            }`}
                          >
                            <td className="p-3.5 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-purple-600" />
                                <span>{sk.fullName}</span>
                              </div>
                            </td>
                            <td className="p-3.5 font-mono text-slate-600" dir="ltr">
                              {sk.username || '—'}
                            </td>
                            <td className="p-3.5 font-mono font-bold text-purple-800" dir="ltr">
                              •••• ({sk.pinCode})
                            </td>
                            <td className="p-3.5">
                              {/* Reassign Warehouse Dropdown */}
                              <div className="relative inline-block">
                                <select
                                  value={sk.assignedWarehouseId || ''}
                                  onChange={(e) =>
                                    handleWarehouseReassign(sk.id, e.target.value)
                                  }
                                  className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:border-purple-600 focus:outline-none cursor-pointer"
                                >
                                  {data.facilityDistribution.map((fac) => (
                                    <option key={fac.warehouseId} value={fac.warehouseId}>
                                      {fac.warehouseName} [{fac.warehouseCode}]
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-300'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {isActive ? 'פעיל ומורשה' : 'מושבת'}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(sk.id, sk.isActive)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                }`}
                                title={isActive ? 'השבת מחסנאי' : 'הפעל מחסנאי'}
                              >
                                {isActive ? 'השבת גישה' : 'הפעל מחדש'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
