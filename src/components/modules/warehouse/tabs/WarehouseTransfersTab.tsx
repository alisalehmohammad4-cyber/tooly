'use client';

import React from 'react';
import {
  Send,
  Plus,
  ArrowLeftRight,
  FileSignature,
  Truck,
  CheckCircle2,
  RefreshCw,
  Loader2,
  QrCode,
  Building2,
  Clock,
  ShieldCheck,
  RotateCcw,
  Inbox,
  Flame,
  Zap,
  FileText,
  X,
  Check,
  PackageCheck,
  ClipboardCheck,
} from 'lucide-react';
import type {
  InTransitFleetItem,
  PendingTransferItem,
  SiteToolRequestItem,
  AvailableTransferAssetItem,
} from '../types';

export interface WarehouseTransfersTabProps {
  isChiefOperations: boolean;
  isGeneralManager: boolean;
  isStorekeeper: boolean;
  onOpenSiteRequestModal: () => void;
  onOpenTransferRequestModal: () => void;
  onOpenDispatchModal: () => void;
  // In-Transit Fleet
  inTransitFleet: InTransitFleetItem[];
  isLoadingInTransit: boolean;
  onRefreshInTransitFleet: () => Promise<void> | void;
  operatingFleetAssetId: string | null;
  fleetOperationType: 'receive' | 'cancel' | null;
  onConfirmArrivalFleet: (item: InTransitFleetItem) => Promise<void> | void;
  onCancelTransferFleet: (item: InTransitFleetItem) => Promise<void> | void;
  // Incoming In-Transit Transfers
  incomingTransfers: PendingTransferItem[];
  receivingTransferId: string | null;
  onCompleteReception: (req: PendingTransferItem) => Promise<void> | void;
  // Chief Requisitions Inbox
  siteRequestsInbox: SiteToolRequestItem[];
  isLoadingInbox: boolean;
  inboxFeedback: { text: string; type: 'success' | 'error' } | null;
  setInboxFeedback: (fb: { text: string; type: 'success' | 'error' } | null) => void;
  availableAssetsForInbox: AvailableTransferAssetItem[];
  selectedAssetForRequest: Record<string, string>;
  setSelectedAssetForRequest: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rejectingSiteRequestId: string | null;
  setRejectingSiteRequestId: (id: string | null) => void;
  rejectReasonInput: string;
  setRejectReasonInput: (val: string) => void;
  isResolvingRequestId: string | null;
  onResolveSiteRequest: (requestId: string, decision: 'APPROVE' | 'REJECT') => Promise<void> | void;
  // Pending Inter-site Transfers
  pendingTransfers: PendingTransferItem[];
  isLoadingTransfers: boolean;
  transferApprovalFeedback: { text: string; type: 'success' | 'error' } | null;
  setTransferApprovalFeedback: (fb: { text: string; type: 'success' | 'error' } | null) => void;
  rejectingTransferId: string | null;
  setRejectingTransferId: (id: string | null) => void;
  rejectionReasonInput: string;
  setRejectionReasonInput: (val: string) => void;
  decidingTransferId: string | null;
  onApproveTransfer: (requestId: string) => Promise<void> | void;
  onRejectTransfer: (requestId: string) => Promise<void> | void;
  onRefreshPendingTransfers?: () => Promise<void> | void;
  // Site Storekeeper Shipments & Requests
  siteIncomingShipments: SiteToolRequestItem[];
  receivingSiteRequestId: string | null;
  siteActionFeedback: { text: string; type: 'success' | 'error' } | null;
  setSiteActionFeedback: (fb: { text: string; type: 'success' | 'error' } | null) => void;
  onConfirmSiteReception: (req: SiteToolRequestItem) => Promise<void> | void;
  mySiteRequests: SiteToolRequestItem[];
  isLoadingSiteData: boolean;
  onRefreshSiteData?: () => Promise<void> | void;
  // Tool Passport
  onOpenPassport?: (qrCode: string, fallbackItem?: unknown) => void;
}

