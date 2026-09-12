'use client';

import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineSync } from '@/context/OfflineSyncContext';

interface NetworkSyncPillProps {
  className?: string;
}

export default function NetworkSyncPill({ className = '' }: NetworkSyncPillProps) {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync();

  // 1. Syncing State (Active execution)
  if (isSyncing) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold shadow-sm ${className}`}
        title="מסנכרן פעולות שבוצעו באופליין מול השרת"
      >
        <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
        <span className="hidden sm:inline">מסנכרן נתונים...</span>
        <span className="sm:hidden">מסנכרן</span>
      </div>
    );
  }

  // 2. Offline State (No internet connection)
  if (!isOnline) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-black shadow-sm ${className}`}
        title="המכשיר במצב לא מקוון - פעולות יישמרו מקומית ויסונכרנו אוטומטית כשהחיבור יחזור"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
        <span>
          לא מקוון {pendingCount > 0 ? `(${pendingCount} בתור)` : ''}
        </span>
      </div>
    );
  }

  // 3. Online with Pending Items (Needs manual trigger or waiting)
  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={() => syncNow()}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black shadow-md shadow-blue-500/25 transition-all active:scale-95 cursor-pointer ${className}`}
        title="ישנן פעולות שנשמרו באופליין וממתינות לסנכרון - לחץ לסנכרון מיידי"
      >
        <RefreshCw className="w-3.5 h-3.5 shrink-0" />
        <span>סנכרן עכשיו ({pendingCount})</span>
      </button>
    );
  }

  // 4. Online & Fully Synced (Normal discrete state)
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-[10px] sm:text-[11px] font-bold shadow-xs ${className}`}
      title="מחובר ומסונכרן לענן בזמן אמת"
    >
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="hidden sm:inline">מחובר לענן</span>
      <span className="sm:hidden">מחובר</span>
    </div>
  );
}
