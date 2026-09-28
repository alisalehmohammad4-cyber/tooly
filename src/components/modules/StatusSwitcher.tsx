'use client';

import React, { useState } from 'react';
import { Loader2, CheckCircle2, UserCheck, AlertTriangle, Trash2, ChevronDown } from 'lucide-react';
import { updateAssetStatusAction } from '@/app/actions/assets';
import { useRouter } from 'next/navigation';
import type { AssetStatus } from '@/types/domain';

interface StatusSwitcherProps {
  assetId: string;
  currentStatus: AssetStatus | string;
  variant?: 'badges' | 'dropdown' | 'compact';
  onStatusChanged?: (newStatus: AssetStatus) => void;
  className?: string;
  disabled?: boolean;
}

export const STATUS_OPTIONS: Array<{
  value: AssetStatus;
  label: string;
  shortLabel: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  icon: React.ElementType;
}> = [
  {
    value: 'available',
    label: 'זמין במלאי (available)',
    shortLabel: 'זמין במלאי',
    dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50 hover:bg-emerald-100',
    badgeBorder: 'border-emerald-300',
    textColor: 'text-emerald-800',
    icon: CheckCircle2,
  },
  {
    value: 'checked_out',
    label: 'בשימוש עובד (checked_out)',
    shortLabel: 'בשימוש עובד',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-50 hover:bg-blue-100',
    badgeBorder: 'border-blue-300',
    textColor: 'text-blue-800',
    icon: UserCheck,
  },
  {
    value: 'maintenance',
    label: 'בתיקון / אחזקה (maintenance)',
    shortLabel: 'בתיקון / אחזקה',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-50 hover:bg-amber-100',
    badgeBorder: 'border-amber-300',
    textColor: 'text-amber-800',
    icon: AlertTriangle,
  },
  {
    value: 'retired',
    label: 'מושבת / גריטה (retired)',
    shortLabel: 'מושבת / גריטה',
    dotColor: 'bg-rose-500',
    badgeBg: 'bg-rose-50 hover:bg-rose-100',
    badgeBorder: 'border-rose-300',
    textColor: 'text-rose-800',
    icon: Trash2,
  },
];

export default function StatusSwitcher({
  assetId,
  currentStatus,
  variant = 'compact',
  onStatusChanged,
  className = '',
  disabled = false,
}: StatusSwitcherProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const activeOption = STATUS_OPTIONS.find((opt) => opt.value === status) || STATUS_OPTIONS[0];

  const handleSelectStatus = async (newStatus: AssetStatus) => {
    if (newStatus === status || isUpdating || disabled) return;

    if (newStatus === 'retired') {
      const confirmRetire = window.confirm(
        'האם אתה בטוח שברצונך להשבית כלי זה ולגרוע אותו מהמלאי הפעיל?'
      );
      if (!confirmRetire) return;
    }

    setIsUpdating(true);
    setIsOpen(false);

    try {
      const res = await updateAssetStatusAction(assetId, newStatus);
      if (!res.success) {
        alert(`שגיאה בשינוי סטטוס: ${res.error || 'נסה שוב'}`);
        return;
      }

      setStatus(newStatus);
      if (onStatusChanged) {
        onStatusChanged(newStatus);
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת';
      alert(`שגיאה בעדכון הסטטוס: ${msg}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // 1. Badges Variant: 4 clickable pill buttons side-by-side
  if (variant === 'badges') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {STATUS_OPTIONS.map((opt) => {
          const isSelected = opt.value === status;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={isUpdating || disabled}
              onClick={() => void handleSelectStatus(opt.value)}
              className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all cursor-pointer disabled:opacity-50 active:scale-95 ${
                isSelected
                  ? `${opt.badgeBg} ${opt.badgeBorder} ${opt.textColor} ring-2 ring-blue-500/20 shadow-xs font-black`
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isUpdating && isSelected ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Icon className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 2. Compact / Dropdown Variant
  return (
    <div className={`relative inline-block text-right ${className}`} dir="rtl">
      <button
        type="button"
        disabled={isUpdating || disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs disabled:opacity-60 ${activeOption.badgeBg} ${activeOption.badgeBorder} ${activeOption.textColor}`}
        title="לחץ לשינוי סטטוס כלי מהיר"
      >
        {isUpdating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${activeOption.dotColor} shrink-0`} />
        )}
        <span>{activeOption.shortLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100">
              שינוי סטטוס כלי ישיר:
            </div>
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = opt.value === status;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void handleSelectStatus(opt.value)}
                  className={`w-full text-right px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? `${opt.badgeBg} ${opt.textColor} font-black`
                      : 'hover:bg-slate-50 text-slate-700 hover:text-slate-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${opt.dotColor} shrink-0`} />
                    <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    <span>{opt.shortLabel}</span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-black text-blue-600">נוכחי</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
