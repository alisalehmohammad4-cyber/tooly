'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Building2,
  DollarSign,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookmarkCheck,
  RotateCcw,
  Radio,
  Clock,
  UserCheck,
  Truck,
  Sparkles,
  Phone,
  FileSignature,
  Printer,
  History as HistoryIcon,
  Calendar,
  Wrench,
  Layers,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import {
  toggleAssetLockAction,
  renewSafetyInspectionAction,
  reserveAssetAction,
} from '@/app/actions/custody';
import {
  getAssetTimelineAction,
  getAssetPassportAction,
  type AuditHistoryRecord,
  type AuditActionType,
} from '@/app/actions/history';
import { useAuth } from '@/context/AuthContext';
import { useWebNfc } from '@/lib/nfc/useWebNfc';
import StatusSwitcher from '@/components/modules/StatusSwitcher';

export interface ToolPassportModalProps {
  asset?: ScannedAssetDetails | any | null;
  assetTag?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAssetUpdated?: (updated: any) => void;
}

function formatEventTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('he-IL', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function formatSafeDate(d?: string | null): string {
  if (!d) return 'לא תועד';
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? 'לא תועד' : parsed.toLocaleDateString('he-IL');
  } catch {
    return 'לא תועד';
  }
}

function renderTimelineActionBadge(action: AuditActionType) {
  switch (action) {
    case 'CHECKOUT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300">
          <UserCheck className="w-3.5 h-3.5 text-amber-600" />
          <span>הנפקה לעובד</span>
        </span>
      );
    case 'CHECKIN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>החזרה למחסן</span>
        </span>
      );
    case 'TRANSFER':
    case 'TRANSFER_INIT':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-900 border border-indigo-300">
          <Truck className="w-3.5 h-3.5 text-indigo-600" />
          <span>שינוע בין אתרים</span>
        </span>
      );
    case 'TRANSFER_RECEIVE':
    case 'RECEIVE_TRANSFER':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-300">
          <Truck className="w-3.5 h-3.5 text-blue-600" />
          <span>קליטה משינוע</span>
        </span>
      );
    case 'CANCEL_TRANSFER':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-900 border border-rose-300">
          <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
          <span>ביטול שינוע והחזרה</span>
        </span>
      );
    case 'DIRECT_TRANSFER':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-sky-50 text-sky-900 border border-sky-300">
          <Truck className="w-3.5 h-3.5 text-sky-600" />
          <span>העברה ישירה (מנהל תפעול)</span>
        </span>
      );
    case 'MAINTENANCE':
    case 'MAINTENANCE_FLAG':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-50 text-rose-900 border border-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>בתיקון / בדיקה</span>
        </span>
      );
    case 'STATUS_CHANGE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-900 border border-amber-300">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>עדכון סטטוס כלי</span>
        </span>
      );
    case 'SAFETY_INSPECTION':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-50 text-teal-900 border border-teal-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
          <span>בדיקת בטיחות תקופתית</span>
        </span>
      );
    case 'LOCK_STATUS':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-orange-50 text-orange-900 border border-orange-300">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
          <span>נעילה מנהלית</span>
        </span>
      );
    case 'RETIRE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-neutral-100 text-neutral-800 border border-neutral-300">
          <AlertTriangle className="w-3.5 h-3.5 text-neutral-600" />
          <span>השבתה / גריטה</span>
        </span>
      );
    case 'ONBOARD':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-50 text-purple-900 border border-purple-300">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>רישום ראשוני</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-300">
          <span>{action}</span>
        </span>
      );
  }
}

/**
 * Inner component safely rendering modal contents when asset and isOpen are valid.
 */
