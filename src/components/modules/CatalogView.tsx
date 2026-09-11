'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Flame,
  Anchor,
  Scissors,
  Hammer,
  Ruler,
  ChevronRight,
  ArrowLeft,
  Building2,
  Search,
  CheckCircle2,
  UserCheck,
  AlertTriangle,
  QrCode,
  Layers,
  Printer,
  Scan,
  Wrench,
  Sparkles,
  History as HistoryIcon,
} from 'lucide-react';
import type { CatalogDataPayload } from '@/app/actions/assets';

interface CatalogViewProps {
  initialData: CatalogDataPayload;
}

// Map category icons dynamically
function getCategoryIcon(iconName: string | null, className: string = 'w-6 h-6') {
  switch (iconName?.toLowerCase()) {
    case 'flame':
    case 'welding':
      return <Flame className={className} />;
    case 'crane':
    case 'hook':
    case 'lifting':
      return <Anchor className={className} />;
    case 'scissors':
    case 'cutting':
      return <Scissors className={className} />;
    case 'drill':
    case 'drilling':
      return <Hammer className={className} />;
    case 'ruler':
    case 'gauge':
    case 'measurement':
      return <Ruler className={className} />;
    default:
      return <Wrench className={className} />;
  }
}

export default function CatalogView({ initialData }: CatalogViewProps) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    initialData.selectedWarehouseId || 'all'
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter assets by selected warehouse
  const filteredAssets = useMemo(() => {
    if (!selectedWarehouseId || selectedWarehouseId === 'all') {
      return initialData.assets;
    }
    return initialData.assets.filter((a) => a.warehouseId === selectedWarehouseId);
  }, [initialData.assets, selectedWarehouseId]);

  // Compute live category tool counts based on filtered assets
  const categoriesWithCount = useMemo(() => {
    return initialData.categories.map((cat) => ({
      ...cat,
      toolCount: filteredAssets.filter((a) => a.categoryId === cat.id).length,
    }));
  }, [initialData.categories, filteredAssets]);

  // Active category object if in drilldown view
  const activeCategory = useMemo(() => {
    if (!activeCategoryId) return null;
    return categoriesWithCount.find((c) => c.id === activeCategoryId) || null;
  }, [activeCategoryId, categoriesWithCount]);

  // Assets inside the currently active category, filtered by search query
  const categoryAssets = useMemo(() => {
    if (!activeCategoryId) return [];
    let items = filteredAssets.filter((a) => a.categoryId === activeCategoryId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (a) =>
          a.toolName.toLowerCase().includes(q) ||
          a.brand.toLowerCase().includes(q) ||
          a.qrCode.toLowerCase().includes(q) ||
          (a.modelNumber && a.modelNumber.toLowerCase().includes(q)) ||
          (a.currentAssignedWorker && a.currentAssignedWorker.toLowerCase().includes(q))
      );
    }
    return items;
  }, [filteredAssets, activeCategoryId, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-blue-950 font-sans pb-28 selection:bg-blue-600 selection:text-white">
      {/* 1. TOP HEADER & WAREHOUSE FILTER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-sm shadow-blue-950/5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {activeCategoryId ? (
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryId(null);
                  setSearchQuery('');
                }}
                className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-100 active:scale-95 transition-all cursor-pointer"
                title="Back to Categories"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25">
                T
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wider text-blue-600 font-bold">
                {activeCategory ? 'Category Inventory' : 'Asset Hub'}
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                {activeCategory ? activeCategory.name.toUpperCase() : 'TOOLS'}
              </h1>
            </div>
          </div>

          {/* Quick Nav Shortcut to Scanner, History or Print */}
          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Scanner"
            >
              <Scan className="w-3.5 h-3.5 text-blue-600" />
              <span>Scan</span>
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Audit Ledger"
            >
              <HistoryIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>History</span>
            </Link>
            <Link
              href="/print-tags"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="Print Tags"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>Print</span>
            </Link>
          </div>
        </div>

        {/* Warehouse Filter Bar */}
        <div className="mt-3 max-w-lg mx-auto">
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm pl-10 pr-9 py-2.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer transition-colors shadow-sm"
            >
              <option value="all" className="bg-white text-blue-950 font-bold">
                All Facilities ({filteredAssets.length} Total Tools)
              </option>
              {initialData.warehouses.map((wh) => (
                <option key={wh.id} value={wh.id} className="bg-white text-blue-950 font-bold">
                  {wh.code ? `[${wh.code}] ` : ''}
                  {wh.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-xs">
              ▼
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* VIEW A: CATEGORIES LIST (REFERENCE DESIGN MATCH) */}
        {!activeCategory ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs uppercase font-extrabold tracking-wider text-blue-900">
                Equipment Categories
              </span>
              <span className="text-xs font-bold text-blue-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                {filteredAssets.length} active units
              </span>
            </div>

            <div className="space-y-2.5">
              {categoriesWithCount.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  className="w-full min-h-[76px] bg-white hover:bg-blue-50/50 text-blue-950 rounded-2xl p-4 flex items-center justify-between border-2 border-blue-100 shadow-sm hover:shadow-md transition-all active:scale-[0.99] group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-4">
                    {/* Category Icon Capsule */}
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors shadow-inner shrink-0">
                      {getCategoryIcon(cat.icon, 'w-6 h-6 stroke-[2.2]')}
                    </div>

                    <div>
                      <h2 className="text-base font-black text-blue-950 tracking-tight leading-snug">
                        {cat.name}
                      </h2>
                      <div className="text-xs font-bold text-blue-600/80 mt-0.5">
                        {cat.toolCount} {cat.toolCount === 1 ? 'Unit' : 'Units'} Registered
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {cat.toolCount}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-blue-50 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                      <ChevronRight className="w-4 h-4 stroke-[3] text-blue-600 group-hover:text-white" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* VIEW B: CATEGORY DRILLDOWN ASSET LIST */
          <div className="space-y-4">
            {/* Search filter within active category */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeCategory.name} tools, serials, brands...`}
                className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm pl-10 pr-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Assets List */}
            {categoryAssets.length === 0 ? (
              <div className="p-10 rounded-2xl border-2 border-dashed border-blue-200 bg-white text-center space-y-3 shadow-sm">
                <Wrench className="w-10 h-10 text-blue-400 mx-auto" />
                <div className="text-sm font-bold text-blue-950">
                  No tools found in this view
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  {searchQuery
                    ? 'No assets match your search query.'
                    : 'No tools currently registered for this category in the selected warehouse.'}
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-wider shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Onboard New Tool</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryAssets.map((asset) => {
                  const isAvailable = asset.status === 'available';
                  const isCheckedOut = asset.status === 'checked_out';
                  const isMaintenance = asset.status === 'maintenance';

                  return (
                    <div
                      key={asset.id}
                      className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 space-y-3 hover:border-blue-300 transition-colors"
                    >
                      {/* Top Header: Brand & Live Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            {asset.brand}
                          </span>
                          <h3 className="text-base font-black text-blue-950 mt-1.5 leading-snug">
                            {asset.toolName}
                          </h3>
                          {asset.modelNumber && (
                            <div className="text-xs font-mono text-slate-500 mt-0.5">
                              Model: {asset.modelNumber}
                            </div>
                          )}
                        </div>

                        {/* Status Pill */}
                        <div className="shrink-0">
                          {isAvailable && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Available
                            </span>
                          )}
                          {isCheckedOut && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-300">
                              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                              Checked Out
                            </span>
                          )}
                          {isMaintenance && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-red-50 text-red-700 border border-red-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              Maintenance
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Checked out worker detail if applicable */}
                      {isCheckedOut && asset.currentAssignedWorker && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>In custody of: <strong>{asset.currentAssignedWorker}</strong></span>
                        </div>
                      )}

                      {/* Footer: QR Serial Code & Warehouse Location */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <div className="flex items-center gap-1.5 text-blue-900 font-mono">
                          <QrCode className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="bg-blue-50 text-blue-950 px-2 py-0.5 rounded border border-blue-200">
                            {asset.qrCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate max-w-[180px]">{asset.warehouseName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. UNIVERSAL BOTTOM NAVIGATION BAR (FIXED) */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1 sm:gap-2">
          {/* 1. Scanner */}
          <Link
            href="/"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Scan className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Scanner</span>
          </Link>

          {/* 2. Tools Catalog (ACTIVE) */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <Layers className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">Catalog</span>
          </Link>

          {/* 3. History */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <HistoryIcon className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">History</span>
          </Link>

          {/* 4. Print QR Tags */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Printer className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">Print Tags</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
