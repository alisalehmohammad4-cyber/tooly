'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Phone,
  MessageCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  ChevronDown,
  Loader2,
  Zap,
  FileText,
  Scan,
  Printer,
  Layers,
  TrendingDown,
  ArrowLeftRight,
  ClipboardCheck,
  X,
  Check,
  Lock,
  Package,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import type { StorekeeperOperationsPayload, WarehouseOption } from '@/app/actions/dashboard';
import { getStorekeeperOperations } from '@/app/actions/dashboard';
import AppLayout from '@/components/layout/AppLayout';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import { useAuth } from '@/context/AuthContext';
import {
  getAssetDetailsByQr,
  transferAssetAction,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import { reconcileStockAction } from '@/app/actions/warehouses';
import {
  createTransferRequestAction,
  getAvailableAssetsForTransferAction,
  getIncomingInTransitTransfersAction,
  completeTransferReceptionAction,
  type AvailableTransferAssetItem,
  type PendingTransferItem,
} from '@/app/actions/transfers';

interface WarehouseDashboardViewProps {
  initialData: StorekeeperOperationsPayload;
  warehouses?: WarehouseOption[];
}

export default function WarehouseDashboardView({
  initialData,
  warehouses: propWarehouses,
}: WarehouseDashboardViewProps) {
  const {
    assignedWarehouseId,
    isChiefOperations,
    isGeneralManager,
    isStorekeeper,
    canSwitchDepots,
    currentOrganization,
    user,
  } = useAuth();
  const [data, setData] = useState<StorekeeperOperationsPayload>(initialData);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    if (isStorekeeper && assignedWarehouseId) {
      return assignedWarehouseId;
    }
    return initialData.warehouse.id;
  });
  const [isLoadingWarehouse, setIsLoadingWarehouse] = useState<boolean>(false);
  const [passportAsset, setPassportAsset] = useState<ScannedAssetDetails | null>(null);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

  const warehouses = propWarehouses || data.warehouses || data.allWarehouses || [];

  // Chief Operations: Inter-Depot Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferQrCode, setTransferQrCode] = useState<string>('');
  const [transferTargetWhId, setTransferTargetWhId] = useState<string>(() => {
    const whList = propWarehouses || initialData.warehouses || initialData.allWarehouses || [];
    const firstOther = whList.find((w) => w.id !== initialData.warehouse.id);
    return firstOther ? firstOther.id : (whList[0]?.id || 'wh-site-02');
  });
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Chief Operations: Stock Reconciliation Modal State
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState<string>('');
  const [reconcileFeedback, setReconcileFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Storekeeper: Inter-site Transfer Request Modal State
  const [isTransferRequestModalOpen, setIsTransferRequestModalOpen] = useState<boolean>(false);
  const [availableAssets, setAvailableAssets] = useState<AvailableTransferAssetItem[]>([]);
  const [isLoadingAvailableAssets, setIsLoadingAvailableAssets] = useState<boolean>(false);
  const [selectedAssetToTransfer, setSelectedAssetToTransfer] = useState<AvailableTransferAssetItem | null>(null);
  const [transferRequestTargetWhId, setTransferRequestTargetWhId] = useState<string>(() => {
    return selectedWarehouseId !== 'all' ? selectedWarehouseId : (assignedWarehouseId || 'wh-salehali-main');
  });
  const [transferRequestReason, setTransferRequestReason] = useState<string>('');
  const [isSubmittingTransferRequest, setIsSubmittingTransferRequest] = useState<boolean>(false);
  const [transferRequestFeedback, setTransferRequestFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState<string>('');

  // Incoming in-transit equipment to this warehouse
  const [incomingTransfers, setIncomingTransfers] = useState<PendingTransferItem[]>([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState<boolean>(false);
  const [receivingTransferId, setReceivingTransferId] = useState<string | null>(null);

  // Load incoming in-transit transfers for this warehouse
  const loadIncomingTransfers = React.useCallback(async (whId: string) => {
    setIsLoadingIncoming(true);
    try {
      const list = await getIncomingInTransitTransfersAction(whId);
      setIncomingTransfers(list);
    } catch (err) {
      console.warn('Error loading incoming transfers:', err);
    } finally {
      setIsLoadingIncoming(false);
    }
  }, []);

  React.useEffect(() => {
    void loadIncomingTransfers(selectedWarehouseId);
  }, [selectedWarehouseId, loadIncomingTransfers]);

  // Load available assets when modal opens or target warehouse changes
  const loadAvailableAssets = React.useCallback(async (targetWh: string) => {
    setIsLoadingAvailableAssets(true);
    try {
      const list = await getAvailableAssetsForTransferAction(targetWh);
      setAvailableAssets(list);
    } catch (err) {
      console.warn('Error loading available assets for transfer:', err);
    } finally {
      setIsLoadingAvailableAssets(false);
    }
  }, []);

  React.useEffect(() => {
    if (isTransferRequestModalOpen) {
      void loadAvailableAssets(transferRequestTargetWhId);
    }
  }, [isTransferRequestModalOpen, transferRequestTargetWhId, loadAvailableAssets]);

  // Sync transferRequestTargetWhId when selectedWarehouseId changes
  React.useEffect(() => {
    if (selectedWarehouseId !== 'all') {
      setTransferRequestTargetWhId(selectedWarehouseId);
    } else if (assignedWarehouseId) {
      setTransferRequestTargetWhId(assignedWarehouseId);
    }
  }, [selectedWarehouseId, assignedWarehouseId]);

  // Submit transfer request
  const handleSubmitTransferRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetToTransfer) {
      setTransferRequestFeedback({ text: 'אנא בחר כלי עבודה להעברה מהרשימה', type: 'error' });
      return;
    }
    if (!transferRequestTargetWhId) {
      setTransferRequestFeedback({ text: 'אנא בחר מחסן יעד', type: 'error' });
      return;
    }
    setIsSubmittingTransferRequest(true);
    setTransferRequestFeedback(null);
    try {
      const res = await createTransferRequestAction({
        assetId: selectedAssetToTransfer.id,
        sourceWarehouseId: selectedAssetToTransfer.currentWarehouseId,
        targetWarehouseId: transferRequestTargetWhId,
        reason: transferRequestReason,
      });
      if (res.success) {
        setTransferRequestFeedback({
          text: 'בקשת ההעברה נשלחה בהצלחה לאישור אחראי תפעול ראשי!',
          type: 'success',
        });
        setSelectedAssetToTransfer(null);
        setTransferRequestReason('');
        setTimeout(() => {
          setIsTransferRequestModalOpen(false);
          setTransferRequestFeedback(null);
        }, 2000);
      } else {
        setTransferRequestFeedback({
          text: res.error || 'שגיאה בהגשת בקשת העברה',
          type: 'error',
        });
      }
    } catch (err) {
      setTransferRequestFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsSubmittingTransferRequest(false);
    }
  };

  // Complete Reception of in-transit equipment
  const handleCompleteReception = async (req: PendingTransferItem) => {
    setReceivingTransferId(req.id);
    try {
      const res = await completeTransferReceptionAction(
        req.id,
        req.assetId,
        req.targetWarehouseId
      );
      if (res.success) {
        await handleWarehouseChange(selectedWarehouseId);
        await loadIncomingTransfers(selectedWarehouseId);
      } else {
        alert(res.error || 'שגיאה בקליטת הציוד');
      }
    } catch (err) {
      console.warn('Error completing reception:', err);
    } finally {
      setReceivingTransferId(null);
    }
  };

  // Switch active warehouse
  const handleWarehouseChange = React.useCallback(async (newId: string) => {
    setSelectedWarehouseId(newId);
    setIsLoadingWarehouse(true);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId;
      const updated = await getStorekeeperOperations(newId, activeOrgId);
      setData(updated);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (newId === 'all') {
          url.searchParams.delete('warehouse');
        } else {
          url.searchParams.set('warehouse', newId);
        }
        window.history.replaceState(null, '', url.toString());
      }
    } catch (err) {
      console.warn('Error loading warehouse operations:', err);
    } finally {
      setIsLoadingWarehouse(false);
    }
  }, [currentOrganization?.id, user?.organizationId]);

  // Sync warehouse for storekeeper if scoped
  React.useEffect(() => {
    if (
      isStorekeeper &&
      assignedWarehouseId &&
      assignedWarehouseId !== selectedWarehouseId
    ) {
      const timer = setTimeout(() => {
        void handleWarehouseChange(assignedWarehouseId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isStorekeeper, assignedWarehouseId, selectedWarehouseId, handleWarehouseChange]);

  // Open tool passport modal by QR
  const handleOpenPassport = async (qrCode: string) => {
    try {
      const asset = await getAssetDetailsByQr(qrCode, selectedWarehouseId);
      if (asset) {
        setPassportAsset(asset);
        setIsPassportOpen(true);
      }
    } catch (err) {
      console.warn('Error fetching tool passport:', err);
    }
  };

  // Submit Inter-Depot Asset Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferQrCode.trim()) return;
    setIsTransferring(true);
    setTransferFeedback(null);
    try {
      const asset = await getAssetDetailsByQr(transferQrCode.trim());
      if (!asset) {
        setTransferFeedback({
          text: 'כלי העבודה לא נמצא במערכת לפי ברקוד/QR זה',
          type: 'error',
        });
        setIsTransferring(false);
        return;
      }
      const res = await transferAssetAction({
        assetId: asset.id,
        targetWarehouseId: transferTargetWhId,
        notes: transferNotes || `העברה יזומה ע"י אחראי תפעול ראשי`,
      });
      if (res.success) {
        setTransferFeedback({
          text: res.message || 'הכלי הועבר בהצלחה למחסן היעד',
          type: 'success',
        });
        setTransferQrCode('');
        setTransferNotes('');
        await handleWarehouseChange(selectedWarehouseId);
      } else {
        setTransferFeedback({
          text: res.error || 'שגיאה בהעברת הכלי',
          type: 'error',
        });
      }
    } catch (err: unknown) {
      setTransferFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Submit Stock Reconciliation
  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReconciling(true);
    setReconcileFeedback(null);
    try {
      const res = await reconcileStockAction({
        warehouseId: selectedWarehouseId,
        auditedBy: 'אחראי תפעול ראשי',
        verifiedAssetIds: (data.overdueAssets || []).map((a) => a.assetId),
        discrepancyNotes,
      });
      if (res.success) {
        setReconcileFeedback({
          text: res.message || 'ספירת המלאי אומתה בהצלחה',
          type: 'success',
        });
        setTimeout(() => {
          setIsReconcileModalOpen(false);
        }, 1500);
      } else {
        setReconcileFeedback({
          text: res.error || 'שגיאה באימות ספירת מלאי',
          type: 'error',
        });
      }
    } catch {
      setReconcileFeedback({ text: 'שגיאה באימות ספירת מלאי', type: 'error' });
    } finally {
      setIsReconciling(false);
    }
  };

  // Helper to format phone for WhatsApp (e.g. 050-1234567 -> 972501234567)
  const getWhatsAppLink = (
    phone: string | null,
    workerName: string,
    toolName: string,
    qrCode: string,
    daysOverdue: number
  ) => {
    if (!phone) return null;
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '972' + clean.slice(1);
    } else if (!clean.startsWith('972')) {
      clean = '972' + clean;
    }

    const msg = `שלום ${workerName}, כאן מחסן ${data.warehouse.name}. תזכורת להחזרת כלי העבודה "${toolName}" (מק"ט ${qrCode}) הנמצא באיחור של ${daysOverdue} ימים. נא לתאם החזרה למחסן בהקדם.`;
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <AppLayout
      title={
        isChiefOperations
          ? 'Tooly - מרכז תפעול ראשי'
          : isGeneralManager
          ? 'Tooly - בקרה תפעולית'
          : 'Tooly - עמדת מחסנאי'
      }
      subtitle={
        isChiefOperations
          ? 'שליטה חוצת מחסנים וניוד ציוד'
          : 'תפעול מלאי והחזרות'
      }
      requiredRole="any_elevated"
    >
      <div className="max-w-5xl mx-auto px-4 py-5 space-y-6">
        {/* 2. FACILITY SELECTOR & WAREHOUSE STATUS BAR */}
        <div className="p-4 rounded-2xl bg-white border-2 border-blue-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md shrink-0 ${
              isChiefOperations
                ? 'bg-indigo-700 text-white shadow-indigo-600/20'
                : 'bg-blue-600 text-white shadow-blue-500/20'
            }`}>
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-500 block">
                מחסן / אתר פעיל:
              </span>
              <div className="relative inline-block mt-0.5">
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  disabled={isLoadingWarehouse || (isStorekeeper && !!assignedWarehouseId)}
                  className={`border-2 text-sm font-black rounded-xl pr-3 pl-8 py-1.5 focus:outline-none appearance-none ${
                    isStorekeeper && !!assignedWarehouseId
                      ? 'cursor-not-allowed bg-slate-100 border-slate-300 text-slate-700 opacity-90'
                      : isChiefOperations
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-950 focus:border-indigo-600 cursor-pointer'
                      : 'bg-blue-50 border-blue-200 text-blue-950 focus:border-blue-600 cursor-pointer'
                  }`}
                >
                  <option value="all">כלל המחסנים (All Depots)</option>
                  {warehouses?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ''}
                    </option>
                  ))}
                </select>
                {isStorekeeper && !!assignedWarehouseId ? (
                  <Lock className="w-4 h-4 text-amber-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-blue-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>

              {/* Scoping notice tag */}
              {isStorekeeper && !!assignedWarehouseId && (
                <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-fit">
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>מורשה למחסן זה בלבד (&quot;כל אחד של שלו&quot;)</span>
                </div>
              )}
              {canSwitchDepots && (
                <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 w-fit">
                  <span>🌐 שליטה מבצעית רב-אתרית פעילה</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{data.availableCount} זמינים במלאי</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>{data.checkedOutCount} בשימוש בשטח</span>
            </div>
            {data.quarantinedCount > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>{data.quarantinedCount} מושבת / בתיקון</span>
              </div>
            )}
            {isLoadingWarehouse && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            )}
          </div>
        </div>

        {/* CHIEF OPERATIONS CONTROL BAR (Multi-Facility Transfer & Reconciliation) */}
        {(isChiefOperations || isGeneralManager) && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-indigo-700/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/50 text-indigo-300 flex items-center justify-center border border-indigo-400/30 shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span>מרכז שליטה מבצעי - אחראי תפעול ראשי</span>
                  <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                    בקרה חוצת-מחסנים
                  </span>
                </h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  ניוד ציוד מיידי בין אתרי שטח, מכולות ורכבים &bull; ספירות מלאי וביקורות סוף שבוע
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setTransferFeedback(null);
                  setIsTransferModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>ניוד ציוד בין מחסנים</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReconcileFeedback(null);
                  setIsReconcileModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer active:scale-95"
              >
                <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                <span>ספירת מלאי מבוקרת</span>
              </button>
            </div>
          </div>
        )}

        {/* INTER-SITE EQUIPMENT TRANSFER REQUEST (Storekeeper -> Operations Manager) */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-blue-700/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/50 text-blue-200 flex items-center justify-center border border-blue-400/30 shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>בקשת העברת ציוד בין אתרים</span>
                <span className="text-[10px] font-bold bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                  נוהל מבוקר &bull; אישור מנהל תפעול
                </span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                חסר כלי עבודה באתר? בחר כלי זמין ממתקן אחר והגש בקשה מנומקת לאישור אחראי תפעול ראשי
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTransferRequestFeedback(null);
              setSelectedAssetToTransfer(null);
              setTransferRequestReason('');
              setAssetSearchQuery('');
              setIsTransferRequestModalOpen(true);
            }}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>בקשת העברת ציוד בין אתרים</span>
          </button>
        </div>

        {/* IN-TRANSIT EQUIPMENT ARRIVING TO THIS WAREHOUSE */}
        {incomingTransfers.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-950 font-black">
                <Truck className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-black">
                  ציוד בשינוע הממתין לקליטה במחסן ({incomingTransfers.length})
                </h3>
              </div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                In-Transit
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {incomingTransfers.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-xl bg-white border border-amber-200 shadow-xs flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">
                        {req.qrCode} {req.tagNumber ? `(${req.tagNumber})` : ''}
                      </span>
                      <h4 className="text-sm font-black text-slate-900">{req.assetName}</h4>
                      <p className="text-xs text-slate-500">
                        {req.assetBrand} {req.assetModel ? `• ${req.assetModel}` : ''}
                      </p>
                    </div>
                    <div className="text-left text-[11px] font-bold text-slate-600">
                      <div>ממחסן: <strong className="text-slate-900">{req.sourceWarehouseName}</strong></div>
                      <div>ליעד: <strong className="text-blue-900">{req.targetWarehouseName}</strong></div>
                    </div>
                  </div>

                  {req.reason && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                      &quot;{req.reason}&quot;
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      הוגש ע&quot;י {req.requestedBy}
                    </span>
                    <button
                      type="button"
                      disabled={receivingTransferId === req.id}
                      onClick={() => handleCompleteReception(req)}
                      className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      {receivingTransferId === req.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>קולט כלי...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>קליטת ציוד במחסן</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. PROMINENT ACTION SHORTCUTS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link
            href="/"
            className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-md shadow-blue-600/20 active:scale-95 transition-all"
          >
            <Zap className="w-6 h-6 stroke-[2.5]" />
            <span>⚡ ניפוק מרוכז מהיר</span>
          </Link>

          <Link
            href="/"
            className="p-3.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-sm active:scale-95 transition-all"
          >
            <Scan className="w-6 h-6 text-blue-600" />
            <span>קליטת ציוד והחזרה</span>
          </Link>

          <Link
            href="/print-tags"
            className="p-3.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-sm active:scale-95 transition-all"
          >
            <Printer className="w-6 h-6 text-blue-600" />
            <span>הדפסת תגיות QR</span>
          </Link>

          <Link
            href="/catalog"
            className="p-3.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-sm active:scale-95 transition-all"
          >
            <Layers className="w-6 h-6 text-blue-600" />
            <span>קטלוג ומלאי מלא</span>
          </Link>
        </div>

        {/* Zero State Alert for Live Production */}
        {data.availableCount === 0 && data.checkedOutCount === 0 && data.quarantinedCount === 0 && (
          <div className="p-8 rounded-2xl bg-amber-50/90 border-2 border-amber-200 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Package className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-amber-950">
                אין עדיין כלים רשומים במערכת - התחל בקליטת כלי חדש
              </h3>
              <p className="text-xs text-amber-800/90 max-w-md mx-auto">
                המחסן הנוכחי ריק מציוד פעיל. ניתן לקלוט כלי עבודה חדשים, לקודד תגיות QR או לנייד כלים ממחסנים אחרים.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>התחל בקליטת כלי חדש</span>
              </Link>
              <Link
                href="/catalog"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black shadow-sm transition-all active:scale-95"
              >
                <Layers className="w-4 h-4" />
                <span>צפייה בקטלוג הציוד</span>
              </Link>
            </div>
          </div>
        )}

        {/* 4. SECTION A: OVERDUE ASSETS WITH ONE-TAP CONTACT */}
        <div className="rounded-2xl border-2 border-rose-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-900 font-black">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h2 className="text-base">
                כלים באיחור להחזרה &bull; מעקב דחוף ({data.overdueAssets.length})
              </h2>
            </div>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
              טיפול מיידי
            </span>
          </div>

          {data.overdueAssets.length === 0 ? (
            <div className="p-6 text-center bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-800">
              כל הכלים שהונפקו מוחזרים בזמן! אין כרגע איחורים פעילים במחסן זה.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.overdueAssets.map((tool) => {
                const waLink = getWhatsAppLink(
                  tool.workerPhone,
                  tool.workerName,
                  tool.toolName,
                  tool.qrCode,
                  tool.daysOverdue
                );

                return (
                  <div
                    key={tool.assetId}
                    className="p-3.5 rounded-xl bg-rose-50/40 border border-rose-200 space-y-3 hover:border-rose-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                            +{tool.daysOverdue} ימים באיחור
                          </span>
                          <span className="font-mono text-[11px] font-bold text-slate-500" dir="ltr">
                            {tool.qrCode}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-blue-950 mt-1">
                          {tool.toolName}
                        </h3>
                        <div className="text-xs text-slate-500 font-medium">
                          {tool.brand} {tool.modelNumber ? `• ${tool.modelNumber}` : ''}
                        </div>
                      </div>

                      <div className="text-left font-bold text-xs text-slate-700">
                        <div className="text-blue-950 font-black">{tool.workerName}</div>
                        <div className="text-[11px] text-slate-500" dir="ltr">
                          {tool.workerPhone || 'ללא טלפון'}
                        </div>
                      </div>
                    </div>

                    {/* Direct Contact & Passport Buttons */}
                    <div className="pt-2 border-t border-rose-200/80 flex items-center gap-2">
                      {tool.workerPhone ? (
                        <>
                          <a
                            href={`tel:${tool.workerPhone}`}
                            className="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-blue-900 border border-slate-300 text-xs font-black flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5 text-blue-600" />
                            <span>חייג</span>
                          </a>

                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>וואטסאפ</span>
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic flex-1">
                          ללא טלפון
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenPassport(tool.qrCode)}
                        className="py-2 px-3 rounded-xl bg-white hover:bg-blue-50 text-blue-900 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="צפה בדרכון הכלי"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>דרכון</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 5. SECTION B: RETURNS DUE TODAY */}
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-950 font-black">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-base">
                החזרות צפויות היום במשמרת ({data.returnsDueToday.length})
              </h2>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              משמרת פעילה
            </span>
          </div>

          {data.returnsDueToday.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
              לא רשומות החזרות שתוזמנו להיום
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.returnsDueToday.map((item) => (
                <div
                  key={item.assetId}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-blue-950">
                        {item.toolName}
                      </h3>
                      <div className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                        {item.brand} &bull; {item.qrCode}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                      היום ב-
                      {new Date(item.expectedReturnDate).toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-600">
                      אצל: <strong>{item.workerName}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      {item.accessoriesSummary && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          {item.accessoriesSummary}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenPassport(item.qrCode)}
                        className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200 cursor-pointer"
                        title="צפה בדרכון הכלי"
                      >
                        דרכון
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. SECTION C: LOW STOCK ALERTS */}
        <div className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950 font-black">
              <TrendingDown className="w-5 h-5 text-amber-600" />
              <h2 className="text-base">
                התרעות מלאי קריטי במחסן ({data.lowStockAlerts.length})
              </h2>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              נדרש חידוש מלאי
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.lowStockAlerts.map((alert) => (
              <div
                key={alert.categoryId}
                className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950">
                    {alert.categoryName}
                  </span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                      alert.status === 'critical'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {alert.status === 'critical' ? 'מלאי קריטי' : 'מלאי נמוך'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 text-xs">
                  <span className="text-xl font-black text-amber-950">
                    {alert.availableCount}
                  </span>
                  <span className="text-slate-500">
                    זמינים (סף התרעה: {alert.minStockThreshold})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {/* CHIEF OPERATIONS: INTER-DEPOT ASSET TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-indigo-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/50 flex items-center justify-center border border-indigo-400/30">
                  <ArrowLeftRight className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">ניוד ציוד בין מחסנים ואתרים</h3>
                  <p className="text-[11px] text-indigo-200">סמכות תפעולית: העברת בעלות ומיקום כלי</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
              {transferFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    transferFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {transferFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{transferFeedback.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ברקוד / QR של הכלי להעברה <span className="text-indigo-600">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={transferQrCode}
                  onChange={(e) => setTransferQrCode(e.target.value)}
                  placeholder="לדוגמה: TOOL-DEW-01 או סריקת ברקוד"
                  dir="ltr"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:border-indigo-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  מתקן / מחסן יעד <span className="text-indigo-600">*</span>:
                </label>
                <select
                  value={transferTargetWhId}
                  onChange={(e) => setTransferTargetWhId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-indigo-600 focus:outline-none"
                >
                  {warehouses
                    ?.filter((w) => w.id !== selectedWarehouseId)
                    .map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} {wh.code ? `(${wh.code})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  סיבת העברה / הערות תפעול:
                </label>
                <textarea
                  rows={2}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="לדוגמה: תגבור ציוד לפרויקט גשרים, החלפת כלי תקול באתר..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-indigo-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>מעביר כלי...</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>בצע ניוד למתקן היעד</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHIEF OPERATIONS: STOCK RECONCILIATION MODAL */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-indigo-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/50 flex items-center justify-center border border-emerald-400/30">
                  <ClipboardCheck className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">ספירת מלאי מבוקרת וסנכרון מתקן</h3>
                  <p className="text-[11px] text-indigo-200">אימות פיזי של הציוד מול ספר המחסן</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReconcileModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReconcileSubmit} className="p-5 space-y-4">
              {reconcileFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    reconcileFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {reconcileFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{reconcileFeedback.text}</span>
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                <span className="text-[11px] font-bold text-indigo-900 block">מתקן בביקורת:</span>
                <span className="text-sm font-black text-indigo-950 block">{data.warehouse.name}</span>
                <div className="flex items-center gap-3 text-xs text-slate-600 pt-1">
                  <span>זמינים: <strong>{data.availableCount}</strong></span>
                  <span>בשטח: <strong>{data.checkedOutCount}</strong></span>
                  <span>השבתה: <strong>{data.quarantinedCount}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  הערות ספירה / ממצאי בדיקה פיזית:
                </label>
                <textarea
                  rows={3}
                  value={discrepancyNotes}
                  onChange={(e) => setDiscrepancyNotes(e.target.value)}
                  placeholder="לדוגמה: כל הכלים במדפי המחסן אומתו פיזית, ללא פערים או חוסרים..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-indigo-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReconcileModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isReconciling}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  {isReconciling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>מאמת ספירה...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>אשר ספירת מלאי רשמית</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* STOREKEEPER: INTER-SITE EQUIPMENT TRANSFER REQUEST MODAL */}
      {isTransferRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
                  <ArrowLeftRight className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">בקשת העברת ציוד בין אתרים</h3>
                  <p className="text-[11px] text-blue-200">הגשת בקשה מנומקת לאישור אחראי תפעול ראשי</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferRequestModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransferRequest} className="p-5 space-y-4 overflow-y-auto flex-1">
              {transferRequestFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    transferRequestFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {transferRequestFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{transferRequestFeedback.text}</span>
                </div>
              )}

              {/* Target Warehouse Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  מתקן / מחסן יעד לקליטה <span className="text-blue-600">*</span>:
                </label>
                <select
                  value={transferRequestTargetWhId}
                  onChange={(e) => {
                    setTransferRequestTargetWhId(e.target.value);
                    setSelectedAssetToTransfer(null);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-blue-600 focus:outline-none"
                >
                  {warehouses
                    .filter((w) => w.id !== 'all')
                    .map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} {wh.code ? `(${wh.code})` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  המחסן שאליו יועבר הכלי לאחר אישור מנהל התפעול
                </p>
              </div>

              {/* Selected Asset or Asset Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  בחר כלי עבודה ממתקן אחר <span className="text-blue-600">*</span>:
                </label>

                {selectedAssetToTransfer ? (
                  <div className="p-3.5 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-200 text-blue-900">
                          {selectedAssetToTransfer.currentWarehouseName}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">
                          {selectedAssetToTransfer.qrCode}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-blue-950 mt-1">
                        {selectedAssetToTransfer.name}
                      </h4>
                      <p className="text-xs text-slate-600">
                        {selectedAssetToTransfer.brand} {selectedAssetToTransfer.modelNumber ? `• ${selectedAssetToTransfer.modelNumber}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAssetToTransfer(null)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-rose-700 text-xs font-bold border border-slate-200 cursor-pointer"
                    >
                      החלף כלי
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={assetSearchQuery}
                        onChange={(e) => setAssetSearchQuery(e.target.value)}
                        placeholder="סנן לפי שם כלי, מותג, מחסן או מק&quot;ט..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3.5 py-2 text-xs text-slate-900 font-medium focus:border-blue-600 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="border border-slate-200 rounded-2xl max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
                      {isLoadingAvailableAssets ? (
                        <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span>טוען כלים זמינים במחסנים אחרים...</span>
                        </div>
                      ) : availableAssets.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          לא נמצאו כלים זמינים במחסנים אחרים להעברה
                        </div>
                      ) : (
                        availableAssets
                          .filter((a) => {
                            if (!assetSearchQuery.trim()) return true;
                            const q = assetSearchQuery.toLowerCase();
                            return (
                              a.name.toLowerCase().includes(q) ||
                              a.brand.toLowerCase().includes(q) ||
                              (a.modelNumber && a.modelNumber.toLowerCase().includes(q)) ||
                              a.qrCode.toLowerCase().includes(q) ||
                              a.currentWarehouseName.toLowerCase().includes(q)
                            );
                          })
                          .map((asset) => (
                            <div
                              key={asset.id}
                              onClick={() => setSelectedAssetToTransfer(asset)}
                              className="p-2.5 flex items-center justify-between hover:bg-blue-50/80 cursor-pointer transition-colors"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                                    {asset.currentWarehouseName}
                                  </span>
                                  <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                                    {asset.qrCode}
                                  </span>
                                </div>
                                <div className="text-xs font-black text-slate-900 mt-0.5">
                                  {asset.name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {asset.brand} {asset.modelNumber ? `• ${asset.modelNumber}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                              >
                                בחר
                              </button>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  סיבת הבקשה / צורך תפעולי באתר <span className="text-blue-600">*</span>:
                </label>
                <textarea
                  rows={3}
                  required
                  value={transferRequestReason}
                  onChange={(e) => setTransferRequestReason(e.target.value)}
                  placeholder="לדוגמה: מחסור בפטישונים באתר חגית עקב תגבור צוות יציקות..."
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-blue-600 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTransferRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransferRequest || !selectedAssetToTransfer}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  {isSubmittingTransferRequest ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>שולח בקשה...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>שלח בקשה לאישור מנהל</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
