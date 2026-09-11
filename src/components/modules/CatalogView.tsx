'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Flame,
  Anchor,
  Scissors,
  Hammer,
  Ruler,
  ChevronLeft,
  ArrowRight,
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
  History as HistoryIcon,
  FileText,
  Lock,
  BookmarkCheck,
} from 'lucide-react';
import type { CatalogDataPayload } from '@/app/actions/assets';
import { useAuth } from '@/context/AuthContext';
import UserRoleHeaderPill from '@/components/common/UserRoleHeaderPill';
import AssetActionModal from '@/components/modules/AssetActionModal';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import type { ScannedAssetDetails } from '@/app/actions/custody';

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
    case 'saw':
    case 'cutting':
      return <Scissors className={className} />;
    case 'hammer':
    case 'drill':
    case 'drilling':
      return <Hammer className={className} />;
    case 'ruler':
    case 'level':
    case 'measurement':
      return <Ruler className={className} />;
    default:
      return <Wrench className={className} />;
  }
}

export default function CatalogView({ initialData }: CatalogViewProps) {
  const { role } = useAuth();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    initialData.selectedWarehouseId || 'all'
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal inspection & custody state
  const [selectedAsset, setSelectedAsset] = useState<ScannedAssetDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [passportAsset, setPassportAsset] = useState<ScannedAssetDetails | null>(null);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

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
                title="חזרה לקטגוריות"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25">
                T
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wider text-blue-600 font-bold">
                {activeCategory ? 'מלאי קטגוריה' : 'מרכז הציוד והמלאי'}
              </div>
              <h1 className="text-base font-black text-blue-950 leading-tight">
                {activeCategory ? activeCategory.name : 'קטלוג כלים'}
              </h1>
            </div>
          </div>

          {/* Quick Nav Shortcut to Scanner, History or Print */}
          <div className="flex items-center gap-1.5">
            <UserRoleHeaderPill />

            <Link
              href="/"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="סורק מהיר"
            >
              <Scan className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>סורק</span>
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
              title="יומן תנועות"
            >
              <HistoryIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>יומן</span>
            </Link>
            {role !== 'worker' && (
              <Link
                href="/print-tags"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
                title="הדפסת תגיות"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>תגיות</span>
              </Link>
            )}
          </div>
        </div>

        {/* Warehouse Filter Bar */}
        <div className="mt-3 max-w-lg mx-auto">
          <div className="relative">
            <Building2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-sm pr-10 pl-9 py-2.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer transition-colors shadow-sm"
            >
              <option value="all">כל המחסנים והאתרים הפעילים</option>
              {initialData.warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.code ? `[${wh.code}] ` : ''}
                  {wh.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-xs">
              ▼
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* VIEW A: CATEGORIES OVERVIEW GRID */}
        {!activeCategoryId && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  קטגוריות ציוד ({categoriesWithCount.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                סה&quot;כ {filteredAssets.length} כלים במלאי
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoriesWithCount.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(cat.id);
                    setSearchQuery('');
                  }}
                  className="p-4 rounded-2xl bg-white border-2 border-blue-100 hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between text-right group active:scale-[0.98] cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center transition-colors shrink-0 shadow-sm border border-blue-100">
                      {getCategoryIcon(cat.icon)}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-blue-950 group-hover:text-blue-600 transition-colors leading-snug">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">
                        {cat.toolCount} כלים רשומים
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VIEW B: CATEGORY DRILLDOWN & TOOL LIST */}
        {activeCategoryId && (
          <div className="space-y-4">
            {/* Search Filter Inside Category */}
            <div className="relative">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי שם כלי, דגם או מספר סידורי..."
                className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm pr-10 pl-14 py-2.5 rounded-xl border-2 border-blue-100 focus:border-blue-600 focus:outline-none shadow-sm placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-blue-600 cursor-pointer"
                >
                  נקה
                </button>
              )}
            </div>

            {/* Results Count Header */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
              <span>
                נמצאו <strong>{categoryAssets.length}</strong> כלים
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryId(null);
                  setSearchQuery('');
                }}
                className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-black"
              >
                <span>חזור לכל הקטגוריות</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Empty State */}
            {categoryAssets.length === 0 && (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center space-y-2">
                <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-black text-slate-700">
                  לא נמצאו כלים בקטגוריה זו
                </p>
                <p className="text-xs text-slate-500">
                  נסה לשנות את הסינון או המחסן שנבחר.
                </p>
              </div>
            )}

            {/* Tool Cards List */}
            {categoryAssets.length > 0 && (
              <div className="space-y-3">
                {categoryAssets.map((asset) => {
                  const isAvailable = asset.status === 'available';
                  const isCheckedOut = asset.status === 'checked_out';
                  const isMaintenance = asset.status === 'maintenance';

                  return (
                    <div
                      key={asset.id}
                      className="p-4 rounded-2xl bg-white border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all space-y-3"
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
                            <div className="text-xs font-mono text-slate-500 mt-0.5" dir="ltr">
                              דגם: {asset.modelNumber}
                            </div>
                          )}
                        </div>

                        {/* Status Pill */}
                        <div className="shrink-0">
                          {isAvailable && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              זמין במלאי
                            </span>
                          )}
                          {isCheckedOut && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-300">
                              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                              בשימוש
                            </span>
                          )}
                          {isMaintenance && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-red-50 text-red-700 border border-red-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              בתיקון / בדיקה
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Checked out worker detail if applicable */}
                      {isCheckedOut && asset.currentAssignedWorker && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>נמצא בשימוש אצל: <strong>{asset.currentAssignedWorker}</strong></span>
                        </div>
                      )}

                      {/* Footer: QR Serial Code & Warehouse Location */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <div className="flex items-center gap-1.5 text-blue-900 font-mono" dir="ltr">
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

                      {/* Lockout, Safety Overdue & Reservation Badges */}
                      {(asset.isLocked ||
                        (asset.safetyInspectionDue &&
                          new Date(asset.safetyInspectionDue).getTime() < new Date().getTime()) ||
                        asset.reservation) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {asset.isLocked && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                              <Lock className="w-3 h-3 text-red-600" />
                              נעול מנהלתית
                            </span>
                          )}
                          {asset.safetyInspectionDue &&
                            new Date(asset.safetyInspectionDue).getTime() < new Date().getTime() && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                בדיקת בטיחות פגה
                              </span>
                            )}
                          {asset.reservation && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                              <BookmarkCheck className="w-3 h-3 text-amber-600" />
                              משוריין: {asset.reservation.projectName}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons: Custody Modal & Passport Modal */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAsset({
                              id: asset.id,
                              qrCode: asset.qrCode,
                              status: asset.status,
                              condition: asset.condition,
                              currentAssignedWorker: asset.currentAssignedWorker,
                              currentWarehouseId: asset.warehouseId,
                              warehouseName: asset.warehouseName,
                              warehouseCode: 'WH',
                              toolName: asset.toolName,
                              brand: asset.brand,
                              modelNumber: asset.modelNumber,
                              version: 1,
                              purchaseDate: asset.purchaseDate,
                              purchaseCost: asset.purchaseCost,
                              warrantyUntil: asset.warrantyUntil,
                              safetyInspectionDue: asset.safetyInspectionDue,
                              isLocked: asset.isLocked || false,
                              lockReason: asset.lockReason,
                              reservation: asset.reservation,
                            });
                            setIsModalOpen(true);
                          }}
                          className={`flex-1 min-h-[44px] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-sm ${
                            role === 'worker'
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                          }`}
                        >
                          {role === 'worker' ? (
                            <>
                              <Wrench className="w-3.5 h-3.5" />
                              <span>כרטיס כלי ודיווח תקלה</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>פעולות ניפוק והחזרה</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPassportAsset({
                              id: asset.id,
                              qrCode: asset.qrCode,
                              status: asset.status,
                              condition: asset.condition,
                              currentAssignedWorker: asset.currentAssignedWorker,
                              currentWarehouseId: asset.warehouseId,
                              warehouseName: asset.warehouseName,
                              warehouseCode: 'WH',
                              toolName: asset.toolName,
                              brand: asset.brand,
                              modelNumber: asset.modelNumber,
                              version: 1,
                              purchaseDate: asset.purchaseDate,
                              purchaseCost: asset.purchaseCost,
                              warrantyUntil: asset.warrantyUntil,
                              safetyInspectionDue: asset.safetyInspectionDue,
                              isLocked: asset.isLocked || false,
                              lockReason: asset.lockReason,
                              reservation: asset.reservation,
                            });
                            setIsPassportOpen(true);
                          }}
                          className="min-h-[44px] px-3 rounded-xl bg-white hover:bg-blue-50 text-blue-900 text-xs font-bold border border-blue-200 flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                          title="דרכון כלי דיגיטלי"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>דרכון כלי</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CUSTODY & TOOL INFO ACTION MODAL */}
      <AssetActionModal
        isOpen={isModalOpen}
        asset={selectedAsset}
        warehouses={initialData.warehouses}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedAsset(null);
        }}
        onActionComplete={(_msg, updatedAsset) => {
          setSelectedAsset(updatedAsset);
        }}
      />

      {/* DIGITAL TOOL PASSPORT MODAL */}
      <ToolPassportModal
        isOpen={isPassportOpen}
        asset={passportAsset}
        onClose={() => {
          setIsPassportOpen(false);
          setPassportAsset(null);
        }}
        onAssetUpdated={(updated) => {
          setPassportAsset(updated);
        }}
      />

      {/* 3. UNIVERSAL BOTTOM NAVIGATION BAR (FIXED) */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-blue-100 px-3 py-2 shadow-lg shadow-blue-950/5"
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

          {/* 2. Tools Catalog (ACTIVE) */}
          <Link
            href="/catalog"
            className="min-h-[54px] rounded-xl bg-blue-50 border border-blue-200 flex flex-col items-center justify-center text-blue-700 font-black shadow-sm"
          >
            <Layers className="w-5 h-5 text-blue-600" />
            <span className="text-[10px] sm:text-[11px] font-black mt-1">קטלוג ומלאי</span>
          </Link>

          {/* 3. History */}
          <Link
            href="/history"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <HistoryIcon className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">יומן תנועות</span>
          </Link>

          {/* 4. Print QR Tags */}
          <Link
            href="/print-tags"
            className="min-h-[54px] rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-700 active:bg-blue-50/50 transition-colors group"
          >
            <Printer className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
            <span className="text-[10px] sm:text-[11px] font-bold mt-1">הדפסת תגיות</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
