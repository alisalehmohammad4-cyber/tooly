'use client';

import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  Settings2,
  Wrench,
  Sparkles,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

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
    <AppLayout
      title="Tooly - הדפסת תגיות ברקוד"
      subtitle="הפקת מדבקות A4"
      requiredRole="any_elevated"
    >
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

      {/* 1. CONFIGURATION DRAWER (Screen-only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 py-4">
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                הגדרות תגיות ומספור סידורי
              </h2>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isGenerating || tags.length === 0}
              className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-600/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>הדפס גיליון תגיות</span>
            </button>
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

      {/* 2. PRINTABLE INDUSTRIAL TAGS GRID (A4 Optimized) */}
      <div className="max-w-4xl mx-auto px-4 pb-12 print:p-0 print:m-0 print:max-w-none">
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
      </div>
    </AppLayout>
  );
}
