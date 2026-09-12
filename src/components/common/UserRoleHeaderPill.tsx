'use client';

import React from 'react';
import {
  Lock,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function UserRoleHeaderPill() {
  const { role, user, openPinModal, switchToWorker } = useAuth();

  if (role === 'admin') {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => openPinModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white border border-purple-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title={`${user.fullName} - לחץ להחלפת משתמש`}
        >
          <span>👑 מנהל מפעל ופרויקטים</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          title="נעילת עמדה / יציאה - חזרה למצב עובד שטח"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="hidden sm:inline">נעילת עמדה / יציאה</span>
          <span className="sm:hidden">נעילה</span>
        </button>
      </div>
    );
  }

  if (role === 'supervisor') {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => openPinModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer"
          title={`${user.fullName} - לחץ להחלפת משתמש`}
        >
          <span>🔑 עמדת מחסנאי (פעיל)</span>
        </button>
        <button
          type="button"
          onClick={switchToWorker}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
          title="נעילת עמדה / יציאה - חזרה למצב עובד שטח"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="hidden sm:inline">נעילת עמדה / יציאה</span>
          <span className="sm:hidden">נעילה</span>
        </button>
      </div>
    );
  }

  // Default: Worker
  return (
    <button
      type="button"
      onClick={() => openPinModal()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-900 border border-slate-300 hover:border-blue-300 text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
      title="התחברות מורשית באמצעות קוד PIN"
    >
      <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <span>🔒 התחברות מורשית</span>
    </button>
  );
}
