'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Scan,
  ShieldCheck,
  Lock,
  KeyRound,
  User,
  Building2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  HardHat,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import NetworkSyncPill from '@/components/common/NetworkSyncPill';
import RegisterOrganizationModal from '@/components/modules/RegisterOrganizationModal';

interface PortalLandingViewProps {
  onOpenScanner: () => void;
}

export default function PortalLandingView({
  onOpenScanner,
}: PortalLandingViewProps) {
  const router = useRouter();
  const { loginWithCredentials } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setLoginError('נא להזין שם משתמש או קוד מזהה');
      return;
    }
    setLoginError(null);
    setIsSubmitting(true);

    try {
      const result = await loginWithCredentials(username.trim(), password.trim() || undefined);
      if (result.success && result.user) {
        if (result.user.role === 'general_manager' || result.user.role === 'admin') {
          router.push('/dashboard/manager');
        } else if (
          result.user.role === 'chief_operations' ||
          result.user.role === 'storekeeper' ||
          result.user.role === 'supervisor'
        ) {
          router.push('/dashboard/warehouse');
        }
      } else {
        setLoginError(result.error || 'פרטי התחברות שגויים');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאת התחברות במערכת';
      setLoginError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Top Bar with System Identity and Sync Status */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-2xl shadow-md shadow-blue-600/20">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900">Tooly</span>
                <span className="text-[10px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-widest">
                  v2.5 Pro
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                מערכת ניהול, בקרת מלאי ותנועת כלי עבודה
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>הקמת ארגון חדש</span>
            </button>
            <NetworkSyncPill />
          </div>
        </div>
      </header>

      {/* Main Portal Landing Area */}
      <main className="max-w-5xl mx-auto w-full px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        {/* Welcome Headline */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold mb-4 shadow-xs">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>שער כניסה אחוד ומאובטח לאתרי עבודה ומחסנים</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
            ברוכים הבאים למערכת <span className="text-blue-600">Tooly</span>
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            בחר את מסלול הכניסה המתאים לתפקידך: סריקת שטח חופשית לפועלים או התחברות מאובטחת לצוותי ניהול ומחסנאים.
          </p>
        </div>

        {/* Dual Gate Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          
          {/* SECTION A: Field Worker Access */}
          <div className="relative group rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 flex flex-col justify-between shadow-lg hover:shadow-xl hover:border-emerald-500/40 transition-all duration-300">
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                גישה פתוחה
              </span>
            </div>

            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-5 shadow-xs">
                <Scan className="w-7 h-7" />
              </div>

              <div className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <HardHat className="w-4 h-4 text-emerald-600" />
                <span>מסלול פועלי שטח ועובדי אתר</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-3">
                סורק בדיקה ובטיחות
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                כניסה מהירה ללא סיסמה. סריקת ברקוד / QR של כל כלי עבודה לבדיקת תקינות, תוקף בדיקה בטיחותית ודיווח מיידי על תקלות בשטח.
              </p>

              <div className="space-y-2.5 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>סריקת QR מהירה לבדיקת תקינות כלי</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>הוראות בטיחות וציוד מגן אישי נדרש</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>כפתור דיווח מהיר על תקלה (השבתת כלי פגום)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenScanner}
              className="w-full py-4 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98] cursor-pointer"
            >
              <Scan className="w-5 h-5" />
              <span>כניסה לסורק שטח (ללא התחברות)</span>
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* SECTION B: Management & Storekeeper Login */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 flex flex-col justify-between shadow-lg hover:shadow-xl hover:border-blue-500/40 transition-all duration-300">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-5 shadow-xs">
                <Lock className="w-7 h-7" />
              </div>

              <div className="text-xs font-black text-blue-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>צוות תפעול ומחסן מורשה</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                התחברות מחסנאי והנהלה
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-5">
                ניפוק והחזרת כלים, ניהול מחסן משויך, הוספת כלים חדשים ודוחות ניהוליים.
              </p>

              {/* Login Error Banner */}
              {loginError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleFormSubmit} className="space-y-3.5 mb-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    שם משתמש:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="הזן שם משתמש"
                      autoComplete="off"
                      inputMode="text"
                      disabled={isSubmitting}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all pl-10"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    סיסמה:
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="הזן סיסמה"
                      autoComplete="off"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={isSubmitting}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all pl-10 tracking-widest"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer mt-4"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>מאמת נתונים...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>התחברות למערכת</span>
                    </>
                  )}
                </button>

                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">חברה / קבלן חדש?</span>
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="text-blue-600 hover:text-blue-700 font-extrabold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>פתיחת ארגון חדש</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>

        {/* Informational Warehouse Scope Banner */}
        <div className="mt-8 max-w-4xl mx-auto w-full p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
            <span>
              <strong>הגבלת סמכות מחסנאי:</strong> כל מחסנאי משויך למחסן ספציפי ורשאי לנפק כלים השייכים למתקן שלו בלבד. להקצאת מחסנאי פנה להנהלת המפעל.
            </span>
          </div>
          <div className="hidden sm:block text-[11px] text-slate-400 whitespace-nowrap">
            Tooly Enterprise Asset Tracking
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/80 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Tooly Management Systems © 2026 • ניהול ובקרת כלי עבודה בשטח
          </div>
          <div className="flex items-center gap-3">
            <span>מצב אופליין נתמך (IndexedDB)</span>
            <span>•</span>
            <span>רמת אבטחה: מורשה תקן ISO</span>
          </div>
        </div>
      </footer>

      <RegisterOrganizationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
      />
    </div>
  );
}
