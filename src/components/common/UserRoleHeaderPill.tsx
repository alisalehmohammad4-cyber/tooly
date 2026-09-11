'use client';

import React from 'react';
import { KeyRound, ShieldCheck, UserCheck, HardHat, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function UserRoleHeaderPill() {
  const { role, user, openPinModal, switchToWorker } = useAuth();

  if (role === 'admin') {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openPinModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title="מנהל פרויקט / מערכת - לחץ להחלפת משתמש"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-purple-700 shrink-0" />
          <span className="hidden sm:inline">{user.fullName}</span>
          <span className="sm:hidden">מנהל פרויקט</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          title="חזרה למצב עובד שטח"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (role === 'supervisor') {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openPinModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title="מנהל עבודה - לחץ להחלפת משתמש"
        >
          <UserCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" />
          <span className="hidden sm:inline">{user.fullName}</span>
          <span className="sm:hidden">מנהל עבודה</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          title="חזרה למצב עובד שטח"
        >
          <RefreshCw className="w-3 h-3" />
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
