'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Printer,
  Settings2,
  Wrench,
  Sparkles,
  Scan,
  Layers,
  History as HistoryIcon,
  ShieldAlert,
  KeyRound,
  HardHat,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import UserRoleHeaderPill from '@/components/common/UserRoleHeaderPill';

interface TagItem {
  serial: string;
  qrDataUrl: string;
}

export default function PrintTagsView() {
  const { role, openPinModal } = useAuth();

  // Config state
  const [prefix, setPrefix] = useState<string>('TOOL-');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(24);
  const [customQtyInput, setCustomQtyInput] = useState<string>('24');
  const [facilityText, setFacilityText] = useState<string>(
    'מחסן מרכזי - ציוד קבוע'
  );

  // Generated tags state
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Compute list of serials
  const serials = useMemo(() => {
    const list: string[] = [];
    const validQty = Math.max(1, Math.min(quantity, 200));
    const padLength = Math.max(4, String(startNumber + validQty).length);

    for (let i = 0; i < validQty; i++) {
      const num = startNumber + i;
      const paddedNum = String(num).padStart(padLength, '0');
      list.push(`${prefix.trim().toUpperCase()}${paddedNum}`);
    }
    return list;
  }, [prefix, startNumber, quantity]);

  // Generate QR Data URLs asynchronously
  useEffect(() => {
    let isCurrent = true;

    const generateQrs = async () => {
      try {
        const results = await Promise.all(
          serials.map(async (serial) => {
            const qrDataUrl = await QRCode.toDataURL(serial, {
              width: 360,
              margin: 1,
              errorCorrectionLevel: 'M',
              color: {
                dark: '#000000',
                light: '#ffffff',
              },
            });
            return { serial, qrDataUrl };
          })
        );

        if (isCurrent) {
          setTags(results);
          setIsGenerating(false);
        }
      } catch (err) {
        console.error('Failed generating QR tags:', err);
        if (isCurrent) setIsGenerating(false);
      }
    };

    generateQrs();

    return () => {
      isCurrent = false;
    };
  }, [serials]);

  const handleQuantitySelect = (qty: number) => {
    setQuantity(qty);
    setCustomQtyInput(String(qty));
  };

  const handleCustomQtyChange = (val: string) => {
    setCustomQtyInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(Math.min(parsed, 200));
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-blue-950 font-sans print:bg-white print:text-black">
      {/* Global Print-specific CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .industrial-tag {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* 1. SCREEN-ONLY CONFIGURATION HEADER & CONTROLS */}
      <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="min-h-[44px] px-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 flex items-center gap-1.5 font-bold text-xs transition-all active:scale-95 cursor-pointer"
              title="סורק מהיר"
            >
              <Scan className="w-4 h-4" />
              <span>סורק</span>
            </Link>
            <Link
              href="/catalog"
              className="min-h-[44px] px-3 rounded-xl bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-800 flex items-center gap-1.5 font-bold text-xs transition-all active:scale-95 cursor-pointer"
              title="קטלוג כלים"
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>קטלוג</span>
            </Link>
            <Link
              href="/history"
              className="min-h-[44px] px-3 rounded-xl bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-blue-800 flex items-center gap-1.5 font-bold text-xs transition-all active:scale-95 cursor-pointer"
              title="יומן תנועות"
            >
              <HistoryIcon className="w-4 h-4 text-blue-600" />
              <span>יומן</span>
            </Link>
            <div className="hidden sm:block pr-2 border-r border-blue-100">
              <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold">
                הפקת תגיות
              </div>
              <h1 className="text-sm font-black text-blue-950 leading-tight">
                הדפסת תגיות ברקוד / QR
              </h1>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2">
            <UserRoleHeaderPill />

            {role !== 'worker' && (
              <button
                type="button"
                onClick={handlePrint}
                disabled={isGenerating || tags.length === 0}
                className="min-h-[52px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-5 h-5 stroke-[2.5]" />
                <span>הדפס גיליון תגיות</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* WORKER RESTRICTED SCREEN */}
      {role === 'worker' ? (
        <div className="print:hidden max-w-md mx-auto my-12 px-4">
          <div className="rounded-3xl bg-white border-2 border-amber-200 p-6 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-300">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                גישה מוגבלת - הדפסת תגיות ברקוד
              </h2>
              <p className="text-xs text-slate-600 font-medium mt-1">
                הדפסת תגיות וקליטת פריטים חדשים למחסן שמורות למנהלי עבודה ומנהלי פרויקט בלבד.
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-bold flex items-center justify-center gap-1.5">
              <HardHat className="w-4 h-4 text-amber-600" />
              <span>אתה מחובר כעת במצב עובד שטח</span>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={openPinModal}
                className="w-full min-h-[52px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 transition-all cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>הזן קוד PIN לכניסת מנהל</span>
              </button>
              <Link
                href="/"
                className="w-full py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                חזור לסורק המהיר
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 2. CONFIGURATION DRAWER (Screen-only) */}
          <div className="print:hidden max-w-4xl mx-auto px-4 py-4">
            <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Settings2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                  הגדרות תגיות ומספור סידורי
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Prefix */}
                <div>
                  <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                    קידומת מזהה (Prefix)
                  </label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="TOOL-"
                    className="w-full min-h-[48px] bg-white text-blue-950 font-mono font-bold text-base px-3.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none uppercase shadow-sm"
                    dir="ltr"
                  />
                </div>

                {/* Starting Number */}
                <div>
                  <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                    מספר התחלתי
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={startNumber}
                    onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full min-h-[48px] bg-white text-blue-950 font-mono font-bold text-base px-3.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                    dir="ltr"
                  />
                </div>

                {/* Facility / Warehouse Label */}
                <div>
                  <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                    שם האתר / מחסן על התגית
                  </label>
                  <input
                    type="text"
                    value={facilityText}
                    onChange={(e) => setFacilityText(e.target.value)}
                    placeholder="מחסן ראשי"
                    className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm px-3.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                  />
                </div>

                {/* Tag Quantity Presets */}
                <div>
                  <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                    כמות תגיות להדפסה
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[12, 24, 48].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => handleQuantitySelect(qty)}
                        className={`min-h-[48px] rounded-xl font-black text-xs transition-all border cursor-pointer ${
                          quantity === qty
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50'
                        }`}
                      >
                        {qty}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={customQtyInput}
                      onChange={(e) => handleCustomQtyChange(e.target.value)}
                      placeholder="מותאם"
                      title="כמות מותאמת אישית"
                      className="min-h-[48px] w-full text-center bg-white text-blue-950 font-bold text-xs rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Summary / Range Preview */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs font-medium text-slate-500 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>
                    טווח ברקודים מופק: <strong className="font-mono text-blue-950" dir="ltr">{serials[0]}</strong> עד{' '}
                    <strong className="font-mono text-blue-950" dir="ltr">{serials[serials.length - 1]}</strong>
                  </span>
                </div>
                <div className="text-slate-400">
                  סה&quot;כ: <strong className="text-blue-900 font-bold">{tags.length} תגיות</strong> (מותאם לפורמט גיליון A4)
                </div>
              </div>
            </div>
          </div>

          {/* 3. PRINTABLE INDUSTRIAL TAGS GRID (A4 Optimized) */}
          <main className="max-w-4xl mx-auto px-4 pb-28 print:p-0 print:m-0 print:max-w-none">
            {isGenerating ? (
              <div className="p-12 text-center text-slate-400 font-bold text-sm">
                מייצר תגיות QR באיכות גבוהה...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3 gap-3 print:gap-2">
                {tags.map((tag) => (
                  <div
                    key={tag.serial}
                    className="industrial-tag bg-white border-2 border-slate-900 rounded-xl p-3 flex flex-col items-center justify-between text-center shadow-sm print:shadow-none print:border-slate-800 print:rounded-lg print:p-2 min-h-[165px]"
                  >
                    {/* Tag Header */}
                    <div className="w-full flex items-center justify-between border-b-2 border-slate-900 pb-1 mb-1.5 print:border-slate-800">
                      <div className="flex items-center gap-1 font-black text-xs text-slate-950 tracking-wider">
                        <Wrench className="w-3.5 h-3.5 text-blue-600 print:text-black" />
                        <span>TOOLY</span>
                      </div>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 print:border-black">
                        ציוד מבוקר
                      </span>
                    </div>

                    {/* QR Code Canvas/Image */}
                    <div className="my-1 p-1 bg-white rounded flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tag.qrDataUrl}
                        alt={`QR Code for ${tag.serial}`}
                        className="w-24 h-24 print:w-20 print:h-20 object-contain"
                      />
                    </div>

                    {/* High-Contrast Monospace Serial Code */}
                    <div className="w-full mt-1 pt-1 border-t border-slate-200 print:border-slate-400 text-center">
                      <div className="text-xs font-mono font-black text-slate-950 tracking-wider select-all" dir="ltr">
                        {tag.serial}
                      </div>
                      <div className="text-[9px] font-bold text-slate-600 truncate mt-0.5">
                        {facilityText}
                      </div>
                    </div>

                    {/* Micro Security Notice */}
                    <div className="w-full text-[8px] font-semibold text-slate-400 mt-1 print:text-black flex items-center justify-center gap-1">
                      <span>סרוק לבדיקה וניפוק • אין להסיר</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </>
      )}

      {/* 4. UNIVERSAL BOTTOM NAVIGATION BAR (Screen only) */}
      <nav
        aria-label="ניווט ראשי"
        className="print:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {/* 1. Scanner */}
          <Link
            href="/"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Scan className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">סורק מהיר / ניפוק</span>
          </Link>

          {/* 2. Tools Catalog */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Layers className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">קטלוג ומלאי</span>
          </Link>

          {/* 3. History */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <HistoryIcon className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">יומן תנועות</span>
          </Link>

          {/* 4. Print QR Tags (ACTIVE) */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <Printer className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">הדפסת תגיות</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
