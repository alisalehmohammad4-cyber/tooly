'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Printer,
  Settings2,
  Wrench,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Scan,
  Layers,
  History as HistoryIcon,
} from 'lucide-react';

interface TagItem {
  serial: string;
  qrDataUrl: string;
}

export default function PrintTagsView() {
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

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isGenerating || tags.length === 0}
            className="min-h-[52px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-5 h-5 stroke-[2.5]" />
            <span>הדפס גיליון תגיות</span>
          </button>
        </div>
      </header>

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
                className="w-full min-h-[48px] bg-white text-blue-950 font-mono font-bold text-sm px-3 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                dir="ltr"
              />
            </div>

            {/* Start Number */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                מספר התחלתי
              </label>
              <input
                type="number"
                min="1"
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full min-h-[48px] bg-white text-blue-950 font-mono font-bold text-sm px-3 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                dir="ltr"
              />
            </div>

            {/* Quantity Presets & Custom */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                כמות להדפסה ({quantity})
              </label>
              <div className="flex gap-1.5">
                {[12, 24, 48].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => handleQuantitySelect(qty)}
                    className={`flex-1 min-h-[48px] rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      quantity === qty
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-blue-900 border-slate-200 hover:border-blue-300'
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
                  className="w-16 min-h-[48px] bg-white text-blue-950 font-bold text-xs text-center rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Facility / Subtitle */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                שם אתר / מחלקה לתגית
              </label>
              <input
                type="text"
                value={facilityText}
                onChange={(e) => setFacilityText(e.target.value)}
                placeholder="מחסן מרכזי"
                className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm px-3 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
              />
            </div>
          </div>

          {/* Quick Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>
                טווח קודים: <strong className="font-mono text-blue-950 font-bold" dir="ltr">{serials[0]}</strong> עד{' '}
                <strong className="font-mono text-blue-950 font-bold" dir="ltr">{serials[serials.length - 1]}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500" />
              <span>
                הערכת גיליונות A4: כ-~{Math.ceil(serials.length / 12)} עמודים (12 תגיות לדף)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. PRINTABLE SHEET GRID */}
      <main className="max-w-4xl mx-auto px-4 py-4 print:max-w-none print:m-0 print:p-0">
        {isGenerating ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
            <div className="text-sm font-bold text-blue-950">מייצר תגיות ברקוד / QR ברזולוציה גבוהה...</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-3 print:gap-3 print:p-1">
            {tags.map((tag) => (
              <div
                key={tag.serial}
                className="industrial-tag relative bg-white text-black border-2 border-dashed border-slate-300 print:border-black print:border-2 rounded-lg print:rounded-none p-3 flex flex-col items-center justify-between text-center shadow-sm overflow-hidden"
              >
                {/* Cut guidelines indicator */}
                <div className="absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-slate-300 print:border-black pointer-events-none" />
                <div className="absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-slate-300 print:border-black pointer-events-none" />
                <div className="absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-slate-300 print:border-black pointer-events-none" />
                <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-slate-300 print:border-black pointer-events-none" />

                {/* Badge Industrial Header */}
                <div className="w-full bg-blue-950 text-white text-[10px] font-black uppercase tracking-widest py-0.5 px-2 rounded-sm print:bg-black print:text-white flex items-center justify-center gap-1.5 shadow-sm">
                  <Wrench className="w-2.5 h-2.5 text-blue-400 print:text-white shrink-0" />
                  <span>ציוד מנוהל TOOLY</span>
                </div>

                {/* Crisp QR Code Center */}
                <div className="my-2 p-1 bg-white flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tag.qrDataUrl}
                    alt={tag.serial}
                    className="w-28 h-28 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>

                {/* Badge Footer: Human Readable Monospace Serial & Facility */}
                <div className="w-full border-t border-slate-200 print:border-black pt-1.5 space-y-0.5">
                  <div className="font-mono font-black text-sm tracking-wider text-black" dir="ltr">
                    {tag.serial}
                  </div>
                  {facilityText && (
                    <div className="text-[9px] uppercase font-extrabold text-slate-700 print:text-black tracking-tight truncate">
                      {facilityText}
                    </div>
                  )}
                  <div className="text-[7px] uppercase tracking-widest text-slate-400 print:text-zinc-600 font-semibold">
                    סרוק לבדיקה וניפוק &bull; אין להסיר
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

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
