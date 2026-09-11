'use client';

import React, { useState, useCallback } from 'react';
import { KeyRound, X, Delete, ShieldAlert, CheckCircle2, UserCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PinPadModal() {
  const { isPinModalOpen } = useAuth();
  if (!isPinModalOpen) return null;
  return <PinPadDialog />;
}

function PinPadDialog() {
  const { closePinModal, loginWithPin, switchToWorker, role } = useAuth();
  const [pin, setPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 4) return;
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);

      // Auto verify when 4 digits are reached
      if (nextPin.length === 4) {
        const result = loginWithPin(nextPin);
        if (result.success) {
          setIsSuccess(true);
          setTimeout(() => {
            setIsSuccess(false);
            setPin('');
          }, 400);
        } else {
          setErrorMessage(result.error || 'קוד שגוי');
          setTimeout(() => {
            setPin('');
          }, 800);
        }
      }
    },
    [pin, loginWithPin]
  );

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setErrorMessage(null);
  }, []);

  const handlePresetSelect = (code: string) => {
    setPin(code);
    setErrorMessage(null);
    const result = loginWithPin(code);
    if (result.success) {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setPin('');
      }, 400);
    } else {
      setErrorMessage(result.error || 'קוד שגוי');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border-2 border-blue-200 overflow-hidden flex flex-col text-slate-900 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-900 to-blue-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="pin-modal-title" className="text-base font-black leading-tight">
                החלפת הרשאה / כניסת מנהל
              </h2>
              <p className="text-xs text-blue-200/80 font-semibold">
                הזן קוד PIN בעל 4 ספרות
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePinModal}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col items-center">
          {/* Active Mode Notice */}
          <div className="w-full mb-4 p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
            <span className="font-bold text-blue-950">מצב נוכחי:</span>
            <span className="font-black text-blue-700">
              {role === 'admin'
                ? '🛡️ מנהל פרויקט'
                : role === 'supervisor'
                ? '🔑 מנהל עבודה'
                : '👷 עובד שטח'}
            </span>
          </div>

          {/* 4-digit PIN Dots */}
          <div className="flex items-center gap-4 my-2">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                    isSuccess
                      ? 'bg-emerald-500 border-emerald-600 scale-110 shadow-md shadow-emerald-500/30'
                      : isFilled
                      ? 'bg-blue-600 border-blue-700 scale-105 shadow-md shadow-blue-500/25'
                      : 'bg-slate-100 border-slate-300'
                  }`}
                />
              );
            })}
          </div>

          {/* Error Message */}
          <div className="h-7 mt-1 flex items-center">
            {errorMessage ? (
              <span className="text-xs font-bold text-red-600 flex items-center gap-1 animate-in fade-in">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                {errorMessage}
              </span>
            ) : isSuccess ? (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                אימות הצליח! מעביר הרשאה...
              </span>
            ) : null}
          </div>

          {/* Touch-Optimized Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 w-full mt-2" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="h-14 rounded-2xl bg-slate-100 hover:bg-blue-50 active:bg-blue-600 active:text-white border border-slate-200 text-xl font-black text-slate-800 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black transition-all flex items-center justify-center cursor-pointer border border-slate-200 active:scale-95"
            >
              נקה
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-14 rounded-2xl bg-slate-100 hover:bg-blue-50 active:bg-blue-600 active:text-white border border-slate-200 text-xl font-black text-slate-800 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-black transition-all flex items-center justify-center cursor-pointer border border-slate-200 active:scale-95"
              title="מחק ספרה אחרונה"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Demo Shortcuts & Role Presets */}
          <div className="w-full mt-4 pt-3 border-t border-slate-200 space-y-2">
            <div className="text-[11px] font-bold text-slate-500 text-center">
              כניסה מהירה לשטח (הדגמה):
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handlePresetSelect('1234')}
                className="px-2.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>מנהל עבודה (1234)</span>
              </button>
              <button
                type="button"
                onClick={() => handlePresetSelect('9999')}
                className="px-2.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>מנהל פרויקט (9999)</span>
              </button>
            </div>

            {/* Switch to Worker Button if elevated */}
            {role !== 'worker' && (
              <button
                type="button"
                onClick={switchToWorker}
                className="w-full mt-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>👷 חזרה למצב עובד שטח (ללא הרשאות ניהול)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