export default function WarehouseTransfersTab({
  isChiefOperations,
  isGeneralManager,
  isStorekeeper,
  onOpenSiteRequestModal,
  onOpenTransferRequestModal,
  onOpenDispatchModal,
  inTransitFleet,
  isLoadingInTransit,
  onRefreshInTransitFleet,
  operatingFleetAssetId,
  fleetOperationType,
  onConfirmArrivalFleet,
  onCancelTransferFleet,
  incomingTransfers,
  receivingTransferId,
  onCompleteReception,
  siteRequestsInbox,
  isLoadingInbox,
  inboxFeedback,
  setInboxFeedback,
  availableAssetsForInbox,
  selectedAssetForRequest,
  setSelectedAssetForRequest,
  rejectingSiteRequestId,
  setRejectingSiteRequestId,
  rejectReasonInput,
  setRejectReasonInput,
  isResolvingRequestId,
  onResolveSiteRequest,
  pendingTransfers,
  isLoadingTransfers,
  transferApprovalFeedback,
  setTransferApprovalFeedback,
  rejectingTransferId,
  setRejectingTransferId,
  rejectionReasonInput,
  setRejectionReasonInput,
  decidingTransferId,
  onApproveTransfer,
  onRejectTransfer,
  onRefreshPendingTransfers,
  siteIncomingShipments,
  receivingSiteRequestId,
  siteActionFeedback,
  setSiteActionFeedback,
  onConfirmSiteReception,
  mySiteRequests,
  isLoadingSiteData,
  onRefreshSiteData,
  onOpenPassport,
}: WarehouseTransfersTabProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* SITE STOREKEEPER: REQUEST TOOL FOR SITE BANNER */}
      {!isChiefOperations && !isGeneralManager && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-blue-700/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/50 text-blue-200 flex items-center justify-center border border-blue-400/30 shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>בקשת ציוד לאתר (מכולת שטח)</span>
                <span className="text-[10px] font-bold bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                  דרישה מבצעית ישירה
                </span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                חסר כלי עבודה באתר? הגש דרישה מנומקת ישירות לאחראי תפעול ראשי לצורך אספקה וניוד מיידי
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSiteRequestModal}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>בקשת ציוד לאתר</span>
          </button>
        </div>
      )}

      {/* INTER-SITE EQUIPMENT TRANSFER REQUEST (Strictly Site Storekeepers Only) */}
      {isStorekeeper && !isChiefOperations && !isGeneralManager && (
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
            onClick={onOpenTransferRequestModal}
            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>בקשת העברת ציוד בין אתרים</span>
          </button>
        </div>
      )}

      {/* SITE EQUIPMENT DISPATCH WITH TAG VERIFICATION & DIGITAL SIGNATURE */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-700/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/50 text-emerald-200 flex items-center justify-center border border-emerald-400/30 shrink-0">
            <FileSignature className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span>הוצאת ציוד לאתר (אישור תיוג וחתימה)</span>
              <span className="text-[10px] font-bold bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30">
                אישור תיוג &bull; חתימה חיה
              </span>
            </h3>
            <p className="text-xs text-emerald-200 mt-0.5">
              נוהל שחרור ציוד לאתרי בנייה: אימות תג QR פיזי על הכלי והחתמה דיגיטלית של מקבל הציוד בשטח
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDispatchModal}
          className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <FileSignature className="w-4 h-4" />
          <span>הוצאת ציוד לאתר (אישור תיוג וחתימה)</span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
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
                  <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 font-medium space-y-0.5">
                    <div className="flex items-center gap-1 font-bold text-amber-900 text-[10px]">
                      <Truck className="w-3 h-3 text-amber-600" />
                      <span>🚚 הערת שינוע / סיבת העברה:</span>
                    </div>
                    <p className="text-xs font-bold italic leading-relaxed whitespace-pre-wrap">
                      &ldquo;{req.reason}&rdquo;
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    הוגש ע&quot;י {req.requestedBy}
                  </span>
                  <button
                    type="button"
                    disabled={receivingTransferId === req.id}
                    onClick={() => onCompleteReception(req)}
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

      {/* CHIEF STOREKEEPER: IN-TRANSIT FLEET TRACKER (מעקב שינוע וציוד בדרך) */}
      <div className="bg-white border-2 border-sky-200/90 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100/70 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>מעקב שינוע וציוד בדרך</span>
                <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">
                  (In-Transit Fleet Logistics)
                </span>
                {inTransitFleet.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-sky-600 text-white animate-pulse">
                    {inTransitFleet.length} בשינוע פעיל
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ניטור ציוד בתנועה בין מתקנים ומחסני שטח &bull; מעקב זמני שינוע, אתרי יעד ואחראי ניוד
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => void onRefreshInTransitFleet()}
              disabled={isLoadingInTransit}
              className="px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-50 text-sky-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInTransit ? 'animate-spin' : ''}`} />
              <span>רענן נתוני שינוע</span>
            </button>
          </div>
        </div>

        {isLoadingInTransit && inTransitFleet.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
            <span>טוען נתוני שינוע ציוד...</span>
          </div>
        ) : inTransitFleet.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>כל הכלים נמצאים כרגע במחסנים ובאתרי העבודה &bull; אין ציוד בתנועה בין מתקנים</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
            {inTransitFleet.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-gradient-to-br from-white to-sky-50/30 border-2 border-sky-200 shadow-sm flex flex-col justify-between gap-3.5 hover:border-sky-400 transition-all"
              >
                <div className="space-y-3">
                  {/* Top Bar: Tool Tag, Model, and Delivery Status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenPassport?.(item.qrCode, item)}
                          className="font-mono text-xs font-black text-indigo-900 bg-white hover:bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-slate-300 hover:border-indigo-400 transition-colors cursor-pointer group flex items-center gap-1 shadow-2xs"
                          title={`לחץ לפתיחת תיק כלי מלא עבור ${item.qrCode}`}
                          dir="ltr"
                        >
                          <QrCode className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform" />
                          <span className="underline decoration-indigo-300">{item.qrCode}</span>
                        </button>
                        {item.serialNumber && (
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            מס&quot;ד: {item.serialNumber}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-black text-slate-900 mt-1">
                        {item.toolName}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {item.brand} {item.modelNumber ? `• דגם: ${item.modelNumber}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500 text-white text-xs font-black shadow-xs shrink-0 animate-pulse">
                      <Truck className="w-3.5 h-3.5" />
                      <span>🚚 בשינוע לשטח</span>
                    </div>
                  </div>

                  {/* Origin Warehouse (מקור) ➔ Destination Site (יעד) */}
                  <div className="p-3 rounded-xl bg-white border border-sky-100 flex items-center justify-between text-xs shadow-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold">מקור (מחסן שולח)</div>
                        <div className="font-black text-slate-900">{item.originWarehouseName}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center px-2">
                      <ArrowLeftRight className="w-4 h-4 text-sky-600" />
                    </div>

                    <div className="flex items-center gap-2 text-sky-950 text-right">
                      <div>
                        <div className="text-[10px] text-sky-600 font-bold">יעד (אתר מקבל)</div>
                        <div className="font-black text-sky-900">{item.destinationWarehouseName}</div>
                      </div>
                      <Building2 className="w-4 h-4 text-sky-500 shrink-0" />
                    </div>
                  </div>

                  {/* Transporter Notes if present */}
                  {item.transporterNotes && (
                    <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200/80 text-xs text-sky-950 font-medium space-y-0.5">
                      <div className="flex items-center gap-1 font-bold text-sky-900 text-[10px]">
                        <Truck className="w-3 h-3 text-sky-600" />
                        <span>🚚 הערת שינוע / מוביל:</span>
                      </div>
                      <p className="text-xs font-bold italic leading-relaxed whitespace-pre-wrap">
                        &ldquo;{item.transporterNotes}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Transit Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold">משך שינוע / יציאה</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-sky-600" />
                        <span>{item.elapsedTransitTimeText}</span>
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold">אחראי ניוד / מנפק</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                        <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{item.dispatchedBy}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Operational Action Buttons */}
                <div className="pt-3 border-t border-sky-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={operatingFleetAssetId === item.assetId}
                    onClick={() => void onConfirmArrivalFleet(item)}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    title="אשר הגעה וקליטה של הכלי במחסן היעד"
                  >
                    {operatingFleetAssetId === item.assetId && fleetOperationType === 'receive' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>קולט כלי...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>אשר הגעה וקליטה</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={operatingFleetAssetId === item.assetId}
                    onClick={() => void onCancelTransferFleet(item)}
                    className="py-2 px-3 rounded-xl border border-rose-300 hover:bg-rose-50 hover:border-rose-400 active:scale-95 disabled:opacity-50 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title="ביטול שינוע והחזרה של הכלי למחסן המקור"
                  >
                    {operatingFleetAssetId === item.assetId && fleetOperationType === 'cancel' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>מבטל שינוע...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>ביטול שינוע והחזרה</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CHIEF STOREKEEPER: FIELD REQUISITIONS INBOX (תיבת בקשות ציוד מהאתרים) */}
      {(isChiefOperations || isGeneralManager) && (
        <div className="bg-white border-2 border-indigo-300/80 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100/70 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>תיבת בקשות ציוד מהאתרים</span>
                  <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">
                    (Field Requisitions)
                  </span>
                  {siteRequestsInbox.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white animate-pulse">
                      {siteRequestsInbox.length} ממתינות
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  דרישות כלי עבודה שהוגשו ע&quot;י מחסנאי אתרים ומכולות שטח &bull; שיוך כלי זמין ואישור ניוד
                </p>
              </div>
            </div>

            {isLoadingInbox && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
          </div>

          {inboxFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                inboxFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <span>{inboxFeedback.text}</span>
              <button
                type="button"
                onClick={() => setInboxFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {siteRequestsInbox.length === 0 ? (
            <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>אין כרגע בקשות ציוד ממתינות מהאתרים &bull; כל הדרישות טופלו במלואן</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
              {siteRequestsInbox.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-2xl bg-gradient-to-br from-white to-indigo-50/20 border-2 border-indigo-200 shadow-sm flex flex-col justify-between gap-3.5 hover:border-indigo-400 transition-all"
                >
                  <div className="space-y-2.5">
                    {/* Top Bar: Warehouse Name + Urgency Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-black text-indigo-950 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200">
                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>אתר מכולה: <strong>{req.requestingWarehouseName}</strong></span>
                      </div>

                      {req.urgency === 'CRITICAL' ? (
                        <span className="text-[11px] font-black text-white bg-rose-600 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs animate-pulse">
                          <Flame className="w-3 pupil" />
                          <span>קריטי - עצירת עבודה</span>
                        </span>
                      ) : req.urgency === 'URGENT' ? (
                        <span className="text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-600" />
                          <span>דחוף למחר</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                          רגיל (שוטף)
                        </span>
                      )}
                    </div>

                    {/* Tool description & quantity */}
                    <div>
                      <h4 className="text-base font-black text-slate-900 leading-snug">
                        {req.toolDescription}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span>כמות מבוקשת: <strong className="text-slate-900 font-mono text-sm">{req.quantity}</strong></span>
                        <span>&bull;</span>
                        <span>הוגש ע&quot;י: <strong className="text-slate-700">{req.requestedBy}</strong></span>
                        <span>&bull;</span>
                        <span dir="ltr">{new Date(req.createdAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Reason */}
                    {req.reason && (
                      <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 font-medium space-y-1">
                        <div className="flex items-center gap-1.5 font-black text-indigo-900 text-[11px]">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          <span>סיבת דרישה / הערת שטח:</span>
                        </div>
                        <p className="italic text-xs font-bold leading-relaxed whitespace-pre-wrap">
                          &ldquo;{req.reason}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* FULFILLMENT CONTROLS */}
                  <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                    {rejectingSiteRequestId === req.id ? (
                      <div className="space-y-2 animate-in fade-in duration-150">
                        <input
                          type="text"
                          autoFocus
                          value={rejectReasonInput}
                          onChange={(e) => setRejectReasonInput(e.target.value)}
                          placeholder="סיבת הדחייה (למשל: לא קיים במלאי / יש להזמין רכש)..."
                          className="w-full bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-rose-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingSiteRequestId(null);
                              setRejectReasonInput('');
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            ביטול
                          </button>
                          <button
                            type="button"
                            disabled={isResolvingRequestId === req.id}
                            onClick={() => onResolveSiteRequest(req.id, 'REJECT')}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                          >
                            {isResolvingRequestId === req.id ? 'מעדכן...' : 'אשר דחייה'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                            <span>בחר כלי עבודה זמין לניוד לאתר:</span>
                            <span className="text-[10px] text-slate-400 font-normal">מציג כלים במחסנים מרכזיים</span>
                          </label>
                          <select
                            value={selectedAssetForRequest[req.id] || ''}
                            onChange={(e) =>
                              setSelectedAssetForRequest((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="">-- בחר כלי עבודה זמין ממתקן אחר --</option>
                            {availableAssetsForInbox.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.brand} {a.modelNumber || ''}) • {a.qrCode} {a.tagNumber ? `[${a.tagNumber}]` : ''} — במחסן {a.currentWarehouseName}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isResolvingRequestId === req.id}
                            onClick={() => {
                              setRejectingSiteRequestId(req.id);
                              setRejectReasonInput('');
                            }}
                            className="py-1.5 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>דחה בקשה</span>
                          </button>

                          <button
                            type="button"
                            disabled={isResolvingRequestId === req.id || !selectedAssetForRequest[req.id]}
                            onClick={() => onResolveSiteRequest(req.id, 'APPROVE')}
                            className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                          >
                            {isResolvingRequestId === req.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>מאשר...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>אשר ניוד לאתר</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PENDING INTER-SITE TRANSFER REQUESTS (Chief Operations / Operations Manager Approval) */}
      {(isChiefOperations || isGeneralManager) && (
        <div className="bg-white border-2 border-indigo-200 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>בקשות העברה ממתינות לאישור</span>
                  {pendingTransfers.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {pendingTransfers.length} ממתינות
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  אישור ניוד כלי עבודה בין אתרי ומחסני הארגון &bull; הרשאת אחראי תפעול ראשי
                </p>
              </div>
            </div>

            {isLoadingTransfers && (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            )}
          </div>

          {transferApprovalFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                transferApprovalFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <span>{transferApprovalFeedback.text}</span>
              <button
                type="button"
                onClick={() => setTransferApprovalFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {pendingTransfers.length === 0 ? (
            <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>אין כרגע בקשות העברה ממתינות לאישור</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[500px] overflow-y-auto pr-1">
              {pendingTransfers.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 border-2 border-indigo-100/80 shadow-xs flex flex-col justify-between gap-3 hover:border-indigo-300 transition-all"
                >
                  <div>
                    {/* Tool Info & Tags */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenPassport?.(req.qrCode, req)}
                            className="font-mono text-[11px] font-black text-indigo-900 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded border border-slate-200 hover:border-indigo-400 transition-colors cursor-pointer group flex items-center gap-1 shadow-2xs"
                            title={`לחץ לפתיחת תיק כלי מלא עבור ${req.qrCode}`}
                            dir="ltr"
                          >
                            <QrCode className="w-3 h-3 text-indigo-600 group-hover:scale-110 transition-transform" />
                            <span className="underline decoration-indigo-300">{req.qrCode}</span>
                          </button>
                          {req.tagNumber && (
                            <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200" dir="ltr">
                              {req.tagNumber}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-black text-slate-900 mt-1">
                          {req.assetName}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {req.assetBrand} {req.assetModel ? `• ${req.assetModel}` : ''} {req.serialNumber ? `(מס"ד: ${req.serialNumber})` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                        ממתין לאישור
                      </span>
                    </div>

                    {/* Route: Source -> Target */}
                    <div className="mt-3 p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>ממחסן: <strong className="text-slate-900">{req.sourceWarehouseName}</strong></span>
                      </div>
                      <ArrowLeftRight className="w-4 h-4 text-indigo-500 shrink-0 mx-2" />
                      <div className="flex items-center gap-1.5 text-indigo-900">
                        <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>ליעד: <strong>{req.targetWarehouseName}</strong></span>
                      </div>
                    </div>

                    {/* Reason / Requester */}
                    <div className="mt-2 text-xs space-y-1">
                      <div className="text-slate-500">
                        הוגש ע&quot;י: <strong className="text-slate-700">{req.requestedBy}</strong> בתאריך {new Date(req.createdAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {req.reason && (
                        <div className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100 text-indigo-950 font-medium italic text-[11px]">
                          &quot;{req.reason}&quot;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-slate-200/80">
                    {rejectingTransferId === req.id ? (
                      <div className="space-y-2 animate-in fade-in duration-150">
                        <input
                          type="text"
                          autoFocus
                          value={rejectionReasonInput}
                          onChange={(e) => setRejectionReasonInput(e.target.value)}
                          placeholder="סיבת הדחייה (למשל: הכלי מיועד לפרויקט אחר)..."
                          className="w-full bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-rose-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingTransferId(null);
                              setRejectionReasonInput('');
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            ביטול
                          </button>
                          <button
                            type="button"
                            disabled={decidingTransferId === req.id}
                            onClick={() => onRejectTransfer(req.id)}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                          >
                            {decidingTransferId === req.id ? 'מעדכן...' : 'אשר דחייה'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={decidingTransferId === req.id}
                          onClick={() => {
                            setRejectingTransferId(req.id);
                            setRejectionReasonInput('');
                          }}
                          className="py-1.5 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>דחייה</span>
                        </button>

                        <button
                          type="button"
                          disabled={decidingTransferId === req.id}
                          onClick={() => onApproveTransfer(req.id)}
                          className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          {decidingTransferId === req.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>מאשר...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>אישור העברה</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SITE STOREKEEPER: INCOMING IN-TRANSIT TOOLS TO THIS SITE */}
      {!isChiefOperations && !isGeneralManager && siteIncomingShipments.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950 font-black">
              <Truck className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-black">
                ציוד בדרך לאתר (במשלוח / In-Transit) ({siteIncomingShipments.length})
              </h3>
            </div>
            <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
              ממתין לקליטה ואישור הגעה
            </span>
          </div>

          {siteActionFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                siteActionFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <span>{siteActionFeedback.text}</span>
              <button
                type="button"
                onClick={() => setSiteActionFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[500px] overflow-y-auto pr-1">
            {siteIncomingShipments.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl bg-white border border-amber-300/80 shadow-xs flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {req.assignedAssetQr && (
                          <span className="font-mono text-[11px] font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" dir="ltr">
                            {req.assignedAssetQr}
                          </span>
                        )}
                        {req.assignedAssetTag && (
                          <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" dir="ltr">
                            {req.assignedAssetTag}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-black text-slate-900 mt-1">
                        {req.assignedAssetName || req.toolDescription}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {req.assignedAssetBrand} {req.assignedAssetModel ? `• ${req.assignedAssetModel}` : ''} {req.assignedAssetSerial ? `(מס"ד: ${req.assignedAssetSerial})` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                      במשלוח לאתר
                    </span>
                  </div>

                  <div className="mt-2.5 p-2 rounded-lg bg-amber-50/50 border border-amber-200/60 text-xs space-y-1">
                    <div className="text-slate-700">
                      נשלח מ: <strong className="text-slate-900">{req.sourceWarehouseName || 'מחסן מרכזי'}</strong>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      אושר ע&quot;י: <strong>{req.decidedBy || 'אחראי תפעול'}</strong> &bull; {req.decidedAt ? new Date(req.decidedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={receivingSiteRequestId === req.id}
                    onClick={() => onConfirmSiteReception(req)}
                    className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    {receivingSiteRequestId === req.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>קולט כלי...</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck className="w-4 h-4" />
                        <span>קליטה ואישור הגעה באתר</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SITE STOREKEEPER: MY REQUESTS STATUS TRACKER */}
      {!isChiefOperations && !isGeneralManager && mySiteRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-indigo-600" />
                <span>סטטוס בקשות שנשלחו מהאתר ({mySiteRequests.length})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                מעקב אחר דרישות ציוד שהוגשו לאחראי תפעול ראשי
              </p>
            </div>

            {isLoadingSiteData && (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mySiteRequests.slice(0, 6).map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between gap-2"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500" dir="ltr">
                      {new Date(req.createdAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                    </span>
                    {req.status === 'PENDING' ? (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        🟡 בטיפול
                      </span>
                    ) : req.status === 'IN_TRANSIT' ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                        🟢 אושר ובדרך
                      </span>
                    ) : req.status === 'REJECTED' ? (
                      <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        🔴 נדחה
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
                        ⚪ נקלט באתר
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-black text-slate-900 leading-snug">
                    {req.toolDescription}
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    כמות: <strong className="text-slate-800">{req.quantity}</strong>
                    {req.urgency === 'CRITICAL' && (
                      <span className="text-rose-600 font-bold mr-2">&bull; קריטי</span>
                    )}
                    {req.urgency === 'URGENT' && (
                      <span className="text-amber-600 font-bold mr-2">&bull; דחוף</span>
                    )}
                  </div>

                  {req.rejectionReason && (
                    <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[10px]">
                      סיבת דחייה: {req.rejectionReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
