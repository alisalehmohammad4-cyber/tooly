'use client';

import React, { useState } from 'react';
import {
  X,
  UserCheck,
  CheckCircle2,
  Truck,
  Building2,
  QrCode,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Wrench,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Trash2,
  Check,
  FileText,
  Lock,
  DollarSign,
  Radio,
} from 'lucide-react';
import type { Warehouse, AssetCondition, DamageType, ChargeParty } from '@/types/domain';
import {
  type ScannedAssetDetails,
  checkoutAssetAction,
  checkinAssetAction,
  transferAssetAction,
  reportAssetDamageAction,
  retireAssetAction,
} from '@/app/actions/custody';
import { getCurrentGpsCoordinates } from '@/lib/geo';
import { useAuth } from '@/context/AuthContext';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import {
  enqueueSyncAction,
  updateCachedAsset,
  cacheAsset,
} from '@/lib/offline/offlineDb';
import { useWebNfc } from '@/lib/nfc/useWebNfc';

interface AssetActionModalProps {
  asset: ScannedAssetDetails | null;
  warehouses: Warehouse[];
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: (message: string, updatedAsset: ScannedAssetDetails) => void;
  onAddToCart?: (asset: ScannedAssetDetails) => void;
  isInCart?: boolean;
}

type ModalTab = 'checkout' | 'checkin' | 'transfer' | 'retire';

