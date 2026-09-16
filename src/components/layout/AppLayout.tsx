'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Scan,
  Layers,
  History as HistoryIcon,
  Printer,
  Warehouse as WarehouseIcon,
  LayoutDashboard,
  Lock,
  LogOut,
  ShieldAlert,
  ArrowRight,
  ShoppingCart,
  User,
  KeyRound,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import NetworkSyncPill from '@/components/common/NetworkSyncPill';

interface RoleHeaderProps {
  title?: string;
  subtitle?: string;
  cartCount?: number;
  onOpenCart?: () => void;
  children?: React.ReactNode;
}

export function RoleHeader({
  title,
  subtitle,
  cartCount = 0,
  onOpenCart,
  children,
}: RoleHeaderProps) {
  const { role, user, openPinModal, switchToWorker } = useAuth();

  // 1. Worker Header: Discrete and minimalist
  if (role === 'worker') {
    return (
      <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25 shrink-0">
              T
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-600 font-extrabold">
                {subtitle || 'תפעול שטח'}
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                {title || 'Tooly'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NetworkSyncPill />
            <button
              type="button"
              onClick={() => openPinModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-900 border border-slate-300 hover:border-blue-300 text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
              title="התחברות מורשית באמצעות קוד PIN"
            >
              <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>🔒 התחברות מורשית</span>
            </button>
          </div>
        </div>
        {children}
      </header>
    );
  }

  // 2. Storekeeper Header
  if (role === 'storekeeper' || role === 'supervisor') {
    return (
      <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25 shrink-0">
              T
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-blue-600 font-extrabold truncate max-w-[200px]">
                {subtitle || (user.assignedWarehouseName ? `משויך: ${user.assignedWarehouseName}` : 'עמדת מחסנאי פעיל')}
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                {title || 'Tooly - מחסן שטח'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <NetworkSyncPill />

            {cartCount > 0 && onOpenCart && (
              <button
                type="button"
                onClick={onOpenCart}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition-all active:scale-95 shadow-sm cursor-pointer animate-pulse"
                title="פתיחת סל ניפוק כלים"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>סל ניפוק ({cartCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openPinModal()}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer max-w-[180px] sm:max-w-none truncate"
              title={`${user.fullName} - לחץ להחלפת משתמש`}
            >
              <span className="truncate">
                {user.assignedWarehouseName ? `🔑 ${user.assignedWarehouseName}` : '🔑 עמדת מחסנאי'}
              </span>
            </button>

            <button
              type="button"
              onClick={switchToWorker}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
              title="נעילת עמדה / יציאה - חזרה למצב עובד שטח"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="hidden md:inline">נעילת עמדה / יציאה</span>
              <span className="md:hidden">נעילה</span>
            </button>
          </div>
        </div>
        {children}
      </header>
    );
  }

  // 3. Chief Operations Header
  if (role === 'chief_operations') {
    return (
      <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-indigo-100 px-4 py-3 shadow-sm shadow-indigo-950/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-indigo-600/25 shrink-0">
              T
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-indigo-700 font-extrabold">
                {subtitle || 'שליטה ובקרה חוצת-מחסנים'}
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                {title || 'Tooly - מרכז תפעול ראשי'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <NetworkSyncPill />

            {cartCount > 0 && onOpenCart && (
              <button
                type="button"
                onClick={onOpenCart}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition-all active:scale-95 shadow-sm cursor-pointer animate-pulse"
                title="פתיחת סל ניפוק כלים"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>סל ניפוק ({cartCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openPinModal()}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
              title={`${user.fullName} - לחץ להחלפת משתמש`}
            >
              <span>🌐 אחראי תפעול ראשי</span>
            </button>

            <button
              type="button"
              onClick={switchToWorker}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
              title="נעילת עמדה / יציאה - חזרה למצב עובד שטח"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="hidden md:inline">נעילת עמדה / יציאה</span>
              <span className="md:hidden">נעילה</span>
            </button>
          </div>
        </div>
        {children}
      </header>
    );
  }

  // 4. Executive General Manager Header
  return (
    <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100 px-4 py-3 shadow-sm shadow-purple-950/5">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-700 flex items-center justify-center text-white font-black text-xl shadow-md shadow-purple-600/25 shrink-0">
            T
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-700 font-extrabold">
              {subtitle || 'ניהול ובקרה ניהולית'}
            </div>
            <h1 className="text-base font-black text-blue-950 leading-tight">
              {title || 'Tooly - מנהל מפעל ופרויקטים'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSyncPill />

          <button
            type="button"
            onClick={() => openPinModal()}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white border border-purple-800 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
            title={`${user.fullName} - לחץ להחלפת משתמש`}
          >
            <span>👑 מנהל כללי</span>
          </button>

          <button
            type="button"
            onClick={switchToWorker}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
            title="נעילת עמדה / יציאה - חזרה למצב עובד שטח"
          >
            <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="hidden md:inline">נעילת עמדה / יציאה</span>
            <span className="md:hidden">נעילה</span>
          </button>
        </div>
      </div>
      {children}
    </header>
  );
}

export function RoleBottomNav() {
  const { role } = useAuth();
  const pathname = usePathname();

  // Worker Mode: No bottom bar tabs (scanner view only)
  if (role === 'worker') {
    return null;
  }

  // Storekeeper Mode: Strictly operational tabs
  if (role === 'storekeeper' || role === 'supervisor') {
    const storekeeperTabs = [
      { href: '/', label: 'סורק וניפוק', icon: Scan },
      { href: '/dashboard/warehouse', label: 'לוח מחסנאי', icon: WarehouseIcon },
      { href: '/catalog', label: 'קטלוג ומלאי', icon: Layers },
      { href: '/print-tags', label: 'הדפסת תגיות', icon: Printer },
    ];

    return (
      <nav
        aria-label="ניווט תפעולי מחסנאי"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5 print:hidden"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {storekeeperTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center transition-all ${
                  isActive
                    ? 'bg-blue-50 border border-blue-200 text-blue-700 font-black shadow-sm'
                    : 'text-slate-500 hover:text-blue-700 active:bg-blue-50/50 font-bold'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                <span className="text-[10px] sm:text-[11px] mt-1">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // Chief Operations Mode: Cross-depot Operations Navigation
  if (role === 'chief_operations') {
    const chiefOpsTabs = [
      { href: '/dashboard/warehouse', label: 'מרכז תפעול ראשי', icon: WarehouseIcon },
      { href: '/', label: 'סורק וניפוק', icon: Scan },
      { href: '/history', label: 'יומן תנועות והעברות', icon: HistoryIcon },
      { href: '/catalog', label: 'קטלוג וכלים', icon: Layers },
    ];

    return (
      <nav
        aria-label="ניווט אחראי תפעול ראשי"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-indigo-100 px-3 py-2 shadow-lg shadow-indigo-950/5 print:hidden"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {chiefOpsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center transition-all ${
                  isActive
                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-800 font-black shadow-sm'
                    : 'text-slate-500 hover:text-indigo-700 active:bg-indigo-50/50 font-bold'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-700' : 'text-slate-500'}`} />
                <span className="text-[10px] sm:text-[11px] mt-1">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // Executive General Manager Mode: Dedicated Executive Navigation
  const executiveTabs = [
    { href: '/dashboard/manager', label: 'לוח מנהל כללי (BI)', icon: LayoutDashboard },
    { href: '/history', label: 'יומן תנועות ו-GPS', icon: HistoryIcon },
    { href: '/catalog', label: 'קטלוג ושווי מלאי', icon: Layers },
    { href: '/dashboard/warehouse', label: 'עמדת תפעול ומחסן', icon: WarehouseIcon },
  ];

  return (
    <nav
      aria-label="ניווט ניהולי מנהל מפעל"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-purple-100 px-3 py-2 shadow-lg shadow-purple-950/5 print:hidden"
    >
      <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
        {executiveTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center transition-all ${
                isActive
                  ? 'bg-purple-50 border border-purple-200 text-purple-900 font-black shadow-sm'
                  : 'text-slate-500 hover:text-purple-700 active:bg-purple-50/50 font-bold'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-purple-700' : 'text-slate-500'}`} />
              <span className="text-[10px] sm:text-[11px] mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  cartCount?: number;
  onOpenCart?: () => void;
  extraHeader?: React.ReactNode;
  requiredRole?:
    | 'general_manager'
    | 'chief_operations'
    | 'storekeeper'
    | 'supervisor'
    | 'admin'
    | 'any_elevated';
}

interface AuthGateLoginFormProps {
  requiredRole?:
    | 'general_manager'
    | 'chief_operations'
    | 'storekeeper'
    | 'supervisor'
    | 'admin'
    | 'any_elevated';
}

function AuthGateLoginForm({ requiredRole }: AuthGateLoginFormProps) {
  const { loginWithCredentials } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setLoginError('נא להזין שם משתמש');
      return;
    }

    setIsSubmitting(true);
    setLoginError(null);

    try {
      const result = await loginWithCredentials(
        username.trim(),
        password.trim() || undefined
      );

      if (!result.success) {
        setLoginError(result.error || 'פרטי התחברות שגויים');
      } else if (result.user) {
        const userRole = result.user.role;
        const stillUnauthorized =
          ((requiredRole === 'general_manager' || requiredRole === 'admin') &&
            userRole !== 'general_manager' &&
            userRole !== 'admin') ||
          (requiredRole === 'chief_operations' &&
            userRole !== 'chief_operations' &&
            userRole !== 'general_manager' &&
            userRole !== 'admin') ||
          ((requiredRole === 'storekeeper' || requiredRole === 'supervisor') &&
            userRole === 'worker') ||
          (requiredRole === 'any_elevated' && userRole === 'worker');

        if (stillUnauthorized) {
          setLoginError('החשבון אומת בהצלחה, אך אינו בעל הרשאות גישה לעמוד זה.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאת התחברות במערכת';
      setLoginError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-2xl p-6 sm:p-8 text-right" dir="rtl">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h2 className="text-2xl font-black text-slate-900 mb-2">
          אזור מורשה בלבד
        </h2>
        <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
          עמוד זה מיועד לצוותי ניהול ומחסנאים מורשים. יש להזין פרטי התחברות כדי לגשת לנתונים.
        </p>
      </div>

      {loginError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-start gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{loginError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
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
              <span>התחבר למערכת</span>
            </>
          )}
        </button>

        <Link
          href="/"
          className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all mt-3 cursor-pointer text-center"
        >
          <ArrowRight className="w-4 h-4" />
          <span>חזרה לסורק פועל שטח</span>
        </Link>
      </form>
    </div>
  );
}

export default function AppLayout({
  children,
  title,
  subtitle,
  cartCount = 0,
  onOpenCart,
  extraHeader,
  requiredRole,
}: AppLayoutProps) {
  const { role } = useAuth();

  // Role Protection check:
  const isUnauthorized =
    ((requiredRole === 'general_manager' || requiredRole === 'admin') &&
      role !== 'general_manager' &&
      role !== 'admin') ||
    (requiredRole === 'chief_operations' &&
      role !== 'chief_operations' &&
      role !== 'general_manager' &&
      role !== 'admin') ||
    ((requiredRole === 'storekeeper' || requiredRole === 'supervisor') &&
      role === 'worker') ||
    (requiredRole === 'any_elevated' && role === 'worker');

  if (isUnauthorized) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between" dir="rtl">
        <RoleHeader title={title} subtitle={subtitle} />

        <main className="flex-1 max-w-md mx-auto px-4 py-12 sm:py-16 flex flex-col items-center justify-center w-full">
          <AuthGateLoginForm requiredRole={requiredRole} />
        </main>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-slate-50 text-blue-950 flex flex-col print:bg-white print:p-0 print:m-0 ${
        role !== 'worker' ? 'pb-24' : 'pb-6'
      } print:pb-0`}
    >
      <RoleHeader
        title={title}
        subtitle={subtitle}
        cartCount={cartCount}
        onOpenCart={onOpenCart}
      >
        {extraHeader}
      </RoleHeader>

      <main className="flex-1 w-full">
        {children}
      </main>

      <RoleBottomNav />
    </div>
  );
}
