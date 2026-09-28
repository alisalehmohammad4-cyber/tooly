'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Printer,
  FileDown,
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
import { calculateNextTagNumber } from '@/app/actions/assets';
import { getAssetDetailsByQr, type ScannedAssetDetails } from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';

interface TagItem {
  serial: string;
  qrDataUrl: string;
  toolName?: string;
  facilityName?: string;
  isReprint?: boolean;
}

type PrintMode = 'batch' | 'reprint';

export function printThermalLabelsDirectly(labelsData: Array<{
  tagNumber: string;
  toolName: string;
  brand: string;
  qrCodeDataUrl: string;
  companyName: string;
}>) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('אנא אשר חלונות קופצים (Pop-ups) כדי להדפיס');
    return;
  }

  const labelsHtml = labelsData.map(label => `
    <div class="label-sheet">
      <div class="label-content">
        <div class="qr-col">
          <img src="${label.qrCodeDataUrl}" alt="QR" class="qr-img" />
          <span class="qr-tag">${label.tagNumber}</span>
        </div>
        <div class="info-col">
          <div class="company-title">${label.companyName || 'TOOLY'}</div>
          <div class="tool-name">${label.toolName}</div>
          <div class="tool-brand">${label.brand || ''}</div>
          <div class="tag-number">${label.tagNumber}</div>
        </div>
      </div>
    </div>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8" />
      <title>הדפסת תגיות TSC</title>
      <style>
        @page {
          size: 60mm 30mm; /* REMOVED 'landscape' keyword to fix CSS syntax */
          margin: 0mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        html, body {
          width: 60mm;
          height: 30mm;
          margin: 0mm !important;
          padding: 0mm !important;
          overflow: hidden;
          background: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .label-sheet {
          width: 60mm !important;
          height: 30mm !important;
          max-width: 60mm !important;
          max-height: 30mm !important;
          page-break-after: always;
          page-break-inside: avoid;
          box-sizing: border-box;
          margin: 0 !important;
          padding: 2mm !important;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .label-content {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: row-reverse;
          align-items: center;
          justify-content: space-between;
          border: 1px dashed #ccc;
          padding: 1.5mm;
        }
        .qr-col {
          width: 22mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .qr-img {
          width: 19mm;
          height: 19mm;
          object-fit: contain;
        }
        .qr-tag {
          font-size: 7px;
          font-weight: bold;
          font-family: monospace;
          margin-top: 1mm;
        }
        .info-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-left: 2mm;
          overflow: hidden;
        }
        .company-title {
          font-size: 8px;
          font-weight: 800;
          color: #333;
          text-transform: uppercase;
        }
        .tool-name {
          font-size: 9px;
          font-weight: bold;
          color: #000;
          line-height: 1.1;
          max-height: 10mm;
          overflow: hidden;
          margin: 1mm 0;
        }
        .tool-brand {
          font-size: 8px;
          color: #555;
        }
        .tag-number {
          font-size: 13px;
          font-weight: 900;
          font-family: monospace;
          color: #000;
          margin-top: 1mm;
          letter-spacing: 0.5px;
        }
      </style>
    </head>
    <body>
      ${labelsHtml}
      <script>
        function triggerPrint() {
          window.focus();
          window.print();
          window.onafterprint = function() { window.close(); };
        }
        if (document.readyState === 'complete') {
          setTimeout(triggerPrint, 200);
        } else {
          window.onload = function() {
            setTimeout(triggerPrint, 200);
          };
        }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function renderLabelToCanvasDataUrl(label: {
  tagNumber: string;
  toolName: string;
  brand: string;
  qrCodeDataUrl: string;
  companyName: string;
  isReprint?: boolean;
}): Promise<string> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 709; // 60mm @ 300 DPI
      canvas.height = 354; // 30mm @ 300 DPI
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Light dashed border
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      ctx.setLineDash([]); // reset dash

      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.onload = () => {
        // Draw QR code on the left side
        const qrSize = 224;
        const qrX = 36;
        const qrY = 32;
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // QR Tag Number under QR
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.direction = 'ltr';
        ctx.fillText(label.tagNumber, qrX + qrSize / 2, qrY + qrSize + 26);

        // Right side info (RTL text)
        const rightMargin = canvas.width - 36;
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';

        // 1. Company Name
        ctx.fillStyle = '#222222';
        ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        const compName = label.companyName || 'TOOLY';
        ctx.fillText(compName, rightMargin, 62);

        if (label.isReprint) {
          ctx.fillStyle = '#fef3c7';
          ctx.fillRect(qrX + qrSize + 24, 40, 80, 28);
          ctx.strokeStyle = '#f59e0b';
          ctx.strokeRect(qrX + qrSize + 24, 40, 80, 28);
          ctx.fillStyle = '#92400e';
          ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('חלופית', qrX + qrSize + 24 + 40, 60);
          ctx.textAlign = 'right';
        }

        // Divider under company name
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(qrX + qrSize + 24, 76);
        ctx.lineTo(rightMargin, 76);
        ctx.stroke();

        // 2. Tool Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        const toolDisplayName = label.toolName || 'ציוד מבוקר';
        ctx.fillText(toolDisplayName.slice(0, 32), rightMargin, 118);

        // 3. Brand / Model
        ctx.fillStyle = '#475569';
        ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        const brandText = label.brand || 'ציוד מקצועי';
        ctx.fillText(brandText.slice(0, 28), rightMargin, 156);

        // 4. Large bold Tag Number (Monospace)
        ctx.fillStyle = '#020617';
        ctx.font = '900 48px monospace';
        ctx.direction = 'ltr';
        ctx.textAlign = 'right';
        ctx.fillText(label.tagNumber, rightMargin, 230);

        // Divider above footer
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(qrX + qrSize + 24, 252);
        ctx.lineTo(rightMargin, 252);
        ctx.stroke();

        // 5. Micro Footer subtext
        ctx.direction = 'rtl';
        ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillStyle = '#64748b';
        const footerText = label.isReprint
          ? 'מדבקה חלופית • סרוק לבדיקה'
          : 'ציוד מבוקר • סרוק לבדיקה';
        ctx.fillText(footerText, rightMargin, 286);

        resolve(canvas.toDataURL('image/png'));
      };

      qrImg.onerror = () => {
        resolve(canvas.toDataURL('image/png'));
      };

      qrImg.src = label.qrCodeDataUrl;
    } catch {
      resolve('');
    }
  });
}

export async function downloadThermalLabelsPdf(labelsData: Array<{
  tagNumber: string;
  toolName: string;
  brand: string;
  qrCodeDataUrl: string;
  companyName: string;
  isReprint?: boolean;
}>) {
  if (typeof window === 'undefined' || labelsData.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [60, 30],
  });

  for (let i = 0; i < labelsData.length; i++) {
    if (i > 0) {
      doc.addPage([60, 30], 'landscape');
    }
    const label = labelsData[i];
    const dataUrl = await renderLabelToCanvasDataUrl(label);
    if (dataUrl) {
      doc.addImage(dataUrl, 'PNG', 0, 0, 60, 30);
    }
  }

  const firstSerial = labelsData[0]?.tagNumber || 'batch';
  const lastSerial = labelsData[labelsData.length - 1]?.tagNumber || '';
  const filename =
    labelsData.length > 1
      ? `tooly-tsc-labels-${firstSerial}-to-${lastSerial}.pdf`
      : `tooly-tsc-label-${firstSerial}.pdf`;

  doc.save(filename);
}

export default function PrintTagsView() {
  const { currentOrganization } = useAuth();

  const orgId = currentOrganization?.id || 'default';
  const orgSlug = currentOrganization?.slug || 'tooly';

  // Mode selection: Tab A (Batch) vs Tab B (Reprint)
  const [activeTab, setActiveTab] = useState<PrintMode>('batch');

  // Tab A: Batch Config State (Default prefix from currentOrganization)
  const [prefix, setPrefix] = useState<string>(() => currentOrganization?.serialPrefix || 'ZR-');
  const [startNumber, setStartNumber] = useState<number>(1099);
  const [suggestedStartNumber, setSuggestedStartNumber] = useState<number | null>(1099);
  const [quantity, setQuantity] = useState<number>(24);
  const [customQtyInput, setCustomQtyInput] = useState<string>('24');
  const [facilityText, setFacilityText] = useState<string>('מחסן מרכזי - ציוד קבוע');
  const [batchModelText, setBatchModelText] = useState<string>('');
  const [customCompanyName, setCustomCompanyName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return (
          localStorage.getItem(`tooly_company_name_${orgId}`) ||
          localStorage.getItem('tooly_company_name')
        );
      } catch (err) {
        console.warn('Error reading tooly_company_name from localStorage:', err);
      }
    }
    return null;
  });

  const effectiveCompanyName = customCompanyName ?? currentOrganization?.name ?? 'TOOLY';

  // Tab B: Reprint Damaged Label State
  const [reprintSearchInput, setReprintSearchInput] = useState<string>('');
  const [isSearchingReprint, setIsSearchingReprint] = useState<boolean>(false);
  const [reprintAsset, setReprintAsset] = useState<ScannedAssetDetails | null>(null);
  const [reprintError, setReprintError] = useState<string | null>(null);
  const [reprintQuantity, setReprintQuantity] = useState<number>(1);

  // Generated printable tags state
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Persist company name edits to localStorage
  const handleCompanyNameChange = useCallback(
    (value: string) => {
      setCustomCompanyName(value);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`tooly_company_name_${orgId}`, value);
        } catch (err) {
          console.warn('Error saving tooly_company_name to localStorage:', err);
        }
      }
    },
    [orgId]
  );

  // 1. Auto-population: fetch highest existing serial from database and mockStore on mount / prefix change
  useEffect(() => {
    let isCurrent = true;

    const fetchNextSequentialNumber = async () => {
      try {
        const nextNum = await calculateNextTagNumber(currentOrganization?.id, prefix);

        // Check local storage for offline / last printed fallback
        let lastPrinted = 0;
        if (typeof window !== 'undefined') {
          const stored =
            localStorage.getItem(`tooly_last_printed_end_number_${orgId}`) ||
            localStorage.getItem('tooly_last_printed_end_number');
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
              lastPrinted = parsed;
            }
          }
        }

        const isZr = prefix.trim().toUpperCase().startsWith('ZR');
        const fallbackStart = isZr ? 1099 : 1;
        const bestNext = Math.max(nextNum, lastPrinted > 0 ? lastPrinted + 1 : fallbackStart);

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
  }, [prefix, currentOrganization?.id, orgId]);

  // Compute batch list of serials: strictly ${prefix}${num} without extra zero-padding
  const batchSerials = useMemo(() => {
    const list: string[] = [];
    const validQty = Math.max(1, Math.min(quantity, 200));
    const cleanPrefix = prefix.trim().toUpperCase();
    const formattedPrefix = cleanPrefix.startsWith('ZR') && !cleanPrefix.endsWith('-') ? `${cleanPrefix}-` : cleanPrefix;

    for (let i = 0; i < validQty; i++) {
      const num = startNumber + i;
      list.push(`${formattedPrefix}${num}`);
    }
    return list;
  }, [prefix, startNumber, quantity]);

  // Generate QR Data URLs for active mode
  useEffect(() => {
    let isCurrent = true;

    const generateQrs = async () => {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tooly.co.il';

        if (activeTab === 'batch') {
          const results = await Promise.all(
            batchSerials.map(async (serial) => {
              const universalQrUrl = `${origin}/?org=${encodeURIComponent(orgSlug)}&tool=${encodeURIComponent(serial)}`;
              const qrDataUrl = await QRCode.toDataURL(universalQrUrl, {
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
                toolName: batchModelText.trim() || undefined,
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

          const universalQrUrl = `${origin}/?org=${encodeURIComponent(orgSlug)}&tool=${encodeURIComponent(reprintAsset.qrCode)}`;
          const qrDataUrl = await QRCode.toDataURL(universalQrUrl, {
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
            toolName: reprintAsset.modelNumber
              ? `${reprintAsset.toolName} (${reprintAsset.modelNumber})`
              : reprintAsset.toolName,
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
  }, [activeTab, batchSerials, facilityText, batchModelText, reprintAsset, reprintQuantity, orgSlug]);

  // Handle Reprint Tool Search
  const handleSearchReprint = useCallback(async () => {
    const q = reprintSearchInput.trim();
    if (!q) return;

    setIsSearchingReprint(true);
    setReprintError(null);

    try {
      const asset = await getAssetDetailsByQr(q, undefined, currentOrganization?.id);
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
  }, [reprintSearchInput, currentOrganization]);

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
          localStorage.setItem(`tooly_last_printed_end_number_${orgId}`, String(endNumber));
          localStorage.setItem('tooly_last_printed_end_number', String(endNumber));
        } catch {
          // localStorage disabled or private mode
        }
      }

      const labelsData = tags.map((t) => ({
        tagNumber: t.serial,
        toolName: t.toolName || batchModelText || 'כלי עבודה',
        brand: (activeTab === 'reprint' ? reprintAsset?.brand : undefined) || 'ציוד מקצועי',
        qrCodeDataUrl: t.qrDataUrl,
        companyName: effectiveCompanyName || 'TOOLY',
      }));
      printThermalLabelsDirectly(labelsData);
    }
  };

  const handleDownloadPdf = async () => {
    if (typeof window === 'undefined' || tags.length === 0 || isExportingPdf) return;
    try {
      setIsExportingPdf(true);
      const labelsData = tags.map((t) => ({
        tagNumber: t.serial,
        toolName: t.toolName || batchModelText || 'כלי עבודה',
        brand: (activeTab === 'reprint' ? reprintAsset?.brand : undefined) || 'ציוד מקצועי',
        qrCodeDataUrl: t.qrDataUrl,
        companyName: effectiveCompanyName || 'TOOLY',
        isReprint: t.isReprint,
      }));
      await downloadThermalLabelsPdf(labelsData);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('אירעה שגיאה בעת יצירת קובץ ה-PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <AppLayout
      title="Tooly - הדפסת תגיות ברקוד ל-TSC"
      subtitle="גליל מדבקות תרמי תעשייתי TSC (60×30 מ״מ)"
      requiredRole="any_elevated"
    >
      {/* Global Print-specific CSS for TSC Thermal 60x30 mm */}
      <style jsx global>{`
        @page {
          size: 60mm 30mm;
          margin: 0;
        }
        @media print {
          @page {
            size: 60mm 30mm; /* Strictly 60mm Width by 30mm Height */
            margin: 0;
          }
          html,
          body {
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
          .print-label-page,
          .tsc-label {
            width: 60mm !important;
            height: 30mm !important;
            max-width: 60mm !important;
            max-height: 30mm !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 1.5mm 2.5mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .tsc-qr-img {
            width: 22mm !important;
            height: 22mm !important;
            max-width: 22mm !important;
            max-height: 22mm !important;
            object-fit: contain !important;
            image-rendering: -webkit-optimize-contrast !important;
            image-rendering: crisp-edges !important;
          }
          .tsc-serial {
            font-size: 13pt !important;
            line-height: 1.1 !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            font-weight: 900 !important;
          }
        }
      `}</style>

      {/* 1. CONFIGURATION DRAWER (Screen-only) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 py-4 space-y-4">

        {/* Mode Selector Tabs */}
        <div className="flex overflow-x-auto no-scrollbar py-1 gap-2 border-b border-slate-200 sm:border sm:border-slate-200 sm:bg-slate-100/80 sm:p-1.5 sm:rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`shrink-0 whitespace-nowrap flex-1 min-h-[46px] px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
            className={`shrink-0 whitespace-nowrap flex-1 min-h-[46px] px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
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

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isGenerating || tags.length === 0 || isExportingPdf}
                  className="min-h-[48px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="הורד קובץ PDF למדבקות (60×30 מ״מ)"
                >
                  <FileDown className="w-4 h-4 stroke-[2.5]" />
                  <span>{isExportingPdf ? 'מייצר PDF...' : '📄 הורד קובץ PDF למדבקות (60×30 מ״מ)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={isGenerating || tags.length === 0}
                  className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="הדפס תגיות ל-TSC (גליל תרמי 60×30 מ״מ)"
                >
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  <span>🖨️ הדפס תגיות ל-TSC (60×30 מ״מ)</span>
                  <span className="text-[10px] font-bold opacity-80 font-mono">({tags.length})</span>
                </button>
              </div>
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

            {/* Tag Identity & Branding Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Company / Contractor Name */}
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  שם החברה / הקבלן (ראש המדבקה)
                </label>
                <div className="relative">
                  <Building2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={customCompanyName ?? currentOrganization?.name ?? 'TOOLY'}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    placeholder={currentOrganization?.name || 'לדוגמה: סאלח הנדסה ובנייה'}
                    className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pr-10 pl-3.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                  />
                </div>
              </div>

              {/* Equipment / Tool Model Name (Optional) */}
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  דגם כלי / סוג ציוד (אופציונלי)
                </label>
                <div className="relative">
                  <Wrench className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={batchModelText}
                    onChange={(e) => setBatchModelText(e.target.value)}
                    placeholder="לדוגמה: מקדחה רוטטת Bosch"
                    className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pr-10 pl-3.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none shadow-sm"
                  />
                </div>
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
            </div>

            {/* Serial Numbering & Batch Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Prefix */}
              <div>
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                  קידומת מזהה (Prefix)
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder={currentOrganization?.serialPrefix || 'ZR-'}
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

              {/* Tag Quantity Presets (1 to 200) */}
              <div className="sm:col-span-2 md:col-span-1">
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
                (גליל מדבקות תרמי TSC 60×30 מ״מ)
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
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isGenerating || tags.length === 0 || isExportingPdf}
                    className="min-h-[48px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    title="הורד קובץ PDF למדבקה (60×30 מ״מ)"
                  >
                    <FileDown className="w-4 h-4 stroke-[2.5]" />
                    <span>{isExportingPdf ? 'מייצר PDF...' : '📄 הורד PDF (60×30 מ״מ)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={isGenerating || tags.length === 0}
                    className="min-h-[48px] px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-600/30 active:scale-95 transition-all cursor-pointer"
                    title="הדפס תגיות עכשיו (פתיחה מיידית של חלון הדפסה)"
                  >
                    <Printer className="w-4 h-4 stroke-[2.5]" />
                    <span>🖨️ הדפס תג ל-TSC (60×30 מ״מ)</span>
                    <span className="text-[10px] font-bold opacity-80 font-mono">({reprintQuantity})</span>
                  </button>
                </div>
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

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isExportingPdf}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-all"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>{isExportingPdf ? 'מייצר...' : '📄 הורד PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="min-h-[44px] px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>🖨️ הדפס תג ל-TSC (60×30 מ״מ)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. PRINTABLE INDUSTRIAL TAGS (TSC 60x30 mm Roll) */}
      <div className="max-w-4xl mx-auto px-4 pb-12 print:p-0 print:m-0 print:max-w-none">
        {/* Preview Header Bar with Live Direct Print Button */}
        {tags.length > 0 && !isGenerating && (
          <div className="print:hidden mb-4 p-3 bg-white rounded-2xl border-2 border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>תצוגה מקדימה: <strong>{tags.length} תגיות מוכנות</strong></span>
              <span className="text-[11px] text-slate-400">
                (גליל תרמי TSC 60×30 מ״מ)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGenerating || tags.length === 0 || isExportingPdf}
                className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="הורד קובץ PDF למדבקות (60×30 מ״מ)"
              >
                <FileDown className="w-4 h-4 stroke-[2.5]" />
                <span>{isExportingPdf ? 'מייצר PDF...' : '📄 הורד קובץ PDF (60×30 מ״מ)'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-600/25 active:scale-95 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 stroke-[2.5]" />
                <span>🖨️ הדפס תגיות ל-TSC (60×30 מ״מ)</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Sticky Print Floating Bar */}
        {tags.length > 0 && !isGenerating && (
          <div className="fixed bottom-3 inset-x-3 sm:hidden z-40 print:hidden animate-in slide-in-from-bottom-3 duration-200 flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="flex-1 min-h-[56px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition-all cursor-pointer border border-slate-700"
            >
              <FileDown className="w-4 h-4 stroke-[2.5]" />
              <span>{isExportingPdf ? 'מייצר...' : '📄 הורד PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 min-h-[56px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl shadow-blue-950/60 active:scale-95 transition-all cursor-pointer border border-blue-400"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>🖨️ הדפס ({tags.length})</span>
            </button>
          </div>
        )}

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
                : 'הגדר את המספור והכמות למעלה כדי להפיק גליל מדבקות תרמי ל-TSC (60×30 מ״מ).'}
            </p>
          </div>
        ) : (
          /* TSC THERMAL LABEL 60x30 mm ROLL (Exact 2:1 Landscape) */
          <div className="tsc-container grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:block print:w-[60mm] print:m-0 print:p-0">
            {tags.map((tag, idx) => (
              <div
                key={`${tag.serial}-${idx}`}
                dir="ltr"
                className="print-label-page tsc-label bg-white border-2 border-slate-900 rounded-xl p-2.5 sm:p-3 aspect-[2/1] w-full max-w-[340px] mx-auto flex flex-row items-center justify-between gap-2.5 shadow-sm transition-all overflow-hidden print:shadow-none print:border-none print:rounded-none print:m-0 print:w-[60mm] print:h-[30mm] print:max-w-[60mm] print:max-h-[30mm] print:p-[1.5mm_2.5mm]"
              >
                {/* Side 1: High-res QR code (approx 22mm x 22mm) */}
                <div className="shrink-0 flex items-center justify-center p-0 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tag.qrDataUrl}
                    alt={`QR Code for ${tag.serial}`}
                    className="tsc-qr-img aspect-square w-[72px] h-[72px] sm:w-[82px] sm:h-[82px] print:w-[22mm] print:h-[22mm] object-contain"
                  />
                </div>

                {/* Side 2: Company Name / Logo, Equipment / Tool Model, Large bold Tag Number */}
                <div
                  className="flex-1 flex flex-col justify-between h-full min-w-0 text-right pr-2 print:pr-[2mm] py-0.5 print:py-0 overflow-hidden"
                  dir="rtl"
                >
                  {/* Micro header: Company Name / Logo */}
                  <div className="flex items-center justify-between gap-1 min-w-0 pb-0.5 border-b border-slate-200 print:border-black/30 overflow-hidden shrink-0">
                    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                      <Wrench className="w-3.5 h-3.5 text-blue-600 print:text-black shrink-0" />
                      <span
                        className="font-extrabold text-slate-950 print:text-black truncate text-xs print:text-[8pt] leading-tight"
                        title={effectiveCompanyName}
                      >
                        {effectiveCompanyName}
                      </span>
                    </div>
                    {tag.isReprint && (
                      <span className="shrink-0 text-[8px] print:text-[6.5pt] font-black uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 print:border-black print:text-black leading-none">
                        חלופית
                      </span>
                    )}
                  </div>

                  {/* Equipment / Tool Model name */}
                  <div className="overflow-hidden py-0.5 print:py-0 shrink-0">
                    <div
                      className="font-bold text-slate-700 print:text-black truncate text-[11px] print:text-[7.5pt] leading-tight"
                      title={tag.toolName || tag.facilityName || 'ציוד מבוקר'}
                    >
                      {tag.toolName || tag.facilityName || 'ציוד מבוקר'}
                    </div>
                  </div>

                  {/* Large bold Tag Number (e.g. ZR-1099) in clear monospace font */}
                  <div className="overflow-hidden py-0.5 print:py-0 shrink-0">
                    <div
                      className="tsc-serial font-mono font-black text-slate-950 print:text-black text-right tracking-wider select-all leading-tight text-sm sm:text-base print:text-[13pt]"
                      dir="ltr"
                    >
                      {tag.serial}
                    </div>
                  </div>

                  {/* Micro footer subtext */}
                  <div className="text-[9px] print:text-[6.5pt] font-medium text-slate-500 print:text-black/80 truncate leading-tight pt-0.5 border-t border-slate-100 print:border-black/20 shrink-0">
                    {tag.isReprint
                      ? 'מדבקה חלופית • סרוק לבדיקה'
                      : tag.toolName && tag.facilityName
                      ? `${tag.facilityName} • סרוק לשיוך`
                      : 'ציוד מבוקר • סרוק לבדיקה'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
