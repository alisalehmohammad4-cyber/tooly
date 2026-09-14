'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Eraser, CheckCircle2, PenTool, AlertCircle } from 'lucide-react';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string) => void;
  titleHe?: string;
  signerName?: string;
}

export default function SignaturePadModal({
  isOpen,
  onClose,
  onConfirm,
  titleHe = 'חתימת העובד על קבלת הציוד',
  signerName,
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasSignature, setHasSignature] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Resize canvas to fill container with devicePixelRatio scaling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height) || 220;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#0f172a'; // Deep slate navy for high contrast
    }
  }, []);

  // Initialize or re-setup canvas whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setupCanvas();
      setHasSignature(false);
      setValidationError(null);
    }, 50);

    const handleResize = () => {
      if (!isDrawing) {
        setupCanvas();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, setupCanvas, isDrawing]);

  // Pointer event handlers for unified touch / mouse / stylus support
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);

    setIsDrawing(true);
    setHasSignature(true);
    setValidationError(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safety
      }
    }
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    setupCanvas();
    setHasSignature(false);
    setValidationError(null);
  };

  const handleConfirm = () => {
    if (!hasSignature) {
      setValidationError('נא לחתום בתוך המסגרת לפני אישור המסירה.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export high-contrast PNG data URL
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-modal-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border-2 border-blue-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-blue-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h2 id="signature-modal-title" className="text-base sm:text-lg font-black leading-tight">
                {titleHe}
              </h2>
              <p className="text-xs text-blue-200/80 font-semibold">
                אישור מסירת ציוד {signerName ? `• ${signerName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 flex-1 flex flex-col space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
            <span>צייר חתימה באמצעות מגע או עט</span>
            {signerName && (
              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                מקבל הציוד: {signerName}
              </span>
            )}
          </div>

          {/* Canvas Box */}
          <div
            ref={containerRef}
            className="relative w-full h-56 sm:h-64 bg-slate-50 rounded-2xl border-2 border-dashed border-blue-300 overflow-hidden flex items-center justify-center cursor-crosshair select-none shadow-inner"
          >
            {/* Signature Baseline Guide */}
            <div className="absolute inset-x-8 bottom-10 pointer-events-none flex items-center gap-2 text-slate-300">
              <span className="text-sm font-black select-none text-slate-400">✕</span>
              <div className="flex-1 border-b-2 border-dashed border-slate-300" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                קו חתימה
              </span>
            </div>

            {/* Instruction watermark before drawing */}
            {!hasSignature && (
              <div className="absolute pointer-events-none text-center p-4 text-slate-400">
                <PenTool className="w-8 h-8 mx-auto mb-1 opacity-30 text-blue-900" />
                <p className="text-xs font-bold text-slate-400">
                  חתום כאן בתוך המסגרת
                </p>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-full touch-none"
              style={{ touchAction: 'none' }}
            />
          </div>

          {/* Validation Warning */}
          {validationError && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Legal / Accountability Notice */}
          <div className="bg-slate-100 rounded-xl p-2.5 text-[11px] text-slate-600 font-medium leading-relaxed">
            בחתימתו מאשר העובד כי קיבל את כל הכלים והאביזרים המפורטים במצב תקין ומתחייב להחזירם במועד המוסכם.
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[50px] px-4 rounded-xl border-2 border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Eraser className="w-4 h-4 text-slate-500" />
            <span>נקה חתימה</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[50px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span>אשר וחתום</span>
          </button>
        </div>
      </div>
    </div>
  );
}
