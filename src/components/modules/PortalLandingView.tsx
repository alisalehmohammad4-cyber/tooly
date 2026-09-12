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

  // Quick preset login helper
  const handleQuickPreset = async (presetPin: string) => {
    setLoginError(null);
    setIsSubmitting(true);
    try {
      const result = await loginWithCredentials(presetPin, presetPin);
      if (result.success && result.user) {
        if (result.user.role === 'admin') {
          router.push('/dashboard/manager');
        }
      } else {
        setLoginError(result.error || 'שגיאת כניסה מהירה');
      }
    } catch {
      setLoginError('שגיאה בביצוע כניסה למערכת');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        if (result.user.role === 'admin') {
          router.push('/dashboard/manager');
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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Top Bar with System Identity and Sync Status */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 py-3.5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-500/25 border border-blue-400/30">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">Tooly</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-extrabold px-2 py-0.5 rounded-full border border-blue-500/30 uppercase tracking-widest">
                  v2.5 Pro
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                מערכת ניהול, בקרת מלאי ותנועת כלי עבודה
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NetworkSyncPill />
          </div>
        </div>
      </header>

      {/* Main Portal Landing Area */}
      <main className="max-w-5xl mx-auto w-full px-4 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        {/* Welcome Headline */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-300 text-xs font-bold mb-4 shadow-sm">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>שער כניסה אחוד ומאובטח לאתרי עבודה ומחסנים</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            ברוכים הבאים למערכת <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">Tooly</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm sm:text-base leading-relaxed">
            בחר את מסלול הכניסה המתאים לתפקידך: סריקת שטח חופשית לפועלים או התחברות מאובטחת לצוותי ניהול ומחסנאים.
          </p>
        </div>

        {/* Dual Gate Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          
          {/* SECTION A: Field Worker Access */}
          <div className="relative group rounded-3xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border-2 border-slate-700 hover:border-blue-500/80 p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-slate-950/40 transition-all duration-300 hover:shadow-blue-500/10">
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                גישה פתוחה
              </span>
            </div>

            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5">
                <Scan className="w-7 h-7" />
              </div>

              <div className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <HardHat className="w-4 h-4" />
                <span>מסלול פועלי שטח ועובדי אתר</span>
              </div>
              <h2 className="text-2xl font-black text-white mb-3">
                סורק בדיקה ובטיחות
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-6">
                כניסה מהירה ללא סיסמה. סריקת ברקוד / QR של כל כלי עבודה לבדיקת תקינות, תוקף בדיקה בטיחותית ודיווח מיידי על תקלות בשטח.
              </p>

              <div className="space-y-2.5 mb-8 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800 text-xs text-slate-300 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>סריקת QR מהירה לבדיקת תקינות כלי</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>הוראות בטיחות וציוד מגן אישי נדרש</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>כפתור דיווח מהיר על תקלה (השבתת כלי פגום)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenScanner}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-base shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98] cursor-pointer"
            >
              <Scan className="w-5 h-5" />
              <span>כניסה לסורק שטח (ללא התחברות)</span>
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* SECTION B: Management & Storekeeper Login */}
          <div className="rounded-3xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border-2 border-slate-700 hover:border-indigo-500/80 p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-slate-950/40 transition-all duration-300">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-5">
                <Lock className="w-7 h-7" />
              </div>

              <div className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                <span>צוות תפעול ומחסן מורשה</span>
              </div>
              <h2 className="text-2xl font-black text-white mb-2">
                התחברות מחסנאי והנהלה
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed mb-5">
                ניפוק והחזרת כלים, ניהול מחסן משויך, הוספת כלים חדשים ודוחות ניהוליים.
              </p>

              {/* Login Error Banner */}
              {loginError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleFormSubmit} className="space-y-3.5 mb-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    שם משתמש או קוד כניסה:
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="לדוגמה: yossi או קוד PIN"
                      autoComplete="username"
                      disabled={isSubmitting}
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all pl-10"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    קוד סודי (PIN) או סיסמה:
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="הזן קוד (לדוגמה: 1111)"
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all pl-10"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black text-sm shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>מאמת נתונים...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>התחברות למערכת המחסן</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Quick Presets for Rapid Operator Login */}
            <div className="pt-4 border-t border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 mb-2">
                כניסה מהירה (סביבת פיתוח והדגמה):
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickPreset('1111')}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-all text-center flex flex-col items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="text-[10px] text-blue-400 font-extrabold">1111</span>
                  <span className="truncate w-full">מחסן ראשי</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPreset('1234')}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-all text-center flex flex-col items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="text-[10px] text-amber-400 font-extrabold">1234</span>
                  <span className="truncate w-full">מחסן שטח</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPreset('9999')}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-lg bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 text-xs font-bold transition-all text-center flex flex-col items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="text-[10px] text-purple-300 font-extrabold">9999</span>
                  <span className="truncate w-full">הנהלת מפעל</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Informational Warehouse Scope Banner */}
        <div className="mt-8 max-w-4xl mx-auto w-full p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-blue-400 shrink-0" />
            <span>
              <strong>הגבלת סמכות מחסנאי:</strong> כל מחסנאי משויך למחסן ספציפי ורשאי לנפק כלים השייכים למתקן שלו בלבד. להקצאת מחסנאי פנה להנהלת המפעל.
            </span>
          </div>
          <div className="hidden sm:block text-[11px] text-slate-500 whitespace-nowrap">
            Tooly Enterprise Asset Tracking
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-4 px-4 text-center text-xs text-slate-500">
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
    </div>
  );
}
