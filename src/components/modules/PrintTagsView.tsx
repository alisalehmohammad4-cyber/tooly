'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  Settings2,
  Wrench,
  Sparkles,
  CheckCircle2,
  Search,
  RotateCcw,
  Tag,
  Building2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { getNextAvailableTagNumberAction } from '@/app/actions/assets';
import { getAssetDetailsByQr, type ScannedAssetDetails } from '@/app/actions/custody';

interface TagItem {
  serial: string;
  qrDataUrl: string;
  toolName?: string;
  facilityName?: string;
  isReprint?: boolean;
}

type PrintMode = 'batch' | 'reprint';
type LabelFormat = 'tsc' | 'a4';

export default function PrintTagsView() {
  // Mode selection: Tab A (Batch) vs Tab B (Reprint)
  const [activeTab, setActiveTab] = useState<PrintMode>('batch');

  // Label format: TSC thermal roll 60x30 mm [Default] vs A4 office sheet
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('tsc');

  // Tab A: Batch Config State
  const [prefix, setPrefix] = useState<string>('TOOL-');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [suggestedStartNumber, setSuggestedStartNumber] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(24);
  const [customQtyInput, setCustomQtyInput] = useState<string>('24');
  const [facilityText, setFacilityText] = useState<string>('מחסן מרכזי - ציוד קבוע');

  // Tab B: Reprint Damaged Label State
  const [reprintSearchInput, setReprintSearchInput] = useState<string>('');
  const [isSearchingReprint, setIsSearchingReprint] = useState<boolean>(false);
  const [reprintAsset, setReprintAsset] = useState<ScannedAssetDetails | null>(null);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [reprintQuantity, setReprintQuantity] = useState<number>(1);

  // Generated printable tags state
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // 1. Auto-population: fetch highest existing serial from database and mockStore on mount / prefix change
  useEffect(() => {
    let isCurrent = true;

    const fetchNextSequentialNumber = async () => {
      try {
        const nextNum = await getNextAvailableTagNumberAction(prefix);

        // Check local storage for offline / last printed fallback
        let lastPrinted = 0;
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('tooly_last_printed_end_number');
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
              lastPrinted = parsed;
            }
          }
        }

        const bestNext = Math.max(nextNum, lastPrinted > 0 ? lastPrinted + 1 : 1);

        if (isCurrent) {
          setSuggestedStartNumber(bestNext);
          setStartNumber(bestNext);
        }
      } catch (err) {
        console.warn('Error fetching next available tag number:', err);
      }
    };

    fetchNextSequentialNumber();

    return () => {
      isCurrent = false;
    };
  }, [prefix]);

  // Compute batch list of serials
  const batchSerials = useMemo(() => {
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

  // Generate QR Data URLs for active mode
  useEffect(() => {
    let isCurrent = true;

    const generateQrs = async () => {
      try {
        if (activeTab === 'batch') {
          const results = await Promise.all(
            batchSerials.map(async (serial) => {
              const qrDataUrl = await QRCode.toDataURL(serial, {
                width: 360,
                margin: 1,
                errorCorrectionLevel: 'M',
                color: {
                  dark: '#000000',
                  light: '#ffffff',
                },
              });
              return {
                serial,
                qrDataUrl,
                facilityName: facilityText,
                isReprint: false,
              };
            })
          );

          if (isCurrent) {
            setTags(results);
            setIsGenerating(false);
          }
        } else {
          // Tab B: Reprint Mode
          if (!reprintAsset) {
            if (isCurrent) {
              setTags([]);
              setIsGenerating(false);
            }
            return;
          }

          const qrDataUrl = await QRCode.toDataURL(reprintAsset.qrCode, {
            width: 360,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });

          const count = Math.max(1, Math.min(reprintQuantity, 24));
          const singleTag: TagItem = {
            serial: reprintAsset.qrCode,
            qrDataUrl,
            toolName: reprintAsset.toolName,
            facilityName: reprintAsset.warehouseName,
            isReprint: true,
          };

          const results = Array.from({ length: count }, () => ({ ...singleTag }));

          if (isCurrent) {
            setTags(results);
            setIsGenerating(false);
          }
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
  }, [activeTab, batchSerials, facilityText, reprintAsset, reprintQuantity]);

  // Handle Reprint Tool Search
  const handleSearchReprint = useCallback(async () => {
    const q = reprintSearchInput.trim();
    if (!q) return;

    setIsSearchingReprint(true);
    setReprintError(null);

    try {
      const asset = await getAssetDetailsByQr(q);
      if (asset) {
        setReprintAsset(asset);
        setReprintError(null);
      } else {
        setReprintAsset(null);
        setReprintError(`לא נמצא כלי התואם למזהה/סיומת "${q}". נא לבדוק את המספר או לחפש בקטלוג.`);
      }
    } catch (err) {
      console.error('Error finding asset for reprint:', err);
      setReprintError('שגיאה באיתור הכלי במערכת.');
    } finally {
      setIsSearchingReprint(false);
    }
  }, [reprintSearchInput]);

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
      if (activeTab === 'batch') {
        const endNumber = startNumber + Math.max(1, Math.min(quantity, 200)) - 1;
        try {
          localStorage.setItem('tooly_last_printed_end_number', String(endNumber));
        } catch {
          // localStorage disabled or private mode
        }
      }
      window.print();
    }
  };

  return (
    <AppLayout
      title="Tooly - הדפסת תגיות ברקוד"
      subtitle={
        labelFormat === 'tsc'
          ? 'גליל מדבקות תרמי TSC (60×30 מ״מ)'
          : 'דף מדבקות משרדי A4 ורצף סידורי'
      }
      requiredRole="any_elevated"
    >
      {/* Global Print-specific CSS */}
      {labelFormat === 'tsc' ? (
        <style jsx global>{`
          @page {
            size: 60mm 30mm;
            margin: 0mm;
          }
          @media print {
            html, body {
              width: 60mm !important;
              height: 30mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .tsc-container {
              display: block !important;
              width: 60mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .tsc-label {
              width: 60mm !important;
              height: 30mm !important;
              max-width: 60mm !important;
              max-height: 30mm !important;
              page-break-after: always !important;
              break-after: page !important;
              display: flex !important;
              box-sizing: border-box !important;
              padding: 2mm 3mm !important;
              overflow: hidden !important;
            }
          }
        `}</style>
      ) : (
        <style jsx global>{`
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          @media print {
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
      )}

      {/* 1. CONFIGURATION DRAWER (Screen-only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Label Format Selector (TSC Thermal 60x30 mm vs A4 Office Sheet) */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-3.5 shadow-sm shadow-slate-950/5 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-blue-600" />
              פורמט מדפסת ותוויות:
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {labelFormat === 'tsc'
                ? 'גליל תרמי TSC רציף (60×30 מ״מ)'
                : 'דף מדבקות משרדי (A4)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Option 1: TSC 60x30 mm [Default] */}
            <button
              type="button"
              onClick={() => setLabelFormat('tsc')}
              className={`min-h-[52px] p-3 rounded-xl text-xs font-black flex items-center justify-between transition-all cursor-pointer border ${
                labelFormat === 'tsc'
                  ? 'bg-blue-50/90 text-blue-950 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 text-right">
                <span className="text-xl">🏷️</span>
                <div>
                  <div className="font-black text-xs text-blue-950">
                    גליל מדבקות תרמי TSC (60×30 מ״מ)
                  </div>
                  <div className="text-[10px] font-medium text-slate-500">
                    מדפסת תרמית תעשייתית רציפה (מדבקה אחר מדבקה)
                  </div>
                </div>
              </div>
              {labelFormat === 'tsc' && (
                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md shrink-0">
                  ברירת מחדל
                </span>
              )}
            </button>

            {/* Option 2: A4 Office Sheet */}
            <button
              type="button"
              onClick={() => setLabelFormat('a4')}
              className={`min-h-[52px] p-3 rounded-xl text-xs font-black flex items-center justify-between transition-all cursor-pointer border ${
                labelFormat === 'a4'
                  ? 'bg-blue-50/90 text-blue-950 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 text-right">
                <span className="text-xl">📄</span>
                <div>
                  <div className="font-black text-xs text-blue-950">
                    דף מדבקות משרדי A4
                  </div>
                  <div className="text-[10px] font-medium text-slate-500">
                    מדפסת משרדית רגילה (לייזר / הזרקת דיו)
                  </div>
                </div>
              </div>
              {labelFormat === 'a4' && (
                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-md shrink-0">
                  נבחר
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`flex-1 min-h-[46px] rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'batch'
                ? 'bg-white text-blue-950 shadow-md shadow-slate-300/40 border border-slate-200'
                : 'text-slate-600 hover:text-blue-900 hover:bg-white/60'
            }`}
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span>הדפסה רציפה (רצף מדבקות חדשות)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reprint')}
            className={`flex-1 min-h-[46px] rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'reprint'
                ? 'bg-white text-blue-950 shadow-md shadow-slate-300/40 border border-slate-200'
                : 'text-slate-600 hover:text-blue-900 hover:bg-white/60'
            }`}
          >
            <RotateCcw className="w-4 h-4 text-amber-600" />
            <span>הדפסה חוזרת לכלי קיים (מדבקה בלויה)</span>
          </button>
        </div>

        {/* TAB A: BATCH SEQUENTIAL PRINTING CONFIG */}
        {activeTab === 'batch' && (
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
                <span>
                  {labelFormat === 'tsc'
                    ? 'הדפס גליל תרמי TSC (60×30)'
                    : 'הדפס גיליון מדבקות (A4)'}
                </span>
              </button>
            </div>

            {/* Smart sequential start number badge */}
            {suggestedStartNumber && (
              <div className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    מספר התחלתי מוצע ברצף:{' '}
                    <strong className="font-mono text-emerald-950 text-sm">
                      {suggestedStartNumber}
                    </strong>{' '}
                    (על בסיס הכלים הקיימים במערכת)
                  </span>
                </div>

                {startNumber !== suggestedStartNumber && (
                  <button
                    type="button"
                    onClick={() => setStartNumber(suggestedStartNumber)}
                    className="text-xs font-black text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                  >
                    שחזר מספר מוצע ברצף
                  </button>
                )}
              </div>
            )}

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

              {/* Starting Number (100% editable without locks) */}
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

              {/* Tag Quantity Presets (1 to 200) */}
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  כמות תגיות (1 עד 200)
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
                    title="כמות מותאמת אישית (1 עד 200)"
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
                  טווח ברקודים מופק:{' '}
                  <strong className="font-mono text-blue-950" dir="ltr">
                    {batchSerials[0]}
                  </strong>{' '}
                  עד{' '}
                  <strong className="font-mono text-blue-950" dir="ltr">
                    {batchSerials[batchSerials.length - 1]}
                  </strong>
                </span>
              </div>
              <div className="text-slate-400">
                סה&quot;כ:{' '}
                <strong className="text-blue-900 font-bold">{tags.length} תגיות</strong>{' '}
                {labelFormat === 'tsc'
                  ? '(גליל מדבקות תרמי TSC 60×30 מ״מ)'
                  : '(גיליון מדבקות משרדי A4)'}
              </div>
            </div>
          </div>
        )}

        {/* TAB B: REPRINT DAMAGED LABEL MODE */}
        {activeTab === 'reprint' && (
          <div className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-amber-900">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-black uppercase tracking-wider">
                  הדפסת מדבקה חלופית (שחזור מדבקה בלויה / פגומה)
                </h2>
              </div>

              {reprintAsset && (
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isGenerating || tags.length === 0}
                  className="min-h-[44px] px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-amber-600/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {labelFormat === 'tsc'
                      ? `הדפס מדבקה תרמית (${reprintQuantity})`
                      : `הדפס מדבקה חלופית (${reprintQuantity})`}
                  </span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-600 font-medium">
              הזן את הברקוד המלא או סיומת המספר (למשל &quot;001&quot;, &quot;WLD-001&quot; או &quot;TOOL-WLD-001&quot;) כדי לשחזר ולהדפיס מדבקת החלפה מדויקת לכלי.
            </p>

            {/* Search Input Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={reprintSearchInput}
                  onChange={(e) => setReprintSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearchReprint();
                  }}
                  placeholder="הזן ברקוד או סיומת כלי (לדוגמה: 001 או TOOL-WLD-001)..."
                  className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pr-10 pl-4 py-2 rounded-xl border-2 border-amber-200 focus:border-amber-600 focus:outline-none shadow-sm"
                  dir="ltr"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSearchReprint()}
                  disabled={isSearchingReprint || !reprintSearchInput.trim()}
                  className="min-h-[48px] px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSearchingReprint ? (
                    <span>מחפש...</span>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>אתר כלי לשחזור</span>
                    </>
                  )}
                </button>

                {reprintAsset && (
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 min-h-[48px]">
                    <span className="text-xs font-bold text-slate-600">עותקים:</span>
                    <select
                      value={reprintQuantity}
                      onChange={(e) => setReprintQuantity(parseInt(e.target.value, 10))}
                      className="bg-white border border-slate-300 font-black text-xs rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
                    >
                      {[1, 2, 4, 8, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {reprintError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reprintError}</span>
              </div>
            )}

            {/* Found Asset Card Preview */}
            {reprintAsset && (
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      {reprintAsset.brand}
                    </span>
                    <span className="font-mono text-xs font-black text-blue-950 bg-white px-2 py-0.5 rounded border border-amber-200" dir="ltr">
                      {reprintAsset.qrCode}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-blue-950">{reprintAsset.toolName}</h3>
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{reprintAsset.warehouseName}</span>
                    {reprintAsset.modelNumber && (
                      <span className="font-mono" dir="ltr">
                        &bull; {reprintAsset.modelNumber}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="min-h-[42px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      {labelFormat === 'tsc'
                        ? 'הדפס מדבקה תרמית'
                        : 'הדפס מדבקה חלופית'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. PRINTABLE INDUSTRIAL TAGS (TSC 60x30 mm Roll or A4 Sheets) */}
      <div className="max-w-4xl mx-auto px-4 pb-12 print:p-0 print:m-0 print:max-w-none">
        {isGenerating ? (
          <div className="p-12 text-center text-slate-400 font-bold text-sm">
            מייצר תגיות QR באיכות גבוהה...
          </div>
        ) : tags.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200 max-w-lg mx-auto space-y-2">
            <Tag className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-black text-slate-700">אין תגיות מוכנות להדפסה</p>
            <p className="text-xs text-slate-500">
              {activeTab === 'reprint'
                ? 'חפש כלי קיים לפי ברקוד או סיומת כדי להפיק מדבקה חלופית.'
                : labelFormat === 'tsc'
                ? 'הגדר את המספור והכמות למעלה כדי להפיק גליל מדבקות תרמי (60×30 מ״מ).'
                : 'הגדר את המספור והכמות למעלה כדי להפיק גיליון מדבקות A4.'}
            </p>
          </div>
        ) : labelFormat === 'tsc' ? (
          /* TSC THERMAL LABEL 60x30 mm ROLL */
          <div className="tsc-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 print:block print:w-[60mm] print:m-0 print:p-0">
            {tags.map((tag, idx) => (
              <div
                key={`${tag.serial}-${idx}`}
                className="tsc-label bg-white border-2 border-slate-900 rounded-xl p-2.5 flex items-center justify-between gap-2.5 shadow-sm print:shadow-none print:border-none print:rounded-none print:m-0 h-auto sm:h-[135px]"
              >
                {/* Information Column (RTL: Right side) */}
                <div className="flex-1 flex flex-col justify-between h-full min-w-0 text-right pr-0.5">
                  {/* Brand & Badge Header */}
                  <div className="flex items-center justify-between gap-1 border-b border-slate-900 pb-0.5 mb-1 print:border-black">
                    <div className="flex items-center gap-1 font-black text-xs text-slate-950 tracking-wider">
                      <Wrench className="w-3.5 h-3.5 text-blue-600 print:text-black shrink-0" />
                      <span>TOOLY</span>
                    </div>
                    <span
                      className={`text-[8.5px] font-black uppercase px-1 py-0.5 rounded border leading-none ${
                        tag.isReprint
                          ? 'bg-amber-100 text-amber-900 border-amber-300 print:border-black'
                          : 'bg-slate-100 text-slate-800 border-slate-300 print:border-black'
                      }`}
                    >
                      {tag.isReprint ? 'חלופית' : 'ציוד מבוקר'}
                    </span>
                  </div>

                  {/* Serial Code */}
                  <div
                    className="font-mono font-black text-xs sm:text-sm print:text-[11px] text-slate-950 tracking-wider select-all leading-tight"
                    dir="ltr"
                  >
                    {tag.serial}
                  </div>

                  {/* Tool Name / Facility Location */}
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {tag.toolName && (
                      <div className="text-[10px] print:text-[9px] font-black text-slate-800 truncate leading-tight">
                        {tag.toolName}
                      </div>
                    )}
                    <div className="text-[9px] print:text-[8px] font-bold text-slate-600 truncate leading-tight">
                      {tag.facilityName || facilityText}
                    </div>
                  </div>

                  {/* Micro Notice */}
                  <div className="text-[7.5px] print:text-[7.5px] font-bold text-slate-500 print:text-black mt-1 truncate">
                    סרוק לבדיקה וניפוק • Tooly
                  </div>
                </div>

                {/* QR Code Column (RTL: Left side) */}
                <div className="shrink-0 flex items-center justify-center bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tag.qrDataUrl}
                    alt={`QR Code for ${tag.serial}`}
                    className="w-20 h-20 print:w-[24mm] print:h-[24mm] object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* A4 SHEET OFFICE GRID */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3 gap-3 print:gap-2">
            {tags.map((tag, idx) => (
              <div
                key={`${tag.serial}-${idx}`}
                className="industrial-tag bg-white border-2 border-slate-900 rounded-xl p-3 flex flex-col items-center justify-between text-center shadow-sm print:shadow-none print:border-slate-800 print:rounded-lg print:p-2 min-h-[165px]"
              >
                {/* Tag Header */}
                <div className="w-full flex items-center justify-between border-b-2 border-slate-900 pb-1 mb-1.5 print:border-slate-800">
                  <div className="flex items-center gap-1 font-black text-xs text-slate-950 tracking-wider">
                    <Wrench className="w-3.5 h-3.5 text-blue-600 print:text-black" />
                    <span>TOOLY</span>
                  </div>
                  <span
                    className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                      tag.isReprint
                        ? 'bg-amber-100 text-amber-900 border-amber-300 print:border-black'
                        : 'bg-slate-100 text-slate-800 border-slate-300 print:border-black'
                    }`}
                  >
                    {tag.isReprint ? 'מדבקה חלופית' : 'ציוד מבוקר'}
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
                  {tag.toolName ? (
                    <div className="text-[10px] font-bold text-slate-800 truncate mt-0.5">
                      {tag.toolName}
                    </div>
                  ) : null}
                  <div className="text-[9px] font-bold text-slate-600 truncate mt-0.5">
                    {tag.facilityName || facilityText}
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
