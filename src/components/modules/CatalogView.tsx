'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  Wrench,
  FileText,
  Lock,
  BookmarkCheck,
  Package,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import type { CatalogDataPayload } from '@/app/actions/assets';
import { useAuth } from '@/context/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import AssetActionModal from '@/components/modules/AssetActionModal';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import { matchesToolSearch } from '@/lib/search/toolDictionary';

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

type StatusFilter = 'all' | 'available' | 'checked_out';

export default function CatalogView({ initialData }: CatalogViewProps) {
  const { role } = useAuth();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    initialData.selectedWarehouseId || 'all'
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Rapid debounced search input (100ms debounce)
  const [rawSearchQuery, setRawSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');

  // 3 Instant status toggle pills
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Modal inspection & custody state
  const [selectedAsset, setSelectedAsset] = useState<ScannedAssetDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [passportAsset, setPassportAsset] = useState<ScannedAssetDetails | null>(null);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

  // Debounce raw input by 100ms for zero typing lag
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(rawSearchQuery);
    }, 100);
    return () => clearTimeout(timer);
  }, [rawSearchQuery]);

  // 1. Filter assets by selected warehouse
  const warehouseFilteredAssets = useMemo(() => {
    if (!selectedWarehouseId || selectedWarehouseId === 'all') {
      return initialData.assets;
    }
    return initialData.assets.filter((a) => a.warehouseId === selectedWarehouseId);
  }, [initialData.assets, selectedWarehouseId]);

  // Status counts for the pills within current warehouse selection
  const totalWarehouseToolsCount = warehouseFilteredAssets.length;
  const availableWarehouseToolsCount = useMemo(
    () => warehouseFilteredAssets.filter((a) => a.status === 'available').length,
    [warehouseFilteredAssets]
  );
  const inUseWarehouseToolsCount = useMemo(
    () => warehouseFilteredAssets.filter((a) => a.status === 'checked_out').length,
    [warehouseFilteredAssets]
  );

  // 2. Filter assets by status filter
  const statusFilteredAssets = useMemo(() => {
    if (statusFilter === 'available') {
      return warehouseFilteredAssets.filter((a) => a.status === 'available');
    }
    if (statusFilter === 'checked_out') {
      return warehouseFilteredAssets.filter((a) => a.status === 'checked_out');
    }
    return warehouseFilteredAssets;
  }, [warehouseFilteredAssets, statusFilter]);

  // 3. Compute dynamic category tool counts matching active warehouse & status filter
  const categoriesWithCount = useMemo(() => {
    return initialData.categories.map((cat) => ({
      ...cat,
      toolCount: statusFilteredAssets.filter((a) => a.categoryId === cat.id).length,
    }));
  }, [initialData.categories, statusFilteredAssets]);

  // Active category object if in drilldown view
  const activeCategory = useMemo(() => {
    if (!activeCategoryId) return null;
    return categoriesWithCount.find((c) => c.id === activeCategoryId) || null;
  }, [activeCategoryId, categoriesWithCount]);

  // 4. Multi-field search filtering across:
  // 1. Tool Name (Hebrew & English)
  // 2. Brand
  // 3. Model Number
  // 4. QR Code / Serial Number (including suffix match)
  // 5. Assigned Worker Name (`current_assigned_worker`)
  const displayedAssets = useMemo(() => {
    let list = statusFilteredAssets;

    if (activeCategoryId) {
      list = list.filter((a) => a.categoryId === activeCategoryId);
    }

    if (debouncedSearchQuery.trim()) {
      list = list.filter((a) => matchesToolSearch(a, debouncedSearchQuery));
    }

    return list;
  }, [statusFilteredAssets, activeCategoryId, debouncedSearchQuery]);

  const isSearching = debouncedSearchQuery.trim().length > 0;
  const showToolList = Boolean(activeCategoryId || isSearching);

  return (
    <AppLayout
      title={activeCategory ? activeCategory.name : 'Tooly - קטלוג ומלאי'}
      subtitle={activeCategory ? 'מלאי קטגוריה' : 'מרכז הציוד והמלאי'}
      requiredRole="any_elevated"
      extraHeader={
        activeCategoryId ? (
          <div className="max-w-lg mx-auto mt-2">
            <button
              type="button"
              onClick={() => {
                setActiveCategoryId(null);
                setRawSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>חזרה לכל הקטגוריות</span>
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* 1. Warehouse Filter Bar */}
        <div>
          <div className="relative">
            <Building2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" />
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full min-h-[48px] bg-white text-blue-950 font-bold text-sm pr-10 pl-9 py-2.5 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer transition-colors shadow-sm"
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

        {/* 2. Rapid Search Bar with 100ms Debounce */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={rawSearchQuery}
              onChange={(e) => setRawSearchQuery(e.target.value)}
              placeholder="חיפוש לפי כלי, מותג (דיוולט/מקיטה), דגם, מק״ט, או שם עובד..."
              className="w-full min-h-[48px] bg-white text-blue-950 font-medium text-sm pr-10 pl-14 py-2.5 rounded-xl border-2 border-blue-100 focus:border-blue-600 focus:outline-none shadow-sm placeholder:text-slate-400"
            />
            {rawSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setRawSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-blue-600 cursor-pointer"
              >
                נקה
              </button>
            )}
          </div>

          {/* 3 Instant Status Toggle Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 flex items-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                  : 'bg-white text-slate-700 border-blue-100 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              <span>כל הכלים</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {totalWarehouseToolsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 flex items-center gap-1.5 ${
                statusFilter === 'available'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/20'
                  : 'bg-white text-emerald-800 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              <span className="text-xs">🟢</span>
              <span>זמין במלאי בלבד</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'available' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {availableWarehouseToolsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('checked_out')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 flex items-center gap-1.5 ${
                statusFilter === 'checked_out'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                  : 'bg-white text-amber-900 border-amber-200 hover:border-amber-300 hover:bg-amber-50/50'
              }`}
            >
              <span className="text-xs">🟠</span>
              <span>בשימוש בשטח</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'checked_out' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-900'
                }`}
              >
                {inUseWarehouseToolsCount}
              </span>
            </button>
          </div>
        </div>

        {/* Zero State for Production Reset */}
        {totalWarehouseToolsCount === 0 && (
          <div className="p-8 rounded-2xl bg-amber-50/90 border-2 border-amber-200 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Package className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-amber-950">
                אין עדיין כלים רשומים במערכת - התחל בקליטת כלי חדש
              </h3>
              <p className="text-xs text-amber-800/90 max-w-md mx-auto">
                הקטלוג ריק מציוד פעיל. ניתן לקלוט כלי עבודה חדשים, להגדיר מספרים סידוריים ולקודד תגיות זיהוי חכמות.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>התחל בקליטת כלי חדש</span>
              </Link>
            </div>
          </div>
        )}

        {/* VIEW A: CATEGORIES OVERVIEW GRID (when not drilling down and not searching) */}
        {!showToolList && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  קטגוריות ציוד ({categoriesWithCount.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                סה&quot;כ {statusFilteredAssets.length} כלים
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoriesWithCount.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(cat.id);
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
                        {cat.toolCount} כלים
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VIEW B: TOOL LIST (Category Drilldown OR Search Results) */}
        {showToolList && (
          <div className="space-y-3.5">
            {/* Results Header / Breadcrumb */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 px-1">
              <div>
                {activeCategory ? (
                  <span>
                    קטגוריה: <strong>{activeCategory.name}</strong> &bull; נמצאו{' '}
                    <strong className="text-blue-900">{displayedAssets.length}</strong> כלים
                  </span>
                ) : (
                  <span>
                    תוצאות חיפוש בכל הקטלוג: נמצאו{' '}
                    <strong className="text-blue-900">{displayedAssets.length}</strong> כלים
                  </span>
                )}
              </div>

              {activeCategoryId ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(null);
                    setRawSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-black"
                >
                  <span>כל הקטגוריות</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRawSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  className="text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer font-bold"
                >
                  <span>סגור חיפוש</span>
                </button>
              )}
            </div>

            {/* Empty State */}
            {displayedAssets.length === 0 && (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center space-y-2">
                <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-black text-slate-700">
                  לא נמצאו כלים התואמים לחיפוש
                </p>
                <p className="text-xs text-slate-500">
                  נסה לבדוק איות, להשתמש במונח כללי (כגון &quot;פטישון&quot; או &quot;דוולט&quot;), או לשנות את המחסן והסטטוס.
                </p>
              </div>
            )}

            {/* Tool Cards List */}
            {displayedAssets.length > 0 && (
              <div className="space-y-3">
                {displayedAssets.map((asset) => {
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
      </div>

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
    </AppLayout>
  );
}
