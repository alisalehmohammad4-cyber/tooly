'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Container,
  Truck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Barcode,
} from 'lucide-react';
import type { Warehouse, WarehouseType } from '@/types/domain';
import { createWarehouseAction, updateWarehouseAction } from '@/app/actions/warehouses';
import { useAuth } from '@/context/AuthContext';

interface WarehouseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (savedWarehouse: Warehouse) => void;
  initialData?: Warehouse | null;
}

export default function WarehouseFormModal({
  isOpen,
  onClose,
  onSaved,
  initialData,
}: WarehouseFormModalProps) {
  const { currentOrganization } = useAuth();
  const isEditing = Boolean(initialData);

  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [type, setType] = useState<WarehouseType>('central_warehouse');
  const [address, setAddress] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state with initialData when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (initialData) {
          setName(initialData.name || '');
          setCode(initialData.code || '');
          setType(initialData.type || 'central_warehouse');
          setAddress(initialData.address || '');
          setIsActive(initialData.isActive !== false);
        } else {
          setName('');
          setCode('');
          setType('central_warehouse');
          setAddress('');
          setIsActive(true);
        }
        setErrorMessage(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('נא להזין שם מתקן תקין (לפחות 2 תווים).');
      return;
    }

    if (!cleanCode || cleanCode.length < 2) {
      setErrorMessage('נא להזין קוד מזהה ייחודי באותיות/מספרים (לפחות 2 תווים).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEditing && initialData) {
        const res = await updateWarehouseAction(initialData.id, {
          name: cleanName,
          code: cleanCode,
          type,
          address: address.trim() || undefined,
          isActive,
        });

        if (res.success && res.warehouse) {
          onSaved(res.warehouse);
          onClose();
        } else {
          setErrorMessage(res.error || 'שגיאה בעדכון פרטי המתקן');
        }
      } else {
        const res = await createWarehouseAction(
          {
            name: cleanName,
            code: cleanCode,
            type,
            address: address.trim() || undefined,
          },
          currentOrganization?.id
        );

        if (res.success && res.warehouse) {
          onSaved(res.warehouse);
          onClose();
        } else {
          setErrorMessage(res.error || 'שגיאה ביצירת המתקן החדש');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאת רשת בשמירת המתקן';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-modal-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-2 border-slate-200 overflow-hidden flex flex-col max-h-[88vh] animate-in slide-in-from-bottom-4 duration-200 text-slate-900">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-blue-850 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-200">
              {type === 'central_warehouse' && <Building2 className="w-5 h-5" />}
              {type === 'site_container' && <Container className="w-5 h-5" />}
              {type === 'service_van' && <Truck className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="warehouse-modal-title" className="text-base sm:text-lg font-black leading-tight">
                {isEditing ? 'עריכת פרטי אתר / מחסן' : 'הוספת אתר / מחסן חדש'}
              </h2>
              <p className="text-xs text-blue-200/80 font-medium">
                הגדרת פריסת מתקנים, מכולות שטח ורכבי שירות ניידים
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="סגור חלון"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          className="p-5 pb-14 sm:pb-8 flex-1 overflow-y-auto overscroll-contain space-y-4 text-slate-800"
        >
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs font-bold flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Facility Name */}
          <div>
            <label className="block text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-1.5">
              שם המתקן / האתר <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: אתר בנייה - מגדל שלום"
                className="w-full min-h-[50px] bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white text-slate-900 font-bold text-sm px-4 rounded-xl focus:outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
              />
            </div>
          </div>

          {/* 2. Facility Code */}
          <div>
            <label className="block text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-1.5">
              קוד מזהה ייחודי <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Barcode className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="לדוגמה: SITE-04 או CDB-02"
                dir="ltr"
                className="w-full min-h-[50px] bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white text-slate-900 font-mono font-bold text-sm pr-10 pl-4 rounded-xl focus:outline-none transition-all placeholder:text-slate-400 placeholder:font-sans"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              קוד קצר באנגלית ובמספרים המשמש לקידוד ברקודים ותגיות NFC
            </p>
          </div>

          {/* 3. Facility Type */}
          <div>
            <label className="block text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-1.5">
              סוג המתקן <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('central_warehouse')}
                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer ${
                  type === 'central_warehouse'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Building2 className={`w-5 h-5 ${type === 'central_warehouse' ? 'text-blue-600' : 'text-slate-500'}`} />
                <span>מחסן מרכזי</span>
              </button>

              <button
                type="button"
                onClick={() => setType('site_container')}
                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer ${
                  type === 'site_container'
                    ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Container className={`w-5 h-5 ${type === 'site_container' ? 'text-amber-600' : 'text-slate-500'}`} />
                <span>מכולת אתר</span>
              </button>

              <button
                type="button"
                onClick={() => setType('service_van')}
                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer ${
                  type === 'service_van'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Truck className={`w-5 h-5 ${type === 'service_van' ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span>רכב שירות</span>
              </button>
            </div>
          </div>

          {/* 4. Physical Address / Location */}
          <div>
            <label className="block text-xs uppercase font-extrabold text-slate-700 tracking-wider mb-1.5">
              כתובת או מיקום פיזי <span className="text-slate-400 text-[10px]">(אופציונלי)</span>
            </label>
            <div className="relative">
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <MapPin className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="לדוגמה: מתחם תעשייה צפון, חיפה"
                className="w-full min-h-[50px] bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white text-slate-900 font-medium text-sm pr-10 pl-4 rounded-xl focus:outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* 5. Active Status (In Edit Mode) */}
          {isEditing && (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-800 block">סטטוס מתקן פעיל</span>
                <span className="text-[11px] text-slate-500">
                  מתקן מושבת לא יוצג בתפריטי הקליטה וההעברה
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-slate-200 text-slate-600 border border-slate-300'
                }`}
              >
                {isActive ? 'פעיל במערכת' : 'מושבת'}
              </button>
            </div>
          )}

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[54px] rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>שומר נתוני מתקן...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span>{isEditing ? 'עדכן מתקן' : 'שמור מתקן חדש'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
