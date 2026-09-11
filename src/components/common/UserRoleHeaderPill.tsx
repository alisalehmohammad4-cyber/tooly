import React from 'react';
import Link from 'next/link';
import {
  KeyRound,
  ShieldCheck,
  HardHat,
  LayoutDashboard,
  Warehouse as WarehouseIcon,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function UserRoleHeaderPill() {
  const { role, user, openPinModal, switchToWorker } = useAuth();

  if (role === 'admin') {
    return (
      <div className="flex items-center gap-1 sm:gap-1.5">
        <Link
          href="/dashboard/manager"
          className="p-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 transition-colors flex items-center justify-center shadow-sm shrink-0"
          title="מעבר ללוח בקרה ניהולי (מנהל מפעל ופרויקטים)"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-purple-700" />
        </Link>
        <button
          type="button"
          onClick={openPinModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white border border-purple-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title={`${user.fullName} - לחץ להחלפת משתמש`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-purple-200 shrink-0" />
          <span>🛡️ מנהל פרויקט (מחובר)</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          title="התנתק / יציאה - חזרה למצב עובד שטח"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="hidden sm:inline">התנתק / יציאה</span>
          <span className="sm:hidden">יציאה</span>
        </button>
      </div>
    );
  }

  if (role === 'supervisor') {
    return (
      <div className="flex items-center gap-1 sm:gap-1.5">
        <Link
          href="/dashboard/warehouse"
          className="p-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 transition-colors flex items-center justify-center shadow-sm shrink-0"
          title="מעבר לעמדת מחסנאי ותפעול מלאי"
        >
          <WarehouseIcon className="w-3.5 h-3.5 text-blue-700" />
        </Link>
        <button
          type="button"
          onClick={openPinModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title={`${user.fullName} - לחץ להחלפת משתמש`}
        >
          <KeyRound className="w-3.5 h-3.5 text-blue-200 shrink-0" />
          <span>🔑 מנהל עבודה (מחובר)</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          title="התנתק / יציאה - חזרה למצב עובד שטח (למסירת המכשיר לעובד)"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="hidden sm:inline">התנתק / יציאה</span>
          <span className="sm:hidden">יציאה</span>
        </button>
      </div>
    );
  }

  // Default: Worker
  return (
    <button
      type="button"
      onClick={openPinModal}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
      title="עובד שטח - לחץ להזנת קוד PIN וכניסת מנהל"
    >
      <HardHat className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      <span>עובד שטח</span>
      <span className="text-[10px] text-amber-700/80 font-normal bg-amber-200/60 px-1 py-0.5 rounded flex items-center gap-0.5">
        <KeyRound className="w-2.5 h-2.5 inline" />
        <span>PIN</span>
      </span>
    </button>
  );
}
