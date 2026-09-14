'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import {
  toggleAssetLockAction,
  renewSafetyInspectionAction,
  reserveAssetAction,
} from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';
import { useWebNfc } from '@/lib/nfc/useWebNfc';

interface ToolPassportModalProps {
  asset: ScannedAssetDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onAssetUpdated?: (updated: ScannedAssetDetails) => void;
}

export default function ToolPassportModal({
  asset,
  isOpen,
  onClose,
  onAssetUpdated,
}: ToolPassportModalProps) {
  const { role, user, openPinModal } = useAuth();
  const { isWriting: isNfcWriting, writeNfcTag } = useWebNfc();
  const [nfcWriteStatus, setNfcWriteStatus] = useState<string | null>(null);

  // Optimistic updates state (React-compliant without useEffect setState)
  const [updatedAsset, setUpdatedAsset] = useState<ScannedAssetDetails | null>(null);
  const [prevAssetProp, setPrevAssetProp] = useState<ScannedAssetDetails | null>(asset);

  if (asset !== prevAssetProp) {
    setPrevAssetProp(asset);
    setUpdatedAsset(null);
  }

  const currentAsset = updatedAsset ?? asset;

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

  // Notification / error feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  if (!isOpen || !currentAsset) return null;

  const isSupervisorOrAdmin = role === 'supervisor' || role === 'admin';

  // Warranty status calculation
  let warrantyBadge = { label: 'ללא מידע', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (currentAsset.warrantyUntil) {
    const wDate = new Date(currentAsset.warrantyUntil);
    const now = new Date();
    const diffDays = Math.ceil((wDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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

  // Safety inspection status
  let isInspectionOverdue = false;
  let inspectionBadge = { label: 'לא הוגדרה בדיקה', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (currentAsset.safetyInspectionDue) {
    const sDate = new Date(currentAsset.safetyInspectionDue);
    const now = new Date();
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

  // Handle Toggle Lockout
  const handleToggleLock = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }

    if (!currentAsset.isLocked && !showLockInput) {
      setShowLockInput(true);
      return;
    }

    setIsLockSubmitting(true);
    setFeedbackMessage(null);

    const newLockState = !currentAsset.isLocked;
    const res = await toggleAssetLockAction(
      currentAsset.id,
      newLockState,
      newLockState ? lockReason.trim() || 'נעילה מנהלתית יזומה' : undefined
    );

    setIsLockSubmitting(false);

    if (res.success) {
      setUpdatedAsset(res.asset);
      setShowLockInput(false);
      setLockReason('');
      setFeedbackMessage({ text: res.message, type: 'success' });
      if (onAssetUpdated) onAssetUpdated(res.asset);
    } else {
      setFeedbackMessage({ text: res.error, type: 'error' });
    }
  };

  // Handle Safety Inspection Renewal (Adds 12 months)
  const handleRenewInspection = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }

    setIsRenewSubmitting(true);
    setFeedbackMessage(null);

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const newInspectionDate = nextYear.toISOString();

    const res = await renewSafetyInspectionAction(
      currentAsset.id,
      newInspectionDate,
      user.fullName
    );

    setIsRenewSubmitting(false);

    if (res.success) {
      setUpdatedAsset(res.asset);
      setFeedbackMessage({ text: res.message, type: 'success' });
      if (onAssetUpdated) onAssetUpdated(res.asset);
    } else {
      setFeedbackMessage({ text: res.error, type: 'error' });
    }
  };

  // Handle Save Reservation
  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }

    if (!resProjectName.trim()) {
      setFeedbackMessage({ text: 'נא להזין שם פרויקט או אתר', type: 'error' });
      return;
    }

    setIsReserveSubmitting(true);
    setFeedbackMessage(null);

    const res = await reserveAssetAction(
      currentAsset.id,
      {
        projectName: resProjectName.trim(),
        reservedForDate: new Date(resDate).toISOString(),
        reservedBy: resReservedBy.trim() || user.fullName,
      }
    );

    setIsReserveSubmitting(false);

    if (res.success) {
      setUpdatedAsset(res.asset);
      setShowReserveForm(false);
      setFeedbackMessage({ text: res.message, type: 'success' });
      if (onAssetUpdated) onAssetUpdated(res.asset);
    } else {
      setFeedbackMessage({ text: res.error, type: 'error' });
    }
  };

  // Handle Cancel Reservation
  const handleCancelReservation = async () => {
    if (!isSupervisorOrAdmin) {
      openPinModal();
      return;
    }

    setIsReserveSubmitting(true);
    setFeedbackMessage(null);

    const res = await reserveAssetAction(
      currentAsset.id,
      null
    );

    setIsReserveSubmitting(false);

    if (res.success) {
      setUpdatedAsset(res.asset);
      setFeedbackMessage({ text: res.message, type: 'success' });
      if (onAssetUpdated) onAssetUpdated(res.asset);
    } else {
      setFeedbackMessage({ text: res.error, type: 'error' });
    }
  };

  // Handle Write NFC Tag
  const handleWriteNfc = async () => {
    if (!currentAsset) return;
    setNfcWriteStatus('ממתין להצמדת תגית NFC לגב המכשיר...');
    const ok = await writeNfcTag(currentAsset.qrCode);
    if (ok) {
      setNfcWriteStatus('תגית ה-NFC נצרבה בהצלחה! תומכת כעת ב-iPhone וב-Android.');
      setTimeout(() => setNfcWriteStatus(null), 4000);
    } else {
      setNfcWriteStatus('שגיאה בצריבת תגית ה-NFC. וודא שהתגית תקינה ונסה שוב.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-passport-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg bg-white border-2 border-blue-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200 text-blue-950">
        {/* TOP HEADER */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 p-4 text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור דרכון כלי"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/40">
              כרטיס מכשיר מורחב &bull; דרכון כלי דיגיטלי
            </span>
          </div>

          <h2 id="tool-passport-title" className="text-xl font-black text-white leading-tight pl-8">
            {currentAsset.toolName}
          </h2>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-blue-200">
            <span className="font-bold">{currentAsset.brand}</span>
            {currentAsset.modelNumber ? (
              <span className="font-mono bg-blue-950/40 px-2 py-0.5 rounded border border-blue-700/50" dir="ltr">
                מספר סידורי / דגם: {currentAsset.modelNumber}
              </span>
            ) : (
              <span className="font-mono bg-blue-950/40 px-2 py-0.5 rounded border border-blue-700/50" dir="ltr">
                מספר סידורי: {currentAsset.qrCode}
              </span>
            )}
            <div className="flex items-center gap-1 font-mono text-amber-300" dir="ltr">
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold">{currentAsset.qrCode}</span>
            </div>
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 ${
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

        {/* SCROLLABLE BODY */}
        <div className="p-4 pb-14 sm:pb-8 overflow-y-auto overscroll-contain flex-1 space-y-4 text-sm">
          {/* NFC TAG BINDING & PROGRAMMING */}
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Radio className={`w-4 h-4 ${isNfcWriting ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <div className="text-xs font-black text-blue-950 flex items-center gap-2">
                  <span>תגית NFC אוניברסלית (iPhone & Android)</span>
                  {currentAsset.nfcUid && (
                    <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200" dir="ltr">
                      UID: {currentAsset.nfcUid}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  צריבת תגית NDEF URL לפתיחה ישירה בהצמדה ברקע
                </div>
              </div>
            </div>

            {isSupervisorOrAdmin && (
              <button
                type="button"
                onClick={handleWriteNfc}
                disabled={isNfcWriting}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
              >
                {isNfcWriting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>קרב מדבקת NFC...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5" />
                    <span>📡 צרוב תגית NFC לכלי זה</span>
                  </>
                )}
              </button>
            )}
          </div>
          {nfcWriteStatus && (
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{nfcWriteStatus}</span>
            </div>
          )}

          {/* ADMINISTRATIVE LOCKOUT BANNER */}
          {currentAsset.isLocked && (
            <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-900 font-black text-xs uppercase tracking-wider">
                  <Lock className="w-4 h-4 text-red-600 shrink-0" />
                  <span>כלי נעול מנהלתית (הניפוק חסום)</span>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-200 text-red-900">
                  LOCKED
                </span>
              </div>
              <p className="text-xs text-red-800 font-medium">
                {currentAsset.lockReason || 'כלי זה הוגדר כלא כשיר לניפוק מסיבות בטיחותיות או מנהלתיות.'}
              </p>
            </div>
          )}

          {/* 1. FINANCIAL & WARRANTY SECTION */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-blue-900 font-black text-xs uppercase tracking-wider">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>נתונים כספיים ואחריות יצרן</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500 font-bold block mb-0.5">עלות רכישה:</span>
                <span className="text-base font-black text-slate-900">
                  {currentAsset.purchaseCost ? `₪${currentAsset.purchaseCost.toLocaleString()}` : 'לא תועד'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <span className="text-slate-500 font-bold block mb-0.5">תאריך רכישה:</span>
                <span className="text-sm font-bold text-slate-900">
                  {currentAsset.purchaseDate
                    ? new Date(currentAsset.purchaseDate).toLocaleDateString('he-IL')
                    : 'לא תועד'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
              <div>
                <span className="text-slate-500 font-bold text-xs block">תוקף אחריות:</span>
                <span className="text-xs font-semibold text-slate-800">
                  {currentAsset.warrantyUntil
                    ? new Date(currentAsset.warrantyUntil).toLocaleDateString('he-IL')
                    : 'ללא תאריך'}
                </span>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${warrantyBadge.color}`}>
                {warrantyBadge.label}
              </span>
            </div>
          </div>

          {/* 2. PERIODIC SAFETY CERTIFICATION */}
          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-950 font-black text-xs uppercase tracking-wider">
                {isInspectionOverdue ? (
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                )}
                <span>אישור בטיחות תקופתי</span>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-full border ${inspectionBadge.color}`}>
                {inspectionBadge.label}
              </span>
            </div>

            {isInspectionOverdue && (
              <div className="p-2.5 rounded-xl bg-red-100/80 border border-red-300 text-xs text-red-900 font-medium">
                תוקף בדיקת הבטיחות פג! על פי נוהלי העבודה, חל איסור מוחלט לנפק כלי זה לעובד עד לביצוע בדיקה תקופתית ואישורה.
              </div>
            )}

            {isSupervisorOrAdmin && (
              <button
                type="button"
                onClick={handleRenewInspection}
                disabled={isRenewSubmitting}
                className="w-full min-h-[44px] rounded-xl bg-white hover:bg-blue-50 text-blue-800 border-2 border-blue-300 text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-60"
              >
                {isRenewSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                    <span>חידוש בדיקת בטיחות</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* 3. ADMINISTRATIVE SAFETY LOCKOUT TOGGLE */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase tracking-wider">
                {currentAsset.isLocked ? (
                  <Lock className="w-4 h-4 text-red-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-slate-500" />
                )}
                <span>נעילה מנהלתית ובקרת שימוש</span>
              </div>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  currentAsset.isLocked
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentAsset.isLocked ? 'נעול' : 'פעיל'}
              </span>
            </div>

            {showLockInput && !currentAsset.isLocked && (
              <div className="p-3 bg-white rounded-xl border border-red-200 space-y-2 animate-in fade-in">
                <label className="block text-xs font-bold text-slate-700">
                  נא לציין סיבת נעילה (תקלה, בדיקת מהנדס, חריגה):
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

            {isSupervisorOrAdmin ? (
              <button
                type="button"
                onClick={handleToggleLock}
                disabled={isLockSubmitting}
                className={`w-full min-h-[44px] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-60 ${
                  currentAsset.isLocked
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-red-50 hover:bg-red-100 text-red-800 border-2 border-red-300'
                }`}
              >
                {isLockSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : currentAsset.isLocked ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>שחרר כלי לשימוש</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>{showLockInput ? 'אשר נעילת כלי' : 'נעל כלי להוצאה מהמחסן'}</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-[11px] text-slate-500 italic">
                שינוי מצב נעילה מוגבל למנהלי עבודה ומנהלי פרויקט.
              </div>
            )}
          </div>

          {/* 4. PROJECT RESERVATION WIDGET */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
                <BookmarkCheck className="w-4 h-4 text-amber-600" />
                <span>שריון מראש לפרויקט</span>
              </div>
              {currentAsset.reservation ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                  משוריין
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-500">
                  פנוי לשריון
                </span>
              )}
            </div>

            {currentAsset.reservation ? (
              <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">פרויקט / אתר:</span>
                  <span className="font-black text-slate-900">{currentAsset.reservation.projectName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">תאריך יעד:</span>
                  <span className="font-bold text-blue-900">
                    {new Date(currentAsset.reservation.reservedForDate).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">שוריין ע&quot;י:</span>
                  <span className="font-medium text-slate-800">{currentAsset.reservation.reservedBy}</span>
                </div>

                {isSupervisorOrAdmin && (
                  <button
                    type="button"
                    onClick={handleCancelReservation}
                    disabled={isReserveSubmitting}
                    className="w-full mt-2 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all cursor-pointer"
                  >
                    {isReserveSubmitting ? 'מעדכן...' : 'בטל שריון זה'}
                  </button>
                )}
              </div>
            ) : showReserveForm ? (
              <form onSubmit={handleSaveReservation} className="p-3 bg-white rounded-xl border border-amber-200 space-y-2.5 animate-in fade-in">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    שם הפרויקט או האתר:
                  </label>
                  <input
                    type="text"
                    required
                    value={resProjectName}
                    onChange={(e) => setResProjectName(e.target.value)}
                    placeholder="לדוגמה: גשר ההלכה - שלב ב'"
                    className="w-full text-xs font-medium p-2 rounded-lg border border-slate-300 focus:border-amber-600 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      לתאריך:
                    </label>
                    <input
                      type="date"
                      required
                      value={resDate}
                      onChange={(e) => setResDate(e.target.value)}
                      className="w-full text-xs font-medium p-1.5 rounded-lg border border-slate-300 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      משוריין ע&quot;י:
                    </label>
                    <input
                      type="text"
                      required
                      value={resReservedBy}
                      onChange={(e) => setResReservedBy(e.target.value)}
                      className="w-full text-xs font-medium p-1.5 rounded-lg border border-slate-300 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isReserveSubmitting}
                    className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {isReserveSubmitting ? 'שומר שריון...' : 'אשר שריון לפרויקט'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReserveForm(false)}
                    className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            ) : isSupervisorOrAdmin ? (
              <button
                type="button"
                onClick={() => setShowReserveForm(true)}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-300 text-xs font-bold transition-colors cursor-pointer"
              >
                + הזמן מראש לפרויקט
              </button>
            ) : null}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span>מחסן שיוך: <strong>{currentAsset.warehouseName}</strong></span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            סגור דרכון
          </button>
        </div>
      </div>
    </div>
  );
}
