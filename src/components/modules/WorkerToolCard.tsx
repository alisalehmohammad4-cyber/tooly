'use client';

import React, { useState } from 'react';
import {
  Wrench,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Building2,
  QrCode,
  Lock,
  X,
  Loader2,
  Scan,
  Send,
} from 'lucide-react';
import type { ScannedAssetDetails } from '@/app/actions/custody';
import { reportAssetDamageAction } from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';
import {
  enqueueSyncAction,
  updateCachedAsset,
  cacheAsset,
} from '@/lib/offline/offlineDb';

interface WorkerToolCardProps {
  asset: ScannedAssetDetails;
  onClose: () => void;
  onDamageReported?: (updatedAsset: ScannedAssetDetails) => void;
}

export default function WorkerToolCard({
  asset,
  onClose,
  onDamageReported,
}: WorkerToolCardProps) {
  const { user } = useAuth();

  // Safety Checklist interactive state
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
  });

  // Damage reporting state
  const [isReportingDamage, setIsReportingDamage] = useState(false);
  const [damageIssueType, setDamageIssueType] = useState('שבר פיזי');
  const [damageNotes, setDamageNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const isAvailable = asset.status === 'available';
  const isCheckedOut = asset.status === 'checked_out';
  const isMaintenance = asset.status === 'maintenance';

  // Safety inspection status
  const isInspectionOverdue = Boolean(
    asset.safetyInspectionDue &&
      new Date(asset.safetyInspectionDue).getTime() < new Date().getTime()
  );

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setReportError(null);

    const damagePayload = {
      assetId: asset.id,
      reportedBy: user?.fullName || 'עובד שטח',
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
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([100, 50, 100]); } catch {}
      }
      setIsSubmitting(false);
      setReportSuccessMessage('הדיווח נשמר במכשיר במצב לא מקוון ויסונכרן אוטומטית כשהחיבור לרשת יחזור.');
      if (onDamageReported) {
        onDamageReported(updated || { ...asset, status: 'maintenance', condition: 'needs_repair' });
      }
      return;
    }

    try {
      const res = await reportAssetDamageAction(damagePayload);

      setIsSubmitting(false);

      if (!res.success) {
        setReportError(res.error || 'שגיאה בשליחת הדיווח');
        return;
      }

      if (res.asset) await cacheAsset(res.asset);
      setReportSuccessMessage('הדיווח נשלח בהצלחה למחסנאי והכלי הועבר לבדיקה ותיקון.');
      if (onDamageReported && res.asset) {
        onDamageReported(res.asset);
      }
    } catch {
      await enqueueSyncAction('damage_report', damagePayload);
      const updated = await updateCachedAsset(asset.id, {
        status: 'maintenance',
        condition: 'needs_repair',
      });
      setIsSubmitting(false);
      setReportSuccessMessage('הדיווח נשמר במכשיר במצב לא מקוון ויסונכרן אוטומטית כשהחיבור לרשת יחזור.');
      if (onDamageReported) {
        onDamageReported(updated || { ...asset, status: 'maintenance', condition: 'needs_repair' });
      }
    }
  };

  const safetyItems = [
    'בדיקת שלמות מעטפת המכשיר, בידוד תקין וידית אחיזה יציבה',
    'בדיקת תקינות כבל החשמל / סוללה ומגעים נקיים ללא שברים',
    'בדיקת תקינות מגני שבבים, מפסקי הגנה ולחצן הפעלה',
    'חבישת ציוד מגן אישי חובה: משקפי מגן, כפפות עבודה ומגני אוזניים',
  ];

  return (
    <div className="w-full max-w-lg mx-auto p-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="bg-white rounded-3xl border-2 border-blue-200 shadow-xl overflow-hidden">
        {/* TOP BANNER */}
        <div className="bg-gradient-to-l from-blue-50 via-slate-50 to-amber-50/50 p-5 border-b border-blue-100 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור כרטיס וחזור לסריקה"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center transition-colors shadow-sm cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-blue-600 text-white shadow-sm">
              {asset.brand}
            </span>
            <div className="flex items-center gap-1 text-xs font-mono font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded-lg border border-slate-200" dir="ltr">
              <QrCode className="w-3.5 h-3.5 text-blue-600" />
              <span>{asset.qrCode}</span>
            </div>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
              כרטיס כלי שטח
            </span>
          </div>

          <h2 className="text-xl font-black text-blue-950 leading-tight pr-1">
            {asset.toolName}
          </h2>

          {asset.modelNumber && (
            <div className="text-xs font-mono text-slate-500 mt-1 font-semibold" dir="ltr">
              דגם: {asset.modelNumber}
            </div>
          )}

          {/* Critical lock / overdue warnings */}
          {(asset.isLocked || isInspectionOverdue) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {asset.isLocked && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-100 text-red-900 border border-red-300 text-xs font-black">
                  <Lock className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>כלי נעול מנהלתית לשימוש: {asset.lockReason || 'נעול להוצאה'}</span>
                </div>
              )}
              {isInspectionOverdue && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>פג תוקף בדיקת בטיחות תקופתית! חל איסור שימוש</span>
                </div>
              )}
            </div>
          )}

          {/* Location and status info */}
          <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-700">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate max-w-[180px]">{asset.warehouseName}</span>
            </div>

            <div>
              {isAvailable && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-black">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  זמין לשימוש
                </span>
              )}
              {isCheckedOut && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 font-black">
                  בשימוש: {asset.currentAssignedWorker}
                </span>
              )}
              {isMaintenance && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-900 border border-red-300 font-black">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  בטיפול / תקול
                </span>
              )}
            </div>
          </div>
        </div>

        {/* BODY CONTENT */}
        <div className="p-5 space-y-5">
          {/* 1. SAFETY CHECKLIST */}
          <div className="rounded-2xl bg-amber-50/60 border-2 border-amber-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                <span>צ&apos;ק-ליסט בטיחות לעובד לפני הפעלה</span>
              </div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded">
                חובה בשטח
              </span>
            </div>

            <div className="space-y-2">
              {safetyItems.map((item, idx) => (
                <label
                  key={idx}
                  onClick={() => toggleCheck(idx)}
                  className="flex items-start gap-2.5 p-2 rounded-xl bg-white/90 border border-amber-200/80 cursor-pointer hover:bg-white transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checkedItems[idx])}
                    onChange={() => {}}
                    className="mt-0.5 w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-800 font-medium leading-relaxed">
                    {item}
                  </span>
                </label>
              ))}
            </div>

            {asset.safetyInspectionDue && (
              <div className="text-[11px] text-slate-600 pt-1 font-semibold flex items-center justify-between">
                <span>תוקף בדיקת בטיחות תקופתית:</span>
                <span className={`font-bold ${isInspectionOverdue ? 'text-red-700' : 'text-emerald-700'}`}>
                  {new Date(asset.safetyInspectionDue).toLocaleDateString('he-IL')}
                </span>
              </div>
            )}
          </div>

          {/* 2. DAMAGE REPORT SECTION OR EXPANDED FORM */}
          {reportSuccessMessage ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 text-sm font-bold flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <div className="font-black">דיווח התקלה נשלח בהצלחה!</div>
                <div className="text-xs text-emerald-800 mt-0.5">{reportSuccessMessage}</div>
              </div>
            </div>
          ) : isReportingDamage ? (
            <form onSubmit={handleReportSubmit} className="p-4 rounded-2xl bg-rose-50/70 border-2 border-rose-300 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-950 font-black text-sm">
                  <Wrench className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>דיווח על תקלה בכלי</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReportingDamage(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                >
                  ביטול
                </button>
              </div>

              {reportError && (
                <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-red-800 text-xs font-bold">
                  {reportError}
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  מה סוג התקלה?
                </label>
                <select
                  value={damageIssueType}
                  onChange={(e) => setDamageIssueType(e.target.value)}
                  className="w-full min-h-[46px] bg-white text-slate-950 text-sm px-3 rounded-xl border border-slate-300 font-bold focus:border-rose-600 focus:outline-none"
                >
                  <option value="שבר פיזי">שבר פיזי / מעטפת שבורה</option>
                  <option value="מנוע שרוף">מנוע שרוף / ריח עשן / התחממות חריגה</option>
                  <option value="כבל חשמל פגום">כבל חשמל גלוי / סוללה לא נטענת</option>
                  <option value="מתג הפעלה תקול">מתג הפעלה תקוע / הדק שבור</option>
                  <option value="בלאי רצועה / להב">בלאי רצועה / להב שחוקה / חלק חסר</option>
                  <option value="אחר">תקלה אחרת</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  פירוט התקלה (אופציונלי)
                </label>
                <textarea
                  rows={3}
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="פרט מה קרה ומתי הורגשה התקלה..."
                  className="w-full bg-white text-slate-900 text-sm p-3 rounded-xl border border-slate-300 font-medium focus:border-rose-600 focus:outline-none placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[50px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-red-600/30 cursor-pointer active:scale-98 transition-all disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>שולח דיווח למחסנאי...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>שלח דיווח תקלה מיידי</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* PROMINENT RED BUTTON: דיווח על תקלה */
            <button
              type="button"
              onClick={() => setIsReportingDamage(true)}
              className="w-full min-h-[54px] rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 active:scale-[0.98] text-white font-black text-base flex items-center justify-center gap-2.5 shadow-lg shadow-red-600/30 cursor-pointer transition-all border border-red-700"
            >
              <Wrench className="w-5 h-5 text-white" />
              <span>דיווח על תקלה</span>
            </button>
          )}

          {/* 3. RETURN TO SCANNER BUTTON */}
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-300"
          >
            <Scan className="w-4 h-4 text-blue-600" />
            <span>סרוק כלי נוסף</span>
          </button>
        </div>
      </div>
    </div>
  );
}
