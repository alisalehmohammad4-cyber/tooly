'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  Building2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Wrench,
  Activity,
  LogOut,
  RefreshCw,
  Search,
  Phone,
  Mail,
  Calendar,
  Lock,
  Loader2,
  Check,
  X,
  ExternalLink,
  ChevronLeft,
  Power,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isPlatformSuperAdmin } from '@/lib/auth/superadmin';
import type { Organization, OrganizationStatus } from '@/types/domain';
import {
  getPendingOrganizationsAction,
  approveOrganizationAction,
  rejectOrganizationAction,
  getAllOrganizationsAdminAction,
  getPlatformMetricsAction,
  toggleOrganizationStatusAction,
  type AdminOrganizationListItem,
  type PlatformMetrics,
} from '@/app/actions/organizations';

export default function SuperAdminDashboardView() {
  const router = useRouter();
  const { user, isSuperAdmin: contextIsSuperAdmin, switchToWorker } = useAuth();
  const isSuperAdmin = contextIsSuperAdmin || isPlatformSuperAdmin(user);

  // Data States
  const [metrics, setMetrics] = useState<PlatformMetrics>({
    totalOrganizations: 0,
    totalActiveOrganizations: 0,
    pendingApprovalsCount: 0,
    totalAssetsCount: 0,
    totalActiveLoansCount: 0,
    totalUsersCount: 0,
  });
  const [pendingOrgs, setPendingOrgs] = useState<Organization[]>([]);
  const [allOrgs, setAllOrgs] = useState<AdminOrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Action states
  const [approvingOrgId, setApprovingOrgId] = useState<string | null>(null);
  const [rejectingOrgId, setRejectingOrgId] = useState<string | null>(null);
  const [togglingOrgId, setTogglingOrgId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Security Check: strictly platform superadmins
  useEffect(() => {
    if (!isSuperAdmin) {
      const timer = setTimeout(() => {
        router.replace('/');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isSuperAdmin, router]);

  // Load all platform data
  const loadPlatformData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pendingRes, allOrgsRes, metricsRes] = await Promise.all([
        getPendingOrganizationsAction(),
        getAllOrganizationsAdminAction(),
        getPlatformMetricsAction(),
      ]);

      if (pendingRes.success && Array.isArray(pendingRes.organizations)) {
        setPendingOrgs(pendingRes.organizations);
      }
      if (allOrgsRes.success && Array.isArray(allOrgsRes.organizations)) {
        setAllOrgs(allOrgsRes.organizations);
      }
      if (metricsRes.success && metricsRes.metrics) {
        setMetrics(metricsRes.metrics);
      }
    } catch (err) {
      console.warn('Failed to load SuperAdmin dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      void loadPlatformData();
    }
  }, [isSuperAdmin, loadPlatformData]);

  // Handle Approve Organization
  const handleApprove = async (orgId: string, orgName: string) => {
    setApprovingOrgId(orgId);
    // Optimistic update
    setPendingOrgs((prev) => prev.filter((o) => o.id !== orgId));
    try {
      const res = await approveOrganizationAction(orgId, user?.id);
      if (res.success) {
        setFeedback({ text: res.message || `הארגון "${orgName}" אושר בהצלחה!`, type: 'success' });
      } else {
        setFeedback({ text: res.error || 'שגיאה באישור הארגון', type: 'error' });
      }
      await loadPlatformData();
    } catch {
      setFeedback({ text: 'שגיאת רשת באישור הארגון', type: 'error' });
      await loadPlatformData();
    } finally {
      setApprovingOrgId(null);
    }
  };

  // Handle Reject Organization
  const handleReject = async (orgId: string, orgName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך לדחות את בקשת ההצטרפות של ארגון "${orgName}"?`)) {
      return;
    }
    setRejectingOrgId(orgId);
    setPendingOrgs((prev) => prev.filter((o) => o.id !== orgId));
    try {
      const res = await rejectOrganizationAction(orgId);
      if (res.success) {
        setFeedback({ text: res.message || `בקשת הארגון "${orgName}" נדחתה.`, type: 'success' });
      } else {
        setFeedback({ text: res.error || 'שגיאה בדחיית הארגון', type: 'error' });
      }
      await loadPlatformData();
    } catch {
      setFeedback({ text: 'שגיאת רשת בדחיית הארגון', type: 'error' });
      await loadPlatformData();
    } finally {
      setRejectingOrgId(null);
    }
  };

  // Handle Toggle Organization Status (Active <-> Suspended)
  const handleToggleStatus = async (orgId: string, currentStatus: OrganizationStatus, orgName: string) => {
    const nextStatus: OrganizationStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const actionLabel = nextStatus === 'suspended' ? 'להשהות' : 'להפעיל מחדש';
    if (!confirm(`האם אתה בטוח שברצונך ${actionLabel} את הארגון "${orgName}"?`)) {
      return;
    }

    setTogglingOrgId(orgId);
    try {
      const res = await toggleOrganizationStatusAction(orgId, nextStatus);
      if (res.success) {
        setFeedback({ text: res.message || `סטטוס הארגון עודכן בהצלחה`, type: 'success' });
        await loadPlatformData();
      } else {
        setFeedback({ text: res.error || 'שגיאה בעדכון סטטוס הארגון', type: 'error' });
      }
    } catch {
      setFeedback({ text: 'שגיאת רשת בעדכון סטטוס הארגון', type: 'error' });
    } finally {
      setTogglingOrgId(null);
    }
  };

  // Filtered active/all organizations list
  const filteredOrgs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allOrgs;
    return allOrgs.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) ||
        o.slug?.toLowerCase().includes(q) ||
        o.serialPrefix?.toLowerCase().includes(q) ||
        o.contactPhone?.includes(q) ||
        o.contactEmail?.toLowerCase().includes(q)
    );
  }, [allOrgs, searchQuery]);

  // Non-SuperAdmin Gate Screen
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mb-6 shadow-xl animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black mb-2">גישה מוגנת - Platform SuperAdmin בלבד</h1>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          אזור זה מיועד אך ורק לבעל המערכת הראשי של Tooly. מנהלי חברות ולקוחות אינם מורשים לצפות בדשבורד זה.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
        >
          <span>חזרה לעמוד הראשי</span>
          <ChevronLeft className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-purple-600 selection:text-white" dir="rtl">
      {/* ============================================================ */}
      {/* TOP HEADER: PLATFORM SUPERADMIN MASTER CONTROL               */}
      {/* ============================================================ */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3.5 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-purple-900/30 shrink-0">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">Tooly Master Portal</h1>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                  SuperAdmin
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Global Live
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                מרכז בקרת מערכת גלובלית, אישור חברות חדשות ומוניטור פעילות
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>מחובר: <strong className="text-white font-bold">{user?.username || 'admintool'}</strong></span>
            </div>

            <button
              type="button"
              onClick={loadPlatformData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="רענן נתוני פלטפורמה"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">רענון</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              <span>סורק שטח</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </Link>

            <button
              type="button"
              onClick={() => {
                switchToWorker();
                router.push('/');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-200 border border-red-800/60 text-xs font-bold transition-all cursor-pointer"
              title="התנתקות מוחלטת"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">התנתק</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA                                            */}
      {/* ============================================================ */}
      <main className="max-w-7xl mx-auto w-full px-4 py-8 space-y-8 flex-1">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/60 border-red-500/50 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* SECTION 1: PLATFORM METRICS KPI ROW                          */}
        {/* ============================================================ */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">כלל הארגונים</span>
              <Building2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white">{metrics.totalOrganizations}</div>
            <span className="text-[10px] text-slate-400 mt-1">סביבות עבודה</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">ארגונים פעילים</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{metrics.totalActiveOrganizations}</div>
            <span className="text-[10px] text-emerald-300/80 mt-1">מאושרים במערכת</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
            {pendingOrgs.length > 0 && (
              <div className="absolute top-0 right-0 left-0 h-1 bg-amber-400 animate-pulse" />
            )}
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">ממתינים לאישור</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">{pendingOrgs.length}</div>
            <span className="text-[10px] text-amber-300/80 mt-1">הרשמות חדשות</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">כלי עבודה רשומים</span>
              <Wrench className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{metrics.totalAssetsCount.toLocaleString()}</div>
            <span className="text-[10px] text-slate-400 mt-1">בכלל המחסנים</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">כלים בשטח (השאלות)</span>
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-300">{metrics.totalActiveLoansCount.toLocaleString()}</div>
            <span className="text-[10px] text-indigo-200/80 mt-1">כרגע אצל עובדים</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold">משתמשי מערכת</span>
              <Users className="w-4 h-4 text-pink-400" />
            </div>
            <div className="text-2xl font-black text-white">{metrics.totalUsersCount}</div>
            <span className="text-[10px] text-slate-400 mt-1">מנהלים ומחסנאים</span>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 2: PENDING REGISTRATIONS APPROVAL QUEUE             */}
        {/* ============================================================ */}
        <section className="bg-slate-800/60 border border-amber-500/30 rounded-3xl p-5 sm:p-7 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white">
                    אישור ארגונים חדשים (Onboarding Approvals)
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {pendingOrgs.length} ממתינות לאישור
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  בקרת הצטרפות ארגונים וסביבות עבודה עצמאיות למערכת Tooly
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadPlatformData}
              disabled={isLoading}
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>רענן רשימה</span>
            </button>
          </div>

          {/* Pending Cards Grid */}
          {pendingOrgs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOrgs.map((org) => {
                const isApproving = approvingOrgId === org.id;
                const isRejecting = rejectingOrgId === org.id;
                const phone = org.contact_phone || org.contactPhone;
                const email = org.contact_email || org.contactEmail;

                return (
                  <div
                    key={org.id}
                    className="bg-slate-900/90 rounded-2xl border border-amber-500/40 p-5 flex flex-col justify-between gap-4 shadow-md hover:border-amber-400 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-white leading-tight">{org.name}</h3>
                            <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-blue-300">
                              <span>slug: {org.slug}</span>
                              <span className="text-slate-600">|</span>
                              <span>קידומת: {org.serialPrefix || 'TOOL-'}</span>
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          ממתין
                        </span>
                      </div>

                      <div className="bg-slate-850 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="font-mono" dir="ltr">{phone || 'ללא טלפון'}</span>
                        </div>
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="font-mono truncate" dir="ltr">{email || 'ללא אימייל'}</span>
                        </div>
                        {org.created_at && (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-800">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>
                              {new Date(org.created_at).toLocaleDateString('he-IL')} בשעה {new Date(org.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        disabled={isApproving || isRejecting}
                        onClick={() => handleReject(org.id, org.name)}
                        className="py-2 px-3.5 rounded-xl border border-red-500/40 hover:bg-red-950/60 text-red-300 disabled:opacity-50 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {isRejecting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>דוחה...</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5 text-red-400" />
                            <span>דחה</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isApproving || isRejecting}
                        onClick={() => handleApprove(org.id, org.name)}
                        className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-700/30 disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {isApproving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>מאשר...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>אשר ארגון</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 px-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">אין בקשות הצטרפות ממתינות</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                כל החברות שנרשמו נבדקו ואושרו. בקשות חדשות שיוגשו יוצגו כאן מיד.
              </p>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* SECTION 3: ALL PLATFORM ORGANIZATIONS (DIRECTORY & CONTROL)  */}
        {/* ============================================================ */}
        <section className="bg-slate-800/60 border border-slate-700/80 rounded-3xl p-5 sm:p-7 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-700/80">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">
                  ארגונים וסביבות עבודה פעילות ב-Tooly
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {allOrgs.length} ארגונים
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ניהול סביבות לקוחות, ספירת כלים, מצב פעילות והרשאות
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש חברה, קידומת, מזהה..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 pr-9 transition-colors"
              />
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Organizations Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-900/80">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">שם הארגון</th>
                  <th className="py-3.5 px-3">סלאג (Slug)</th>
                  <th className="py-3.5 px-3">קידומת כלים</th>
                  <th className="py-3.5 px-3 text-center">כלי עבודה</th>
                  <th className="py-3.5 px-3 text-center">משתמשים</th>
                  <th className="py-3.5 px-3 text-center">השאלות שטח</th>
                  <th className="py-3.5 px-3">סטטוס</th>
                  <th className="py-3.5 px-4 text-left">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {filteredOrgs.map((org) => {
                  const isToggling = togglingOrgId === org.id;
                  const isActive = org.status === 'active';
                  const isSuspended = org.status === 'suspended';
                  const isPending = org.status === 'pending_approval';

                  return (
                    <tr key={org.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-black text-white text-sm">{org.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                          {org.contactPhone || org.contactEmail || org.id.slice(0, 13)}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-blue-300">
                        {org.slug}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-bold text-purple-300">
                        {org.serialPrefix || 'TOOL-'}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-bold text-slate-100">{org.toolsCount}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-bold text-slate-100">{org.membersCount}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`font-bold ${org.activeLoansCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {org.activeLoansCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            פעיל
                          </span>
                        ) : isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            מושהה
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            ממתין לאישור
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-left">
                        <div className="flex items-center justify-end gap-2">
                          {!isPending && (
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleStatus(org.id, org.status, org.name)}
                              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                                isActive
                                  ? 'border-red-500/30 hover:bg-red-950/60 text-red-300'
                                  : 'border-emerald-500/30 hover:bg-emerald-950/60 text-emerald-300'
                              }`}
                            >
                              {isToggling ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Power className="w-3 h-3" />
                              )}
                              <span>{isActive ? 'השהה' : 'הפעל מחדש'}</span>
                            </button>
                          )}

                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleApprove(org.id, org.name)}
                              disabled={approvingOrgId === org.id}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>אשר</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredOrgs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      לא נמצאו ארגונים התואמים את החיפוש.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 py-4 text-center text-xs text-slate-500">
        <p>Tooly Multi-Tenant Platform &bull; סביבת ניהול ראשית מבודדת (SuperAdmin Only) &bull; v2.5</p>
      </footer>
    </div>
  );
}