function ToolPassportModalContent({
  asset,
  assetTag,
  onClose,
  onAssetUpdated,
}: ToolPassportModalProps & { asset: any }) {
  const { role, user, openPinModal, currentOrganization, isAdmin } = useAuth();
  const { isWriting: isNfcWriting, writeNfcTag } = useWebNfc();
  const [nfcWriteStatus, setNfcWriteStatus] = useState<string | null>(null);

  // Active Tab: 'timeline' or 'management'
  const [activeTab, setActiveTab] = useState<'timeline' | 'management'>('timeline');

  // Timeline and Loading State
  const [timeline, setTimeline] = useState<AuditHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Selected Signature Preview Modal
  const [inspectSignatureRecord, setInspectSignatureRecord] = useState<AuditHistoryRecord | null>(null);

  // Tag copied indicator
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Optimistic updates state
  const [updatedAsset, setUpdatedAsset] = useState<any | null>(null);

  // Lockout Form State
  const [showLockInput, setShowLockInput] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>('');
  const [isLockSubmitting, setIsLockSubmitting] = useState<boolean>(false);

  // Safety Renewal State
  const [isRenewSubmitting, setIsRenewSubmitting] = useState<boolean>(false);

  // Reservation Form State
  const [showReserveForm, setShowReserveForm] = useState<boolean>(false);
  const [resProjectName, setResProjectName] = useState<string>('');
  const [resDate, setResDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [resReservedBy, setResReservedBy] = useState<string>(user?.fullName || '');
  const [isReserveSubmitting, setIsReserveSubmitting] = useState<boolean>(false);

  // Notification feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Safe field extraction with bulletproof fallbacks so it NEVER throws a TypeError
  const currentAsset = updatedAsset || asset || null;
  const assetId = currentAsset?.id || currentAsset?.asset_id || asset?.id || asset?.asset_id || '';
  const tagNumber =
    currentAsset?.tag_number ||
    currentAsset?.tagNumber ||
    currentAsset?.serial_number ||
    currentAsset?.qrCode ||
    asset?.tag_number ||
    asset?.tagNumber ||
    asset?.serial_number ||
    asset?.qrCode ||
    assetTag ||
    '';
  const assetTitle =
    currentAsset?.name ||
    currentAsset?.toolName ||
    currentAsset?.model ||
    currentAsset?.asset_name ||
    asset?.name ||
    asset?.toolName ||
    asset?.model ||
    asset?.asset_name ||
    'כלי עבודה';
  const assetBrand = currentAsset?.brand || asset?.brand || 'MAGMA';
  const modelNumber =
    currentAsset?.modelNumber ||
    currentAsset?.model_number ||
    currentAsset?.model ||
    asset?.modelNumber ||
    asset?.model_number ||
    asset?.model ||
    null;

  // Timeline loading useEffect with bulletproof null safety and try/catch
  useEffect(() => {
    let isMounted = true;
    async function fetchTimeline() {
      if (!assetId && !tagNumber) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await getAssetTimelineAction(assetId, tagNumber, currentOrganization?.id);
        if (isMounted && res && res.success && Array.isArray(res.data)) {
          setTimeline(res.data);
          if (res.asset && !updatedAsset) {
            setUpdatedAsset(res.asset);
          }
        } else if (isMounted) {
          setTimeline([]);
        }
      } catch (err) {
        console.error('Timeline error:', err);
        if (isMounted) setTimeline([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchTimeline();
    return () => {
      isMounted = false;
    };
  }, [assetId, tagNumber, currentOrganization?.id]);

  // Refresh timeline helper
  const refreshTimeline = async () => {
    if (!assetId && !tagNumber) return;
    try {
      const res = await getAssetTimelineAction(assetId, tagNumber, currentOrganization?.id);
      if (res && res.success && Array.isArray(res.data)) {
        setTimeline(res.data);
      }
    } catch (err) {
      console.error('Error refreshing timeline:', err);
    }
  };

  const isSupervisorOrAdmin = role === 'supervisor' || role === 'admin';

  // Warranty status calculation
  let warrantyBadge = { label: 'ללא מידע', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (currentAsset?.warrantyUntil) {
    try {
      const wDate = new Date(currentAsset.warrantyUntil);
      const now = new Date();
      const diffDays = Math.ceil((wDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (!isNaN(diffDays)) {
        if (diffDays > 0) {
          warrantyBadge = {
            label: `בתוקף (עוד ${diffDays} ימים)`,
            color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          };
        } else {
          warrantyBadge = {
            label: `פג תוקף (לפני ${Math.abs(diffDays)} ימים)`,
            color: 'bg-rose-50 text-rose-800 border-rose-300',
          };
        }
      }
    } catch {
      // Fallback default
    }
  }

  // Safety inspection status
  let isInspectionOverdue = false;
  let inspectionBadge = { label: 'לא הוגדרה בדיקה', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (currentAsset?.safetyInspectionDue) {
    try {
      const sDate = new Date(currentAsset.safetyInspectionDue);
      const now = new Date();
      if (!isNaN(sDate.getTime())) {
        isInspectionOverdue = sDate.getTime() < now.getTime();
        if (isInspectionOverdue) {
          inspectionBadge = {
            label: `⚠️ נדרשת בדיקת בטיחות מיידית (פג ב-${sDate.toLocaleDateString('he-IL')})`,
            color: 'bg-red-50 text-red-900 border-red-300 font-black',
          };
        } else {
          inspectionBadge = {
            label: `בתוקף עד ${sDate.toLocaleDateString('he-IL')}`,
            color: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
          };
        }
      }
    } catch {
      // Fallback default
    }
  }

  const handleCopyTag = () => {
    const code = tagNumber || currentAsset?.qrCode;
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (err) {
      console.warn('Could not copy to clipboard:', err);
    }
  };

  // Handle Toggle Lockout
  const handleToggleLock = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }
    const targetId = assetId || currentAsset?.id;
    if (!targetId) return;

    if (!currentAsset?.isLocked && !showLockInput) {
      setShowLockInput(true);
      return;
    }

    setIsLockSubmitting(true);
    setFeedbackMessage(null);

    const newLockState = !currentAsset?.isLocked;
    try {
      const res = await toggleAssetLockAction(
        targetId,
        newLockState,
        newLockState ? lockReason.trim() || 'נעילה מנהלתית יזומה' : undefined
      );

      setIsLockSubmitting(false);

      if (res.success) {
        setUpdatedAsset(res.asset);
        setShowLockInput(false);
        setLockReason('');
        setFeedbackMessage({ text: res.message, type: 'success' });
        if (onAssetUpdated && res.asset) onAssetUpdated(res.asset);
        void refreshTimeline();
      } else {
        setFeedbackMessage({ text: res.error, type: 'error' });
      }
    } catch (err) {
      setIsLockSubmitting(false);
      setFeedbackMessage({ text: 'שגיאה בעדכון נעילת הכלי', type: 'error' });
    }
  };

  // Handle Safety Inspection Renewal
  const handleRenewInspection = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }
    const targetId = assetId || currentAsset?.id;
    if (!targetId) return;

    setIsRenewSubmitting(true);
    setFeedbackMessage(null);

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const newInspectionDate = nextYear.toISOString();

    try {
      const res = await renewSafetyInspectionAction(
        targetId,
        newInspectionDate,
        user?.fullName || 'מנהל מערכת'
      );

      setIsRenewSubmitting(false);

      if (res.success) {
        setUpdatedAsset(res.asset);
        setFeedbackMessage({ text: res.message, type: 'success' });
        if (onAssetUpdated && res.asset) onAssetUpdated(res.asset);
        void refreshTimeline();
      } else {
        setFeedbackMessage({ text: res.error, type: 'error' });
      }
    } catch (err) {
      setIsRenewSubmitting(false);
      setFeedbackMessage({ text: 'שגיאה בעדכון בדיקת הבטיחות', type: 'error' });
    }
  };

  // Handle Save Reservation
  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }
    const targetId = assetId || currentAsset?.id;
    if (!targetId) return;

    if (!resProjectName.trim()) {
      setFeedbackMessage({ text: 'נא להזין שם פרויקט או אתר', type: 'error' });
      return;
    }

    setIsReserveSubmitting(true);
    setFeedbackMessage(null);

    try {
      const res = await reserveAssetAction(targetId, {
        projectName: resProjectName.trim(),
        reservedForDate: new Date(resDate).toISOString(),
        reservedBy: resReservedBy.trim() || user?.fullName || 'מנהל מערכת',
      });

      setIsReserveSubmitting(false);

      if (res.success) {
        setUpdatedAsset(res.asset);
        setShowReserveForm(false);
        setFeedbackMessage({ text: res.message, type: 'success' });
        if (onAssetUpdated && res.asset) onAssetUpdated(res.asset);
        void refreshTimeline();
      } else {
        setFeedbackMessage({ text: res.error, type: 'error' });
      }
    } catch (err) {
      setIsReserveSubmitting(false);
      setFeedbackMessage({ text: 'שגיאה בשמירת שריון', type: 'error' });
    }
  };

  // Handle Cancel Reservation
  const handleCancelReservation = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }
    const targetId = assetId || currentAsset?.id;
    if (!targetId) return;

    setIsReserveSubmitting(true);
    setFeedbackMessage(null);

    try {
      const res = await reserveAssetAction(targetId, null);

      setIsReserveSubmitting(false);

      if (res.success) {
        setUpdatedAsset(res.asset);
        setFeedbackMessage({ text: res.message, type: 'success' });
        if (onAssetUpdated && res.asset) onAssetUpdated(res.asset);
        void refreshTimeline();
      } else {
        setFeedbackMessage({ text: res.error, type: 'error' });
      }
    } catch (err) {
      setIsReserveSubmitting(false);
      setFeedbackMessage({ text: 'שגיאה בביטול שריון', type: 'error' });
    }
  };

  // Handle Write NFC Tag
  const handleWriteNfc = async () => {
    const code = tagNumber || currentAsset?.qrCode;
    if (!code) return;
    setNfcWriteStatus('ממתין להצמדת תגית NFC לגב המכשיר...');
    const ok = await writeNfcTag(code, currentOrganization?.slug);
    if (ok) {
      setNfcWriteStatus('תגית ה-NFC נצרבה בהצלחה! תומכת כעת ב-iPhone וב-Android.');
      setTimeout(() => setNfcWriteStatus(null), 4000);
    } else {
      setNfcWriteStatus('שגיאה בצריבת תגית ה-NFC. וודא שהתגית תקינה ונסה שוב.');
    }
  };

  const kpi = React.useMemo(() => {
    const safeList = Array.isArray(timeline) ? timeline : [];
    const totalCheckouts = safeList.filter((r) => r.action === 'CHECKOUT').length;
    const sitesVisitedSet = new Set(
      safeList.map((r) => r.warehouseName || r.warehouseId).filter(Boolean)
    );
    if (currentAsset?.warehouseName) sitesVisitedSet.add(currentAsset.warehouseName);
    const totalSitesVisited = Math.max(1, sitesVisitedSet.size);

    const totalRepairs = safeList.filter(
      (r) => r.action === 'MAINTENANCE_FLAG' || r.action === 'MAINTENANCE' || r.condition === 'needs_repair'
    ).length;

    const startDateStr =
      currentAsset?.purchaseDate ||
      (safeList.length > 0 ? safeList[safeList.length - 1]?.createdAt : null);

    let totalDaysInService = 1;
    if (startDateStr) {
      try {
        const startMs = new Date(startDateStr).getTime();
        const nowMs = Date.now();
        if (!isNaN(startMs) && nowMs > startMs) {
          totalDaysInService = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)));
        }
      } catch {
        totalDaysInService = 1;
      }
    }

    return {
      totalCheckouts,
      totalSitesVisited,
      totalRepairs,
      totalDaysInService,
    };
  }, [timeline, currentAsset]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-passport-title"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-white border-2 border-indigo-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200 text-slate-900">
        {/* MODAL HEADER WITH ASSET IDENTITY */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-5 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור דרכון כלי"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
              תיק כלי מלא &bull; דרכון דיגיטלי והיסטוריית חיים
            </span>

            {isSupervisorOrAdmin && assetId ? (
              <StatusSwitcher
                assetId={assetId}
                currentStatus={currentAsset?.status || 'available'}
                variant="dropdown"
                onStatusChanged={(newSt) => {
                  const updated = { ...currentAsset, status: newSt };
                  setUpdatedAsset(updated);
                  if (onAssetUpdated) onAssetUpdated(updated);
                  void refreshTimeline();
                }}
              />
            ) : (
              <>
                {currentAsset?.status === 'available' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    זמין במחסן
                  </span>
                )}
                {currentAsset?.status === 'checked_out' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 animate-pulse">
                    מנופק לעובד בשטח
                  </span>
                )}
                {currentAsset?.status === 'in_transit' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    🚚 בשינוע בין אתרים
                  </span>
                )}
                {currentAsset?.status === 'maintenance' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30">
                    🔧 במעבדה / תיקון
                  </span>
                )}
                {currentAsset?.status === 'retired' && (
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-400/30">
                    🗑️ מושבת / גריטה
                  </span>
                )}
              </>
            )}
            {currentAsset?.isLocked && (
              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-red-600 text-white border border-red-400">
                נעול מנהלתית 🔒
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="tool-passport-title" className="text-xl font-black text-white leading-tight">
                {assetTitle}
              </h2>

              <div className="flex flex-wrap items-center gap-2.5 mt-2 text-xs text-slate-300">
                <span className="font-bold text-white uppercase">{assetBrand}</span>
                {modelNumber && (
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded border border-white/20" dir="ltr">
                    דגם: {modelNumber}
                  </span>
                )}

                {/* Tag number with copy button */}
                {tagNumber && (
                  <button
                    type="button"
                    onClick={handleCopyTag}
                    className="inline-flex items-center gap-1 font-mono text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded border border-amber-300/30 transition-all cursor-pointer"
                    title="לחץ להעתקת מספר תג"
                    dir="ltr"
                  >
                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-bold">{tagNumber}</span>
                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-amber-400" />}
                  </button>
                )}
              </div>
            </div>

            {/* Print Action in Header */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.print();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer shrink-0"
              title="הדפסת תעודת היסטוריה מלאה (PDF)"
            >
              <Printer className="w-4 h-4 text-purple-300" />
              <span>הדפסת תעודה (PDF)</span>
            </button>
          </div>

          {/* Current Location & Worker Strip */}
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>מחסן / אתר נוכחי:</span>
              <strong className="text-white">
                {currentAsset?.warehouseName || currentAsset?.warehouse_name || 'מחסן ראשי'}
              </strong>
            </div>

            {currentAsset?.currentAssignedWorker && (
              <div className="flex items-center gap-1.5 text-amber-200">
                <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>מוחזק ע&quot;י עובד:</span>
                <strong className="text-white">{currentAsset.currentAssignedWorker}</strong>
              </div>
            )}
          </div>
        </div>

        {/* KPI SUMMARY CHIPS BAR */}
        <div className="bg-slate-50 p-3.5 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-amber-600" />
              <span>סה&quot;כ ניפוקים</span>
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {kpi.totalCheckouts}
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-blue-600" />
              <span>אתרים שביקר</span>
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {kpi.totalSitesVisited}
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              <span>קריאות תיקון</span>
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {kpi.totalRepairs}
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-600" />
              <span>ימי שירות פעיל</span>
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {kpi.totalDaysInService} ימים
            </div>
          </div>
        </div>

        {/* TABS HEADER */}
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar py-1 gap-2 border-b border-slate-200 bg-white px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`shrink-0 whitespace-nowrap py-3 px-4 text-xs font-black border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'timeline'
                ? 'border-indigo-600 text-indigo-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HistoryIcon className="w-4 h-4" />
            <span>יומן תנועות ומסלול חיים</span>
            {timeline && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-mono">
                {timeline.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('management')}
            className={`shrink-0 whitespace-nowrap py-3 px-4 text-xs font-black border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'management'
                ? 'border-indigo-600 text-indigo-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>מפרט, בטיחות וניהול כלי</span>
          </button>
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : 'bg-red-50 text-red-900 border-b border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}

        {/* SCROLLABLE TAB CONTENT */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                טוען היסטוריה כרונולוגית מיומן הביקורת...
              </div>
            </div>
          ) : activeTab === 'timeline' ? (
            /* TAB 1: CHRONOLOGICAL TIMELINE NODES */
            <div className="space-y-4">
              {!isLoading && timeline.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  אין תנועות נוספות מתועדות ביומן הביקורת לכלי זה
                </div>
              ) : (
                <div className="relative border-r-2 border-indigo-200 mr-4 pr-5 space-y-6">
                  {timeline.map((evt, idx) => (
                    <div key={evt.id || idx} className="relative group">
                      {/* Timeline Node Bullet */}
                      <div className="absolute -right-[27px] top-1 w-4 h-4 rounded-full bg-white border-4 border-indigo-600 shadow-sm" />

                      {/* Event Card */}
                      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-indigo-300 transition-colors space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {renderTimelineActionBadge(evt.action)}
                            <span className="text-[11px] font-mono text-slate-500 font-bold">
                              {formatEventTimestamp(evt.createdAt)}
                            </span>
                          </div>

                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{evt.warehouseName}</span>
                          </span>
                        </div>

                        {/* Custody Worker & Details */}
                        {evt.targetWorker && (
                          <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 text-xs flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-amber-950">
                              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                              <span>מקבל הציוד: {evt.targetWorker}</span>
                            </div>
                            {evt.workerPhone && (
                              <span className="text-[11px] font-mono text-slate-600" dir="ltr">
                                {evt.workerPhone}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Notes if present */}
                        {evt.notes && (
                          <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 font-medium space-y-1">
                            <div className="flex items-center gap-1.5 font-black text-amber-900 text-[11px]">
                              <FileText className="w-3.5 h-3.5 text-amber-700" />
                              <span>הערת תנועה / מסירה:</span>
                            </div>
                            <p className="text-xs font-bold leading-relaxed whitespace-pre-wrap italic">
                              &ldquo;{evt.notes}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Footer info: Performed By and Digital Signature Button */}
                        <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-100 text-slate-500">
                          <div>
                            בוצע ע&quot;י: <strong className="text-slate-700">{evt.performedBy}</strong>
                          </div>

                          {evt.signatureData && (
                            <button
                              type="button"
                              onClick={() => setInspectSignatureRecord(evt)}
                              className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 font-bold transition-colors cursor-pointer"
                            >
                              <FileSignature className="w-3 h-3 text-indigo-600" />
                              <span>הצג חתימה דיגיטלית</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: SPECS, SAFETY, LOCKOUT & RESERVATION */
            <div className="space-y-4 text-xs">
              {/* NFC TAG BINDING */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Radio className={`w-4 h-4 ${isNfcWriting ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <div className="text-xs font-black text-blue-950 flex items-center gap-2">
                      <span>תגית NFC אוניברסלית (iPhone & Android)</span>
                      {currentAsset?.nfcUid && (
                        <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200" dir="ltr">
                          UID: {currentAsset.nfcUid}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      צריבת תגית NDEF URL לפתיחה ישירה בהצמדה
                    </div>
                  </div>
                </div>

                {isSupervisorOrAdmin && (
                  <button
                    type="button"
                    onClick={handleWriteNfc}
                    disabled={isNfcWriting}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
                  >
                    {isNfcWriting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>קרב תגית...</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-3.5 h-3.5" />
                        <span>צרוב תגית NFC</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {nfcWriteStatus && (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-900 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{nfcWriteStatus}</span>
                </div>
              )}

              {/* PROCUREMENT, ORDER & SUPPLY LOCATION */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2 text-blue-950 font-black text-xs uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>נתוני רכש ואספקה (מספר הזמנה ומיקום)</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-blue-200 shadow-2xs">
                    <span className="text-slate-500 font-bold block mb-0.5">מספר הזמנה (PO):</span>
                    <span className="text-sm font-mono font-black text-blue-950" dir="ltr">
                      {currentAsset?.poNumber || currentAsset?.po_number || currentAsset?.orderNumber || 'לא צוין'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-blue-200 shadow-2xs">
                    <span className="text-slate-500 font-bold block mb-0.5">מיקום הסיפוק:</span>
                    <span className="text-sm font-bold text-slate-900">
                      {currentAsset?.supplyLocation || currentAsset?.supply_location || 'לא צוין'}
                    </span>
                  </div>
                </div>
              </div>

              {/* FINANCIAL & WARRANTY */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase tracking-wider">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>נתונים כספיים ואחריות יצרן</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {isAdmin && (currentAsset?.purchase_cost || currentAsset?.purchaseCost) ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <span className="text-xs text-slate-400">עלות רכישה</span>
                      <div className="text-base font-bold text-slate-100">
                        ₪ {Number(currentAsset.purchase_cost || currentAsset.purchaseCost).toLocaleString()}
                      </div>
                    </div>
                  ) : null}

                  <div className={`p-2.5 rounded-xl bg-white border border-slate-200 ${!isAdmin || !(currentAsset?.purchase_cost || currentAsset?.purchaseCost) ? 'col-span-2' : ''}`}>
                    <span className="text-slate-500 font-bold block mb-0.5">תאריך רכישה:</span>
                    <span className="text-sm font-bold text-slate-900">
                      {formatSafeDate(currentAsset?.purchaseDate)}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-500 font-bold text-xs block">תוקף אחריות:</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatSafeDate(currentAsset?.warrantyUntil)}
                    </span>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${warrantyBadge.color}`}>
                    {warrantyBadge.label}
                  </span>
                </div>
              </div>

              {/* PERIODIC SAFETY INSPECTION */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-950 font-black text-xs uppercase tracking-wider">
                    {isInspectionOverdue ? (
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    )}
                    <span>אישור בטיחות תקופתי</span>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border ${inspectionBadge.color}`}>
                    {inspectionBadge.label}
                  </span>
                </div>

                {isSupervisorOrAdmin && (
                  <button
                    type="button"
                    onClick={handleRenewInspection}
                    disabled={isRenewSubmitting}
                    className="w-full min-h-[40px] rounded-xl bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isRenewSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                        <span>חידוש בדיקת בטיחות (12 חודשים)</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* ADMINISTRATIVE LOCKOUT TOGGLE */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase tracking-wider">
                    {currentAsset?.isLocked ? (
                      <Lock className="w-4 h-4 text-red-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-slate-500" />
                    )}
                    <span>נעילה מנהלתית ובקרת שימוש</span>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      currentAsset?.isLocked
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {currentAsset?.isLocked ? 'נעול' : 'פעיל'}
                  </span>
                </div>

                {showLockInput && !currentAsset?.isLocked && (
                  <div className="p-3 bg-white rounded-xl border border-red-200 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      סיבת נעילה:
                    </label>
                    <input
                      type="text"
                      value={lockReason}
                      onChange={(e) => setLockReason(e.target.value)}
                      placeholder="לדוגמה: בדיקת תקינות מגן גיצים לקויה"
                      className="w-full text-xs font-medium p-2 rounded-lg border border-slate-300 focus:border-red-600 focus:outline-none"
                    />
                  </div>
                )}

                {isSupervisorOrAdmin && (
                  <button
                    type="button"
                    onClick={handleToggleLock}
                    disabled={isLockSubmitting}
                    className={`w-full min-h-[40px] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60 ${
                      currentAsset?.isLocked
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-red-50 hover:bg-red-100 text-red-800 border border-red-300'
                    }`}
                  >
                    {isLockSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : currentAsset?.isLocked ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>שחרר כלי לשימוש</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>{showLockInput ? 'אשר נעילת כלי' : 'נעל כלי לניפוק'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* PROJECT RESERVATION WIDGET */}
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
                    <BookmarkCheck className="w-4 h-4 text-amber-600" />
                    <span>שריון מראש לפרויקט</span>
                  </div>
                  {currentAsset?.reservation ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                      משוריין
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-500">
                      פנוי לשריון
                    </span>
                  )}
                </div>

                {currentAsset?.reservation ? (
                  <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-bold">פרויקט / אתר:</span>
                      <span className="font-black text-slate-900">{currentAsset.reservation.projectName}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-bold">תאריך יעד:</span>
                      <span className="font-bold text-blue-900">
                        {formatSafeDate(currentAsset.reservation.reservedForDate)}
                      </span>
                    </div>
                    {isSupervisorOrAdmin && (
                      <button
                        type="button"
                        onClick={handleCancelReservation}
                        disabled={isReserveSubmitting}
                        className="w-full mt-2 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all cursor-pointer"
                      >
                        {isReserveSubmitting ? 'מעדכן...' : 'בטל שריון זה'}
                      </button>
                    )}
                  </div>
                ) : showReserveForm ? (
                  <form onSubmit={handleSaveReservation} className="p-3 bg-white rounded-xl border border-amber-200 space-y-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        שם הפרויקט או האתר:
                      </label>
                      <input
                        type="text"
                        required
                        value={resProjectName}
                        onChange={(e) => setResProjectName(e.target.value)}
                        placeholder="לדוגמה: מגדלי מתחם הבורסה"
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">לתאריך:</label>
                        <input
                          type="date"
                          required
                          value={resDate}
                          onChange={(e) => setResDate(e.target.value)}
                          className="w-full text-xs p-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">משוריין ע&quot;י:</label>
                        <input
                          type="text"
                          required
                          value={resReservedBy}
                          onChange={(e) => setResReservedBy(e.target.value)}
                          className="w-full text-xs p-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isReserveSubmitting}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer disabled:opacity-60"
                      >
                        {isReserveSubmitting ? 'שומר...' : 'אשר שריון'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReserveForm(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
                      >
                        ביטול
                      </button>
                    </div>
                  </form>
                ) : isSupervisorOrAdmin ? (
                  <button
                    type="button"
                    onClick={() => setShowReserveForm(true)}
                    className="w-full py-2 rounded-xl bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    + שריין כלי זה לפרויקט
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.print();
            }}
            className="py-2 px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            <span>הדפס תעודת היסטוריה (PDF)</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            סגור דרכון
          </button>
        </div>
      </div>

      {/* SIGNATURE INSPECTION POPUP */}
      {inspectSignatureRecord && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 border border-indigo-200 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <FileSignature className="w-4 h-4 text-indigo-600" />
                <span>חתימת עובד מאומתת</span>
              </span>
              <button
                type="button"
                onClick={() => setInspectSignatureRecord(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full h-32 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center p-2 overflow-hidden">
              {inspectSignatureRecord.signatureData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inspectSignatureRecord.signatureData}
                  alt="חתימה דיגיטלית"
                  className="max-h-full max-w-full object-contain filter contrast-125"
                />
              ) : (
                <span className="text-xs text-slate-400">אין חתימה זמינה</span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 space-y-1">
              <div>עובד: <strong>{inspectSignatureRecord.targetWorker || inspectSignatureRecord.performedBy}</strong></div>
              <div>תאריך: <strong>{formatEventTimestamp(inspectSignatureRecord.createdAt)}</strong></div>
            </div>

            <button
              type="button"
              onClick={() => setInspectSignatureRecord(null)}
              className="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ToolPassportModal component with bulletproof null safety:
 * If !asset or isOpen === false, return null immediately.
 */
export default function ToolPassportModal({
  asset,
  assetTag,
  isOpen,
  onClose,
  onAssetUpdated,
}: ToolPassportModalProps) {
  // If asset is null/undefined and no tag is provided, or modal is closed, return null
  const resolvedAsset =
    asset ||
    (assetTag
      ? {
          id: '',
          qrCode: assetTag,
          tag_number: assetTag,
          name: 'כלי עבודה',
          toolName: 'כלי עבודה',
          brand: 'MAGMA',
        }
      : null);

  if (!resolvedAsset || isOpen === false) {
    return null;
  }

  return (
    <ToolPassportModalContent
      asset={resolvedAsset}
      assetTag={assetTag}
      isOpen={isOpen}
      onClose={onClose}
      onAssetUpdated={onAssetUpdated}
    />
  );
}

export { ToolPassportModal };