export default function AssetActionModal({
  asset,
  warehouses,
  isOpen,
  onClose,
  onActionComplete,
  onAddToCart,
  isInCart = false,
}: AssetActionModalProps) {
  const { role, user, openPinModal, currentOrganization } = useAuth();

  // Tab Mode: auto-select Check-In if already checked_out, otherwise Check-Out
  const initialTab: ModalTab =
    asset?.status === 'checked_out' ? 'checkin' : 'checkout';
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);

  // Digital Tool Passport Modal State
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

  // Form states
  const [workerName, setWorkerName] = useState<string>('');
  const [workerPhone, setWorkerPhone] = useState<string>('');
  const [checkinCondition, setCheckinCondition] =
    useState<AssetCondition>('good');
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>(
    warehouses[0]?.id || ''
  );
  const [notes, setNotes] = useState<string>('');

  // Damage report state (Checkin tab when condition is repair/retired)
  const [damageType, setDamageType] = useState<DamageType>('impact_drop');
  const [damageEstimatedCost, setDamageEstimatedCost] = useState<string>('');
  const [damageChargeParty, setDamageChargeParty] = useState<ChargeParty>('company');
  const [damageReportNotes, setDamageReportNotes] = useState<string>('');

  // Damage report state (Worker mode)
  const [damageIssueType, setDamageIssueType] = useState<string>('שבר פיזי');
  const [damageNotes, setDamageNotes] = useState<string>('');

  // Admin retire state
  const [retireReason, setRetireReason] = useState<string>('');

  // Status & loading
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Web NFC Tag Writer
  const { isWriting: isNfcWriting, writeNfcTag } = useWebNfc();
  const [nfcWriteNotice, setNfcWriteNotice] = useState<string | null>(null);

  const handleWriteNfc = async () => {
    if (!asset) return;
    setNfcWriteNotice('ממתין להצמדת תגית NFC לגב המכשיר...');
    const ok = await writeNfcTag(asset.qrCode, currentOrganization?.slug);
    if (ok) {
      setNfcWriteNotice('תגית ה-NFC נצרבה בהצלחה! תומכת באייפון ובאנדרואיד.');
      setTimeout(() => setNfcWriteNotice(null), 4000);
    } else {
      setNfcWriteNotice('שגיאה בצריבת תגית ה-NFC. וודא שהתגית תקינה ונסה שוב.');
    }
  };

  if (!isOpen || !asset) return null;

  const isAvailable = asset.status === 'available';
  const isCheckedOut = asset.status === 'checked_out';
  const isMaintenance = asset.status === 'maintenance';

  // Safety inspection check
  const isInspectionOverdue = Boolean(
    asset.safetyInspectionDue &&
      new Date(asset.safetyInspectionDue).getTime() < new Date().getTime()
  );

  // Warehouse scoping check (Storekeeper cannot dispatch tools from other warehouses)
  const isStorekeeper = role === 'storekeeper' || role === 'supervisor';
  const isForeignWarehouse =
    isStorekeeper &&
    Boolean(user?.assignedWarehouseId) &&
    asset.currentWarehouseId !== user.assignedWarehouseId;

  // Handle Checkout Action (Supervisor & Admin)
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isForeignWarehouse) {
      setActionError(
        `כלי זה שייך ל-${asset.warehouseName}. בתור מחסנאי של ${user?.assignedWarehouseName || 'מחסן אחר'}, אינך מורשה לנפק כלי זה.`
      );
      return;
    }

    if (!workerName.trim()) {
      setActionError('שם העובד נדרש לניפוק הכלי.');
      return;
    }

    if (asset.isLocked) {
      setActionError(`הכלי נעול מנהלית: ${asset.lockReason || 'נעול להוצאה מהמחסן'}`);
      return;
    }

    if (isInspectionOverdue) {
      setActionError('⚠️ הכלי נעול לשימוש! פג תוקף בדיקת בטיחות תקופתית');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const gps = await getCurrentGpsCoordinates();
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const checkoutPayload = {
      assetId: asset.id,
      workerName: workerName.trim(),
      workerPhone: workerPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      gps,
    };

    if (isOffline) {
      await enqueueSyncAction('checkout', checkoutPayload);
      const updated = await updateCachedAsset(asset.id, {
        status: 'checked_out',
        currentAssignedWorker: workerName.trim(),
      });
      const optimistic = updated || {
        ...asset,
        status: 'checked_out' as const,
        currentAssignedWorker: workerName.trim(),
      };
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([100, 50, 100]); } catch {}
      }
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (ניפוק כלי)', optimistic);
      onClose();
      return;
    }

    try {
      const res = await checkoutAssetAction(checkoutPayload);
      setIsSubmitting(false);

      if (!res.success) {
        setActionError(res.error);
        return;
      }

      if (res.asset) await cacheAsset(res.asset);
      onActionComplete(res.message, res.asset);
      onClose();
    } catch {
      // Fallback on network disconnect
      await enqueueSyncAction('checkout', checkoutPayload);
      const updated = await updateCachedAsset(asset.id, {
        status: 'checked_out',
        currentAssignedWorker: workerName.trim(),
      });
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (ניפוק כלי)', updated || {
        ...asset,
        status: 'checked_out',
        currentAssignedWorker: workerName.trim(),
      });
      onClose();
    }
  };

  // Handle Check-in Action (Supervisor & Admin)
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setActionError(null);

    const gps = await getCurrentGpsCoordinates();

    const isDamagedOrRetired =
      checkinCondition === 'needs_repair' || checkinCondition === 'retired';

    const damageReport = isDamagedOrRetired
      ? {
          isDamaged: true,
          damageType,
          estimatedCost: damageEstimatedCost ? Number(damageEstimatedCost) : undefined,
          chargeParty: damageChargeParty,
          notes: damageReportNotes.trim() || undefined,
        }
      : undefined;

    const checkinPayload = {
      assetId: asset.id,
      condition: checkinCondition,
      notes: notes.trim() || undefined,
      damageReport,
      gps,
    };

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const newStatus = isDamagedOrRetired ? 'maintenance' : 'available';

    if (isOffline) {
      await enqueueSyncAction('checkin', checkinPayload);
      const updated = await updateCachedAsset(asset.id, {
        status: newStatus,
        condition: checkinCondition,
        currentAssignedWorker: null,
      });
      const optimistic = updated || {
        ...asset,
        status: newStatus as ScannedAssetDetails['status'],
        condition: checkinCondition,
        currentAssignedWorker: null,
      };
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([100, 50, 100]); } catch {}
      }
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (החזרת כלי)', optimistic);
      onClose();
      return;
    }

    try {
      const res = await checkinAssetAction(checkinPayload);
      setIsSubmitting(false);

      if (!res.success) {
        setActionError(res.error);
        return;
      }

      if (res.asset) await cacheAsset(res.asset);
      onActionComplete(res.message, res.asset);
      onClose();
    } catch {
      await enqueueSyncAction('checkin', checkinPayload);
      const updated = await updateCachedAsset(asset.id, {
        status: newStatus,
        condition: checkinCondition,
        currentAssignedWorker: null,
      });
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (החזרת כלי)', updated || {
        ...asset,
        status: newStatus,
        condition: checkinCondition,
        currentAssignedWorker: null,
      });
      onClose();
    }
  };

  // Handle Transfer Action (Supervisor & Admin)
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isForeignWarehouse) {
      setActionError(
        `כלי זה שייך ל-${asset.warehouseName}. אינך מורשה לבצע העברה עבור כלי ממחסן אחר.`
      );
      return;
    }

    if (!targetWarehouseId) {
      setActionError('אנא בחר אתר יעד להעברה.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const gps = await getCurrentGpsCoordinates();
    const targetWhMeta = warehouses.find((w) => w.id === targetWarehouseId);

    const transferPayload = {
      assetId: asset.id,
      targetWarehouseId,
      notes: notes.trim() || undefined,
      gps,
    };

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      await enqueueSyncAction('transfer', transferPayload);
      const updated = await updateCachedAsset(asset.id, {
        currentWarehouseId: targetWarehouseId,
        warehouseName: targetWhMeta?.name || asset.warehouseName,
        warehouseCode: targetWhMeta?.code || asset.warehouseCode,
      });
      const optimistic = updated || {
        ...asset,
        currentWarehouseId: targetWarehouseId,
        warehouseName: targetWhMeta?.name || asset.warehouseName,
        warehouseCode: targetWhMeta?.code || asset.warehouseCode,
      };
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([100, 50, 100]); } catch {}
      }
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (העברת כלי)', optimistic);
      onClose();
      return;
    }

    try {
      const res = await transferAssetAction(transferPayload);
      setIsSubmitting(false);

      if (!res.success) {
        setActionError(res.error);
        return;
      }

      if (res.asset) await cacheAsset(res.asset);
      onActionComplete(res.message, res.asset);
      onClose();
    } catch {
      await enqueueSyncAction('transfer', transferPayload);
      const updated = await updateCachedAsset(asset.id, {
        currentWarehouseId: targetWarehouseId,
        warehouseName: targetWhMeta?.name || asset.warehouseName,
        warehouseCode: targetWhMeta?.code || asset.warehouseCode,
      });
      setIsSubmitting(false);
      onActionComplete('נשמר במכשיר במצב לא מקוון ויסונכרן בהתחברות לרשת (העברת כלי)', updated || {
        ...asset,
        currentWarehouseId: targetWarehouseId,
        warehouseName: targetWhMeta?.name || asset.warehouseName,
        warehouseCode: targetWhMeta?.code || asset.warehouseCode,
      });
      onClose();
    }
  };

  // Handle Report Damage Action (Worker mode)
  const handleReportDamage = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setActionError(null);

    const damagePayload = {
      assetId: asset.id,
      reportedBy: user.fullName || 'עובד שטח',
      issueType: damageIssueType,
      notes: damageNotes.trim() || undefined,
    };

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      await enqueueSyncAction('damage_report', damagePayload);
      const updated = await updateCachedAsset(asset.id, {
        status: 'maintenance',
        condition: 'needs_repair',
      });
      setIsSubmitting(false);
      onActionComplete('דיווח התקלה נשמר במכשיר באופליין ויסונכרן בהתחברות', updated || {
        ...asset,
        status: 'maintenance',
        condition: 'needs_repair',
      });
      onClose();
      return;
    }

    try {
      const res = await reportAssetDamageAction(damagePayload);
      setIsSubmitting(false);

      if (!res.success) {
        setActionError(res.error);
        return;
      }

      if (res.asset) await cacheAsset(res.asset);
      onActionComplete(res.message, res.asset);
      onClose();
    } catch {
      await enqueueSyncAction('damage_report', damagePayload);
      const updated = await updateCachedAsset(asset.id, {
        status: 'maintenance',
        condition: 'needs_repair',
      });
      setIsSubmitting(false);
      onActionComplete('דיווח התקלה נשמר במכשיר באופליין ויסונכרן בהתחברות', updated || {
        ...asset,
        status: 'maintenance',
        condition: 'needs_repair',
      });
      onClose();
    }
  };

  // Handle Retire Asset Action (Admin mode)
  const handleRetireAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retireReason.trim()) {
      setActionError('נא לציין סיבת השבתה מפורטת.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const res = await retireAssetAction({
      assetId: asset.id,
      retiredBy: user.fullName || 'מנהל פרויקט',
      reason: retireReason.trim(),
    });

    setIsSubmitting(false);

    if (!res.success) {
      setActionError(res.error);
      return;
    }

    onActionComplete(res.message, res.asset);
    onClose();
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-modal-title"
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div className="w-full max-w-lg bg-white border-2 border-blue-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200 text-blue-950">
          {/* TOP TOOL BANNER */}
          <div className="bg-blue-50/80 border-b border-blue-100 p-4 relative">
            <div className="absolute top-4 left-4 flex items-center gap-1.5">
              {role !== 'worker' && (
                <button
                  type="button"
                  onClick={handleWriteNfc}
                  disabled={isNfcWriting}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="צרוב תגית NFC לכלי זה (אוניברסלי לאייפון ואנדרואיד)"
                >
                  <Radio className={`w-3.5 h-3.5 text-blue-600 ${isNfcWriting ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{isNfcWriting ? 'קרב מדבקה...' : 'צרוב NFC'}</span>
                  <span className="sm:hidden">NFC</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPassportOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer active:scale-95"
                title="צפה בדרכון הכלי המלא"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>דרכון כלי</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="סגור חלון"
                className="w-9 h-9 rounded-full bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                {asset.brand}
              </span>
              <div className="flex items-center gap-1 text-xs font-mono text-blue-900" dir="ltr">
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-bold">{asset.qrCode}</span>
              </div>
              {asset.nfcUid && (
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200" dir="ltr">
                  NFC: {asset.nfcUid}
                </span>
              )}
              {role === 'worker' && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  כרטיס כלי (עובד שטח)
                </span>
              )}
            </div>

            <h2
              id="asset-modal-title"
              className="text-lg font-black text-blue-950 leading-tight pl-32"
            >
              {asset.toolName}
            </h2>

            {asset.modelNumber && (
              <div className="text-xs font-mono text-slate-500 mt-0.5" dir="ltr">
                דגם: {asset.modelNumber}
              </div>
            )}

            {nfcWriteNotice && (
              <div className="mt-2.5 p-2 rounded-xl bg-blue-100/90 border border-blue-300 text-blue-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{nfcWriteNotice}</span>
              </div>
            )}

            {/* Lockout or Inspection alerts in banner */}
            {(asset.isLocked || isInspectionOverdue) && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {asset.isLocked && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    <Lock className="w-3 h-3 text-red-600" />
                    נעול מנהלתית
                  </span>
                )}
                {isInspectionOverdue && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                    נדרשת בדיקת בטיחות
                  </span>
                )}
              </div>
            )}

            {/* Current Location & Live Status Pill */}
            <div className="mt-3 pt-3 border-t border-blue-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate max-w-[200px]">{asset.warehouseName}</span>
              </div>

              <div>
                {isAvailable && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    זמין במלאי
                  </span>
                )}
                {isCheckedOut && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-amber-50 text-amber-800 border border-amber-300">
                    <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                    בשימוש: {asset.currentAssignedWorker}
                  </span>
                )}
                {isMaintenance && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black bg-red-50 text-red-700 border border-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    בתיקון / בדיקה
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* WORKER VIEW: SAFETY NOTES & DAMAGE REPORT (NO TABS) */}
          {role === 'worker' ? (
            <div className="p-4 pb-14 sm:pb-8 overflow-y-auto overscroll-contain flex-1 space-y-5">
              {/* Safety Guidelines Card */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>הנחיות בטיחות ושימוש בשטח</span>
                </div>
                <ul className="text-[12px] text-amber-950 font-medium space-y-1 list-disc list-inside">
                  <li>חובה ללבוש ציוד מגן אישי מתאים (משקפי מגן, כפפות עבודה, אטמי אוזניים).</li>
                  <li>בדוק תקינות כבלים, מגני שבבים ושלמות מעטפת הכלי לפני כל הפעלה.</li>
                  <li>חל איסור להשתמש בכלי פגום או כאשר קיים רעש/ריח חריג.</li>
                </ul>
              </div>

              {/* Error banner if any */}
              {actionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Single Action for Worker: Report Damage */}
              <form onSubmit={handleReportDamage} className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wider">
                    <Wrench className="w-4 h-4 text-red-600" />
                    <span>דיווח על תקלה או כלי לא תקין</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      סוג התקלה / הבעיה
                    </label>
                    <select
                      value={damageIssueType}
                      onChange={(e) => setDamageIssueType(e.target.value)}
                      className="w-full min-h-[46px] bg-white text-slate-900 text-sm px-3 rounded-xl border border-slate-300 font-medium focus:border-red-600 focus:outline-none"
                    >
                      <option value="שבר פיזי">שבר פיזי / פגיעה במעטפת</option>
                      <option value="מנוע שרוף">מנוע שרוף / התחממות חריגה</option>
                      <option value="כבל חשמל פגום">כבל חשמל / סוללה פגומה</option>
                      <option value="מתג הפעלה תקול">מתג הפעלה תקול</option>
                      <option value="בלאי רצועה / להב">בלאי רצועה / להב שחוק</option>
                      <option value="אביזר חסר">אביזר חסר / חלק מנותק</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      תיאור התקלה (אופציונלי)
                    </label>
                    <textarea
                      rows={2}
                      value={damageNotes}
                      onChange={(e) => setDamageNotes(e.target.value)}
                      placeholder="פרט מה קרה לכלי והיכן הוא נמצא כעת..."
                      className="w-full bg-white text-slate-900 text-sm p-3 rounded-xl border border-slate-300 font-medium focus:border-red-600 focus:outline-none placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[50px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-red-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>שלח דיווח על תקלה (העבר לבדיקה)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Supervisor elevation prompt */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    openPinModal();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-bold hover:underline cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>נדרש ניפוק, החזרה או העברה? לחץ להזנת קוד מנהל</span>
                </button>
              </div>
            </div>
          ) : (
            /* SUPERVISOR & ADMIN VIEW: FULL ACTION TABS */
            <>
              <div
                className={`grid ${
                  role === 'admin' ? 'grid-cols-4' : 'grid-cols-3'
                } gap-1 p-2 bg-slate-100/80 border-b border-blue-100 text-xs font-black`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('checkout');
                    setActionError(null);
                  }}
                  className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    activeTab === 'checkout'
                      ? 'bg-blue-600 text-white shadow-md font-black'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>ניפוק</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('checkin');
                    setActionError(null);
                  }}
                  className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    activeTab === 'checkin'
                      ? 'bg-blue-600 text-white shadow-md font-black'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>החזרה</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('transfer');
                    setActionError(null);
                  }}
                  className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    activeTab === 'transfer'
                      ? 'bg-blue-600 text-white shadow-md font-black'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>העברה</span>
                </button>

                {role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('retire');
                      setActionError(null);
                    }}
                    className={`min-h-[48px] rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      activeTab === 'retire'
                        ? 'bg-red-600 text-white shadow-md font-black'
                        : 'text-red-700 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>השבתה</span>
                  </button>
                )}
              </div>

              {/* TAB CONTENTS & FORMS */}
              <div className="p-4 pb-14 sm:pb-8 overflow-y-auto overscroll-contain flex-1">
                {actionError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                {/* TAB A: CHECK-OUT FORM */}
                {activeTab === 'checkout' && (
                  <form onSubmit={handleCheckout} className="space-y-4">
                    {/* Lockout or Inspection Banner */}
                    {(asset.isLocked || isInspectionOverdue) && (
                      <div className="p-3 bg-red-50 border-2 border-red-300 rounded-2xl text-red-900 text-xs space-y-1">
                        <div className="font-black flex items-center gap-1.5 text-red-700">
                          <AlertTriangle className="w-4 h-4" />
                          <span>פעולת הניפוק חסומה!</span>
                        </div>
                        {asset.isLocked && (
                          <p>
                            כלי זה נעול מנהלתית: {asset.lockReason || 'נדרש שחרור בדרכון הכלי'}
                          </p>
                        )}
                        {isInspectionOverdue && (
                          <p>
                            תוקף בדיקת הבטיחות פג! יש לחדש בדיקה בדרכון הכלי לפני ניפוקו.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Scoped Warehouse Restriction Banner */}
                    {isForeignWarehouse && (
                      <div className="p-3 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl text-amber-950 text-xs space-y-1">
                        <div className="font-black flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>הגבלת סמכות מחסן משויך</span>
                        </div>
                        <p>
                          כלי זה שייך ל-<strong>{asset.warehouseName}</strong>. עמדתך מוגדרת עבור{' '}
                          <strong>{user?.assignedWarehouseName || 'מחסן אחר'}</strong>. ניפוק הכלי חסום ללא הרשאת מנהל.
                        </p>
                      </div>
                    )}

                    {onAddToCart && isAvailable && !asset.isLocked && !isInspectionOverdue && !isForeignWarehouse && (
                      <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200 flex items-center justify-between gap-2 shadow-sm">
                        <div>
                          <div className="text-xs font-black text-blue-950">
                            {isInCart ? 'הכלי כבר נמצא בסל הניפוק' : 'מעוניין בניפוק מרוכז?'}
                          </div>
                          <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                            {isInCart
                              ? 'כלי זה כבר צורף לסל הניפוק הנוכחי'
                              : 'הוסף כלי זה לסל הניפוק כדי לנפק מספר כלים לעובד בחתימה דיגיטלית מרוכזת'}
                          </div>
                        </div>
                        {!isInCart && (
                          <button
                            type="button"
                            onClick={() => {
                              onAddToCart(asset);
                              onClose();
                            }}
                            className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shrink-0 flex items-center gap-1 shadow-sm cursor-pointer transition-all active:scale-95"
                          >
                            <span>+ הוסף לסל</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        שם העובד המקבל <span className="text-blue-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                        placeholder="לדוגמה: ישראל ישראלי"
                        className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        טלפון נייד
                      </label>
                      <input
                        type="tel"
                        value={workerPhone}
                        onChange={(e) => setWorkerPhone(e.target.value)}
                        placeholder="לדוגמה: 050-1234567"
                        dir="ltr"
                        className="w-full min-h-[50px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm text-right"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        הערות ניפוק (אתר עבודה, צוות)
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="לדוגמה: אתר בנייה מגדל שלום - קומה 12"
                        className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || asset.isLocked || isInspectionOverdue || isForeignWarehouse}
                      className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <>
                          <UserCheck className="w-6 h-6 stroke-[2.5]" />
                          <span>אשר ניפוק לעובד</span>
                          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* TAB B: CHECK-IN FORM */}
                {activeTab === 'checkin' && (
                  <form onSubmit={handleCheckin} className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2">
                        בדיקת מצב הכלי בעת ההחזרה <span className="text-blue-600">*</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => setCheckinCondition('excellent')}
                          className={`min-h-[54px] p-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            checkinCondition === 'excellent'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>מצוין (חדש)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCheckinCondition('good')}
                          className={`min-h-[54px] p-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            checkinCondition === 'good'
                              ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <Check className="w-4 h-4 text-blue-600" />
                          <span>טוב (בלאי קל)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCheckinCondition('needs_repair')}
                          className={`min-h-[54px] p-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            checkinCondition === 'needs_repair'
                              ? 'border-red-600 bg-red-50 text-red-900 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>דורש תיקון</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCheckinCondition('retired')}
                          className={`min-h-[54px] p-2 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                            checkinCondition === 'retired'
                              ? 'border-rose-700 bg-rose-100 text-rose-950 shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <Trash2 className="w-4 h-4 text-rose-600" />
                          <span>מושבת / גריטה</span>
                        </button>
                      </div>
                    </div>

                    {/* DAMAGE INCIDENT REPORT SUB-FORM (Auto-expanded when condition is repair or retired) */}
                    {(checkinCondition === 'needs_repair' || checkinCondition === 'retired') && (
                      <div className="p-4 rounded-2xl bg-red-50/70 border-2 border-red-200 space-y-3 animate-in fade-in">
                        <div className="flex items-center gap-2 text-red-900 font-black text-xs uppercase tracking-wider">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>דוח נזק ותקלה</span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-red-950 mb-1">
                            סוג הנזק <span className="text-red-600">*</span>
                          </label>
                          <select
                            value={damageType}
                            onChange={(e) => setDamageType(e.target.value as DamageType)}
                            className="w-full min-h-[46px] bg-white text-slate-900 text-xs px-3 rounded-xl border border-red-300 font-bold focus:border-red-600 focus:outline-none"
                          >
                            <option value="impact_drop">נפילה / מכה קשה</option>
                            <option value="misuse">שימוש לא נכון</option>
                            <option value="burned_motor">מנוע שרוף</option>
                            <option value="wear_tear">בלאי טבעי</option>
                            <option value="other">אחר</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-red-950 mb-1 flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                              עלות תיקון משוערת (₪)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={damageEstimatedCost}
                              onChange={(e) => setDamageEstimatedCost(e.target.value)}
                              placeholder="0 ₪"
                              className="w-full min-h-[46px] bg-white text-slate-900 font-bold text-sm px-3 rounded-xl border border-red-300 focus:border-red-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-red-950 mb-1">
                              גורם אחראי לחיוב
                            </label>
                            <div className="grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                onClick={() => setDamageChargeParty('company')}
                                className={`py-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  damageChargeParty === 'company'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                בלאי חברה
                              </button>
                              <button
                                type="button"
                                onClick={() => setDamageChargeParty('worker')}
                                className={`py-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  damageChargeParty === 'worker'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                עובד
                              </button>
                              <button
                                type="button"
                                onClick={() => setDamageChargeParty('subcontractor')}
                                className={`py-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  damageChargeParty === 'subcontractor'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                קבלן משנה
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-red-950 mb-1">
                            הערות נזק וממצאי בדיקה
                          </label>
                          <textarea
                            rows={2}
                            value={damageReportNotes}
                            onChange={(e) => setDamageReportNotes(e.target.value)}
                            placeholder="תאר את הנזק והנסיבות..."
                            className="w-full bg-white text-slate-900 text-xs p-2.5 rounded-xl border border-red-300 font-medium focus:border-red-600 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        הערות החזרה (תקלות, אביזרים חסרים)
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="לדוגמה: הוחזר ללא סוללה נוספת, נדרש ניקוי"
                        className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                          <span>אשר החזרת כלי למחסן</span>
                          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* TAB C: SITE TRANSFER FORM */}
                {activeTab === 'transfer' && (
                  <form onSubmit={handleTransfer} className="space-y-4">
                    {/* Scoped Warehouse Restriction Banner */}
                    {isForeignWarehouse && (
                      <div className="p-3 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl text-amber-950 text-xs space-y-1">
                        <div className="font-black flex items-center gap-1.5 text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>הגבלת סמכות מחסן משויך</span>
                        </div>
                        <p>
                          כלי זה שייך ל-<strong>{asset.warehouseName}</strong>. עמדתך מוגדרת עבור{' '}
                          <strong>{user?.assignedWarehouseName || 'מחסן אחר'}</strong>. העברת הכלי חסומה ללא הרשאת מנהל.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        אתר יעד להעברה <span className="text-blue-600">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={targetWarehouseId}
                          onChange={(e) => setTargetWarehouseId(e.target.value)}
                          className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none cursor-pointer shadow-sm"
                        >
                          {warehouses.map((wh) => (
                            <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                              {wh.code ? `[${wh.code}] ` : ''}
                              {wh.name} {wh.id === asset.currentWarehouseId ? '(נוכחי)' : ''}
                            </option>
                          ))}
                        </select>
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-sm">
                          ▼
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                        הערות העברה ושינוע
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="לדוגמה: נשלח ברכב שירות לאתר המרכזי"
                        className="w-full min-h-[50px] bg-white text-blue-950 font-medium text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || isForeignWarehouse}
                      className="w-full min-h-[60px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <>
                          <Truck className="w-6 h-6 stroke-[2.5]" />
                          <span>אשר העברה לאתר היעד</span>
                          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* TAB D: RETIRE ASSET (ADMIN ONLY) */}
                {activeTab === 'retire' && role === 'admin' && (
                  <form onSubmit={handleRetireAsset} className="space-y-4">
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-900 text-xs space-y-1">
                      <div className="font-extrabold flex items-center gap-1.5 text-red-700">
                        <ShieldCheck className="w-4 h-4" />
                        <span>פעולת מנהל מערכת: השבתת כלי וגריעה ממלאי</span>
                      </div>
                      <p>
                        פעולה זו תשבית את הכלי לצמיתות ותגרע אותו ממצאי הכלים הפעילים בכל האתרים.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-extrabold text-red-900 tracking-wider mb-1">
                        סיבת השבתה / גריעה <span className="text-red-600">*</span>
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={retireReason}
                        onChange={(e) => setRetireReason(e.target.value)}
                        placeholder="לדוגמה: בלאי סופני במנוע וגיר, עלות תיקון עולה על כלי חדש..."
                        className="w-full bg-white text-slate-900 text-sm p-3 rounded-xl border-2 border-red-200 font-medium focus:border-red-600 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full min-h-[56px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-red-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <>
                          <Trash2 className="w-5 h-5" />
                          <span>אשר השבתה וגריעה מהמערכת</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* DIGITAL TOOL PASSPORT MODAL */}
      <ToolPassportModal
        isOpen={isPassportOpen}
        asset={asset}
        onClose={() => setIsPassportOpen(false)}
        onAssetUpdated={(updated) => {
          onActionComplete('דרכון הכלי עודכן בהצלחה', updated);
        }}
      />
    </>
  );
}
