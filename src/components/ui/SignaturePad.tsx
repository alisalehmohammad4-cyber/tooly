'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw, PenTool, CheckCircle2 } from 'lucide-react';

export interface SignaturePadProps {
  onSignatureChange: (signatureBase64: string | null) => void;
  height?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export default function SignaturePad({
  onSignatureChange,
  height = 180,
  className = '',
  disabled = false,
  label = 'חתימת מקבל הציוד (באמצעות אצבע או עט דיגיטלי)',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize and resize canvas with Device Pixel Ratio for crisp lines on high-DPI screens
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || 400;
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
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0f172a'; // Deep slate-900 for high-contrast visibility
    }
  }, [height]);

  useEffect(() => {
    initCanvas();
    const handleResize = () => {
      // Re-init canvas if dimensions change significantly
      initCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initCanvas]);

  const getCanvasCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (disabled) return;
    if ('touches' in e) {
      // Prevent browser scrolling while signing on mobile
      if (e.cancelable) e.preventDefault();
    }
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    lastPointRef.current = coords;

    // Draw initial dot in case of single tap
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 1.25, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || disabled) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    }

    const coords = getCanvasCoordinates(e);
    if (!coords || !lastPointRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastPointRef.current = coords;
    if (!hasSigned) {
      setHasSigned(true);
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (canvas && hasSigned) {
      const dataUrl = canvas.toDataURL('image/png');
      onSignatureChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    onSignatureChange(null);
  };

  return (
    <div className={`w-full space-y-2 select-none ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <label className="font-bold text-slate-700 flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-blue-600" />
          <span>{label}</span>
        </label>
        {hasSigned ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-in fade-in">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>חתימה נקלטה</span>
          </span>
        ) : (
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            נדרשת חתימה
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className={`relative w-full rounded-2xl border-2 transition-all bg-white overflow-hidden shadow-xs ${
          disabled
            ? 'opacity-60 bg-slate-100 border-slate-300'
            : hasSigned
            ? 'border-emerald-400 ring-2 ring-emerald-50'
            : 'border-slate-300 hover:border-blue-400 focus-within:border-blue-600'
        }`}
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full cursor-crosshair block"
        />

        {/* Subtle Signature Baseline & Instructions */}
        {!hasSigned && !isDrawing && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <PenTool className="w-6 h-6 mb-1 opacity-40 text-blue-500 animate-pulse" />
            <p className="text-xs font-bold text-slate-500">חתום כאן באמצעות אצבע או עט</p>
            <div className="w-3/4 border-b border-dashed border-slate-300 mt-4" />
          </div>
        )}

        {/* Clear Action Button */}
        {hasSigned && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 left-2 py-1 px-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
            title="נקה חתימה"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>נקה חתימה</span>
          </button>
        )}
      </div>
    </div>
  );
}
