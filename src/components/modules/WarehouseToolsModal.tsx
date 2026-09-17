'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Search,
  Building2,
  Container,
  Truck,
  Loader2,
  ExternalLink,
  Package,
  Wrench,
  User,
  Hash,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import type { WarehouseAdminItem } from '@/lib/mockStore';
import type { Warehouse } from '@/types/domain';
import {
  getWarehouseToolsAction,
  type WarehouseToolItem,
} from '@/app/actions/warehouses';

const PAGE_SIZE = 32;

interface WarehouseToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouse: WarehouseAdminItem | Warehouse | null;
}

type StatusFilterType = 'all' | 'available' | 'checked_out' | 'maintenance';

export default function WarehouseToolsModal({
  isOpen,
  onClose,
  warehouse,
}: WarehouseToolsModalProps) {
  const [tools, setTools] = useState<WarehouseToolItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');

  // Progressive slice rendering state (32 items chunks)
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Load tools whenever the modal opens or the active warehouse changes
  const loadTools = useCallback(async (whId: string) => {
    setIsLoading(true);
    try {
      const result = await getWarehouseToolsAction(whId);
      setTools(result);
    } catch (err) {
      console.warn('Error fetching warehouse tools:', err);
      setTools([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && warehouse?.id) {
      const timer = setTimeout(() => {
        setSearchQuery('');
        setStatusFilter('all');
        void loadTools(warehouse.id);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, warehouse?.id, loadTools]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Dynamic status counts for filter pills
  const statusCounts = useMemo(() => {
    let available = 0;
    let checkedOut = 0;
    let maintenance = 0;

    for (const t of tools) {
      if (t.status === 'available') {
        available++;
      } else if (t.status === 'checked_out' || t.status === 'in_use') {
        checkedOut++;
      } else if (t.status === 'maintenance' || t.status === 'needs_repair') {
        maintenance++;
      }
    }

    return {
      all: tools.length,
      available,
      checkedOut,
      maintenance,
    };
  }, [tools]);

  // Filtered tools based on text search and status filter
  const filteredTools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tools.filter((tool) => {
      // 1. Status Filter
      if (statusFilter === 'available' && tool.status !== 'available') {
        return false;
      }
      if (
        statusFilter === 'checked_out' &&
        tool.status !== 'checked_out' &&
        tool.status !== 'in_use'
      ) {
        return false;
      }
      if (
        statusFilter === 'maintenance' &&
        tool.status !== 'maintenance' &&
        tool.status !== 'needs_repair'
      ) {
        return false;
      }

      // 2. Search query filter
      if (!query) return true;

      const nameMatch = tool.name.toLowerCase().includes(query);
      const qrMatch = tool.qr_code.toLowerCase().includes(query);
      const serialMatch =
        tool.serial_number && tool.serial_number.toLowerCase().includes(query);
      const categoryMatch =
        tool.category_name && tool.category_name.toLowerCase().includes(query);
      const workerMatch =
        tool.current_assigned_worker &&
        tool.current_assigned_worker.toLowerCase().includes(query);
      const orderMatch =
        tool.order_number && tool.order_number.toLowerCase().includes(query);

      return (
        nameMatch ||
        qrMatch ||
        serialMatch ||
        categoryMatch ||
        workerMatch ||
        orderMatch
      );
    });
  }, [tools, searchQuery, statusFilter]);

  // Reset progressive count to PAGE_SIZE whenever query or filter changes (React render adjustment pattern)
  const filterKey = `${searchQuery}_${statusFilter}_${warehouse?.id || ''}`;
  const [prevFilterKey, setPrevFilterKey] = useState<string>(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }

  // Progressive slice rendering: slice first visibleCount items for instant DOM rendering
  const visibleTools = useMemo(() => {
    return filteredTools.slice(0, visibleCount);
  }, [filteredTools, visibleCount]);

  // Infinite scroll observer: reveal next 32 items when sentinel enters modal scroll view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => {
            if (prev >= filteredTools.length) return prev;
            return Math.min(prev + PAGE_SIZE, filteredTools.length);
          });
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredTools.length, visibleCount]);

  if (!isOpen || !warehouse) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border-2 border-purple-200 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* ============================================================ */}
        {/* MODAL HEADER                                                 */}
        {/* ============================================================ */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-purple-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 text-purple-300 flex items-center justify-center border border-white/20 shrink-0">
              {warehouse.type === 'site_container' ? (
                <Container className="w-6 h-6" />
              ) : warehouse.type === 'service_van' ? (
                <Truck className="w-6 h-6" />
              ) : (
                <Building2 className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  כלי עבודה במתקן: {warehouse.name}
                </h2>
                <span
                  className="font-mono text-xs font-black text-purple-200 bg-purple-900/80 px-2 py-0.5 rounded-lg border border-purple-400/40 tracking-wider"
                  dir="ltr"
                >
                  {warehouse.code}
                </span>
                <span className="text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">
                  ({tools.length} כלים)
                </span>
              </div>
              <p className="text-xs text-purple-200/90 mt-0.5">
                {warehouse.address ? (
                  <span>כתובת: {warehouse.address}</span>
                ) : (
                  <span>
                    רשימת מצאי עדכנית ומעקב החזקה עבור מתקן {warehouse.name}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגור חלונית"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/20 transition-all cursor-pointer active:scale-90 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* QUICK SEARCH & STATUS FILTER BAR                             */}
        {/* ============================================================ */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש מהיר לפי שם כלי, קוד ZR, מספר סידורי, קטגוריה או עובד מחזיק..."
                className="w-full pr-10 pl-9 py-2.5 bg-white border-2 border-slate-200 focus:border-purple-600 rounded-2xl text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full cursor-pointer"
                  title="נקה חיפוש"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Count Badge */}
            <div className="text-xs font-bold text-slate-600 hidden md:flex items-center gap-1.5 shrink-0 px-3 py-2 bg-white rounded-xl border border-slate-200">
              <Filter className="w-3.5 h-3.5 text-purple-600" />
              <span>
                מוצגים <strong>{filteredTools.length}</strong> מתוך{' '}
                <strong>{tools.length}</strong>
              </span>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-purple-700 text-white shadow-sm shadow-purple-900/20'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>הכול</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  statusFilter === 'all'
                    ? 'bg-purple-900/60 text-purple-100'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {statusCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'available'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/20'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>🟢 זמין</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  statusFilter === 'available'
                    ? 'bg-emerald-800 text-emerald-100'
                    : 'bg-emerald-100/80 text-emerald-800'
                }`}
              >
                {statusCounts.available}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('checked_out')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'checked_out'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-900/20'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>🟠 בשימוש</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  statusFilter === 'checked_out'
                    ? 'bg-amber-800 text-amber-100'
                    : 'bg-amber-100/80 text-amber-800'
                }`}
              >
                {statusCounts.checkedOut}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('maintenance')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'maintenance'
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-900/20'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <span>🔴 בתיקון</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  statusFilter === 'maintenance'
                    ? 'bg-rose-800 text-rose-100'
                    : 'bg-rose-100/80 text-rose-800'
                }`}
              >
                {statusCounts.maintenance}
              </span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SCROLLABLE TOOLS LIST / TABLE                                */}
        {/* ============================================================ */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 min-h-[300px]">
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-9 h-9 animate-spin text-purple-600 mx-auto" />
              <p className="text-sm font-bold text-slate-600">
                טוען את רשימת כלי העבודה במתקן...
              </p>
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-500 flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-black text-slate-800">
                  לא נמצאו כלי עבודה מתאימים
                </h3>
                <p className="text-xs text-slate-500">
                  {searchQuery || statusFilter !== 'all'
                    ? 'נסה לשנות את מילות החיפוש או לבחור סטטוס שונה'
                    : 'מתקן זה אינו מכיל כלי עבודה רשומים כרגע'}
                </p>
              </div>
              {(searchQuery || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-black transition-all cursor-pointer"
                >
                  אפס סינונים
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Desktop Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-black text-slate-500 bg-slate-100 rounded-xl border border-slate-200/80">
                <div className="col-span-2">ברקוד / QR</div>
                <div className="col-span-4">שם הכלי וקטגוריה</div>
                <div className="col-span-2 text-center">סטטוס</div>
                <div className="col-span-2">עובד מחזיק / מיקום</div>
                <div className="col-span-2 text-left">הזמנה / PO</div>
              </div>

              {/* Tools Items */}
              {visibleTools.map((tool) => {
                const isCheckedOut =
                  tool.status === 'checked_out' || tool.status === 'in_use';
                const isMaintenance =
                  tool.status === 'maintenance' || tool.status === 'needs_repair';
                const isAvailable = tool.status === 'available';

                return (
                  <div
                    key={tool.id}
                    className="p-3 sm:p-3.5 bg-white hover:bg-purple-50/40 border border-slate-200 hover:border-purple-200 rounded-2xl shadow-2xs hover:shadow-sm transition-all flex flex-col md:grid md:grid-cols-12 gap-2.5 md:gap-3 md:items-center"
                  >
                    {/* QR Code Badge */}
                    <div className="col-span-2 flex items-center justify-between md:justify-start gap-2">
                      <span
                        className="font-mono font-black text-xs text-purple-950 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-xl shadow-xs"
                        dir="ltr"
                      >
                        {tool.qr_code}
                      </span>
                      {tool.serial_number && tool.serial_number !== tool.qr_code && (
                        <span
                          className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 md:hidden"
                          dir="ltr"
                        >
                          SN: {tool.serial_number}
                        </span>
                      )}
                    </div>

                    {/* Tool Name & Category */}
                    <div className="col-span-4 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <h4 className="text-sm font-black text-slate-900 leading-tight">
                          {tool.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{tool.category_name}</span>
                        {tool.serial_number && tool.serial_number !== tool.qr_code && (
                          <span
                            className="hidden md:inline-block font-mono text-[10px] text-slate-400"
                            dir="ltr"
                          >
                            • SN: {tool.serial_number}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="col-span-2 flex md:justify-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border ${
                          isAvailable
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : isCheckedOut
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : isMaintenance
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isAvailable && <span>🟢 זמין</span>}
                        {isCheckedOut && <span>🟠 בשימוש</span>}
                        {isMaintenance && <span>🔴 בתיקון</span>}
                        {!isAvailable && !isCheckedOut && !isMaintenance && (
                          <span>⚪ מושבת</span>
                        )}
                      </span>
                    </div>

                    {/* Assigned Worker */}
                    <div className="col-span-2">
                      {tool.current_assigned_worker ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 text-xs font-bold truncate max-w-full">
                          <User className="w-3 h-3 text-blue-600 shrink-0" />
                          <span className="truncate">
                            👤 {tool.current_assigned_worker}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">
                          במחסן
                        </span>
                      )}
                    </div>

                    {/* Order / PO Number */}
                    <div className="col-span-2 text-left">
                      {tool.order_number ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg"
                          dir="ltr"
                        >
                          <Hash className="w-2.5 h-2.5 text-slate-400" />
                          <span>{tool.order_number}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 font-mono">-</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Progressive Loading & Infinite Scroll Sentinel */}
              {filteredTools.length > PAGE_SIZE && (
                <div className="pt-2 pb-4 space-y-2 text-center">
                  {visibleCount < filteredTools.length ? (
                    <>
                      <div ref={sentinelRef} className="h-7 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                        <span className="text-xs font-bold text-slate-500">
                          מציג {visibleTools.length} מתוך {filteredTools.length} כלים
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCount((prev) =>
                              Math.min(prev + PAGE_SIZE, filteredTools.length)
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-black border border-purple-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                        >
                          טען עוד 32 כלים
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-500">
                      ✓ הוצגו כל {filteredTools.length} הכלים במתקן
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER                                                 */}
        {/* ============================================================ */}
        <div className="p-4 sm:p-5 bg-slate-100 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <div className="text-xs font-bold text-slate-500 w-full sm:w-auto text-center sm:text-right">
            <span>
              מתקן <strong>{warehouse.name}</strong> • סה&quot;כ{' '}
              <strong>{tools.length}</strong> כלי עבודה רשומים
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer transition-all active:scale-95 flex-1 sm:flex-none"
            >
              סגור
            </button>

            <Link
              href={`/catalog?warehouse=${encodeURIComponent(warehouse.id)}`}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black shadow-sm shadow-purple-900/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 flex-1 sm:flex-none"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>פתח בקטלוג המלא</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
