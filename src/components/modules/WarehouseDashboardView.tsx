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
  FileSignature,
  CheckSquare,
  QrCode,
  PenTool,
  ShieldCheck,
  Inbox,
  Send,
  Flame,
  PackageCheck,
  RotateCcw,
  Wrench,
  Trash2,
  Sparkles,
  RefreshCw,
  Camera,
} from 'lucide-react';
import type { StorekeeperOperationsPayload, WarehouseOption } from '@/app/actions/dashboard';
import { getStorekeeperOperations } from '@/app/actions/dashboard';
import AppLayout from '@/components/layout/AppLayout';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import ManualCheckinModal from '@/components/modules/ManualCheckinModal';
import OcrScannerModal from '@/components/modules/OcrScannerModal';
import ChiefNotesFeedView from '@/components/modules/ChiefNotesFeedView';
import SignaturePad from '@/components/ui/SignaturePad';
import { useAuth } from '@/context/AuthContext';
import {
  getAssetDetailsByQr,
  transferAssetAction,
  dispatchAssetWithSignatureAction,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import { reconcileStockAction } from '@/app/actions/warehouses';
import {
  createTransferRequestAction,
  getAvailableAssetsForTransferAction,
  getIncomingInTransitTransfersAction,
  completeTransferReceptionAction,
  getPendingTransfersAction,
  decideTransferRequestAction,
  getLocalAvailableAssetsForTransferAction,
  directStorekeeperTransferAction,
  type AvailableTransferAssetItem,
  type PendingTransferItem,
} from '@/app/actions/transfers';
import {
  createSiteToolRequestAction,
  getSiteStorekeeperDashboardAction,
  getChiefStorekeeperInboxAction,
  resolveToolRequestAction,
  confirmToolReceptionAction,
  type SiteToolRequestItem,
  type SuggestedToolAsset,
} from '@/app/actions/toolRequests';
import {
  getInTransitFleetAction,
  getMaintenanceAssetsAction,
  returnFromMaintenanceAction,
  scrapAndRetireAssetAction,
  type InTransitFleetItem,
  type MaintenanceAssetItem,
} from '@/app/actions/maintenance';

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
  const [passportLookupInput, setPassportLookupInput] = useState<string>('');
  const [isSearchingPassport, setIsSearchingPassport] = useState<boolean>(false);
  const [passportLookupFeedback, setPassportLookupFeedback] = useState<string | null>(null);

  // Equipment Return / Check-in Modal State (Manual Omnisearch + Barcode Scanner)
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState<boolean>(false);
  const [checkinPreselectedAssetId, setCheckinPreselectedAssetId] = useState<string | null>(null);

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

  // Storekeeper: Direct Outbound Equipment Transfer Modal State
  const [isDirectTransferModalOpen, setIsDirectTransferModalOpen] = useState<boolean>(false);
  const [isDirectTransferOcrOpen, setIsDirectTransferOcrOpen] = useState<boolean>(false);
  const [isDispatchOcrOpen, setIsDispatchOcrOpen] = useState<boolean>(false);
  const [isQuickOcrOpen, setIsQuickOcrOpen] = useState<boolean>(false);
  const [localAvailableAssets, setLocalAvailableAssets] = useState<AvailableTransferAssetItem[]>([]);
  const [isLoadingLocalAssets, setIsLoadingLocalAssets] = useState<boolean>(false);
  const [selectedDirectAsset, setSelectedDirectAsset] = useState<AvailableTransferAssetItem | null>(null);
  const [directTargetWarehouseId, setDirectTargetWarehouseId] = useState<string>('');
  const [transporterNotes, setTransporterNotes] = useState<string>('');
  const [directSearchQuery, setDirectSearchQuery] = useState<string>('');
  const [isSubmittingDirectTransfer, setIsSubmittingDirectTransfer] = useState<boolean>(false);
  const [directTransferFeedback, setDirectTransferFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Pending Inter-site Transfer Requests (Chief Operations / Operations Manager Approval)
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransferItem[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState<boolean>(false);
  const [decidingTransferId, setDecidingTransferId] = useState<string | null>(null);
  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [transferApprovalFeedback, setTransferApprovalFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Load pending transfer requests for the organization
  const loadPendingTransfers = React.useCallback(async () => {
    setIsLoadingTransfers(true);
    try {
      const list = await getPendingTransfersAction();
      setPendingTransfers(list);
    } catch (err) {
      console.warn('Error loading pending transfers:', err);
    } finally {
      setIsLoadingTransfers(false);
    }
  }, []);

  React.useEffect(() => {
    if (isChiefOperations || isGeneralManager) {
      void loadPendingTransfers();
    }
  }, [isChiefOperations, isGeneralManager, loadPendingTransfers]);

  const handleApproveTransfer = async (requestId: string) => {
    setDecidingTransferId(requestId);
    setTransferApprovalFeedback(null);
    try {
      const res = await decideTransferRequestAction(requestId, 'APPROVED');
      if (res.success) {
        setTransferApprovalFeedback({
          text: res.message || 'בקשת ההעברה אושרה והכלי עודכן בסטטוס בשינוע (in_transit)',
          type: 'success',
        });
        await loadPendingTransfers();
        await loadIncomingTransfers(selectedWarehouseId);
      } else {
        setTransferApprovalFeedback({
          text: res.error || 'שגיאה באישור העברה',
          type: 'error',
        });
      }
    } catch (err) {
      setTransferApprovalFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setDecidingTransferId(null);
    }
  };

  const handleRejectTransfer = async (requestId: string) => {
    setDecidingTransferId(requestId);
    setTransferApprovalFeedback(null);
    try {
      const res = await decideTransferRequestAction(requestId, 'REJECTED', rejectionReasonInput);
      if (res.success) {
        setTransferApprovalFeedback({
          text: res.message || 'בקשת ההעברה נדחתה',
          type: 'success',
        });
        setRejectingTransferId(null);
        setRejectionReasonInput('');
        await loadPendingTransfers();
      } else {
        setTransferApprovalFeedback({
          text: res.error || 'שגיאה בדחיית העברה',
          type: 'error',
        });
      }
    } catch (err) {
      setTransferApprovalFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setDecidingTransferId(null);
    }
  };

  // =========================================================================
  // TWO-TIER LOGISTICS STATE: Site Storekeeper vs. Chief Operations Manager
  // =========================================================================

  // 1. Chief Storekeeper Inbox State
  const [siteRequestsInbox, setSiteRequestsInbox] = useState<SiteToolRequestItem[]>([]);
  const [availableAssetsForInbox, setAvailableAssetsForInbox] = useState<SuggestedToolAsset[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState<boolean>(false);
  const [selectedAssetForRequest, setSelectedAssetForRequest] = useState<Record<string, string>>({});
  const [isResolvingRequestId, setIsResolvingRequestId] = useState<string | null>(null);
  const [rejectingSiteRequestId, setRejectingSiteRequestId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');
  const [inboxFeedback, setInboxFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 2. Site Storekeeper Dashboard State
  const [siteIncomingShipments, setSiteIncomingShipments] = useState<SiteToolRequestItem[]>([]);
  const [mySiteRequests, setMySiteRequests] = useState<SiteToolRequestItem[]>([]);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState<boolean>(false);
  const [receivingSiteRequestId, setReceivingSiteRequestId] = useState<string | null>(null);
  const [siteActionFeedback, setSiteActionFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 3. Site Tool Request Modal State ("בקשת ציוד לאתר")
  const [isSiteRequestModalOpen, setIsSiteRequestModalOpen] = useState<boolean>(false);
  const [requestToolDesc, setRequestToolDesc] = useState<string>('');
  const [requestQuantity, setRequestQuantity] = useState<number>(1);
  const [requestUrgency, setRequestUrgency] = useState<'NORMAL' | 'URGENT' | 'CRITICAL'>('NORMAL');
  const [requestReason, setRequestReason] = useState<string>('');
  const [isSubmittingSiteRequest, setIsSubmittingSiteRequest] = useState<boolean>(false);
  const [siteRequestFeedback, setSiteRequestFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load Chief Storekeeper Inbox
  const loadChiefInbox = React.useCallback(async () => {
    setIsLoadingInbox(true);
    try {
      const res = await getChiefStorekeeperInboxAction();
      setSiteRequestsInbox(res.pendingRequests);
      setAvailableAssetsForInbox(res.availableAssets);
    } catch (err) {
      console.warn('Error loading chief inbox:', err);
    } finally {
      setIsLoadingInbox(false);
    }
  }, []);

  // Load Site Storekeeper Data
  const loadSiteStorekeeperData = React.useCallback(async (whId: string) => {
    setIsLoadingSiteData(true);
    try {
      const res = await getSiteStorekeeperDashboardAction(whId);
      setSiteIncomingShipments(res.incomingShipments);
      setMySiteRequests(res.myRequests);
    } catch (err) {
      console.warn('Error loading site storekeeper data:', err);
    } finally {
      setIsLoadingSiteData(false);
    }
  }, []);

  // =========================================================================
  // CHIEF OPERATIONS: IN-TRANSIT FLEET & CENTRAL MAINTENANCE
  // =========================================================================
  const [inTransitFleet, setInTransitFleet] = useState<InTransitFleetItem[]>([]);
  const [isLoadingInTransit, setIsLoadingInTransit] = useState<boolean>(false);

  const [maintenanceAssets, setMaintenanceAssets] = useState<MaintenanceAssetItem[]>([]);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState<boolean>(false);

  // Maintenance Return-to-Stock Modal State
  const [repairModalAsset, setRepairModalAsset] = useState<MaintenanceAssetItem | null>(null);
  const [repairCondition, setRepairCondition] = useState<'excellent' | 'good'>('good');
  const [repairReceivingWhId, setRepairReceivingWhId] = useState<string>('');
  const [repairNotes, setRepairNotes] = useState<string>('');
  const [isSubmittingRepair, setIsSubmittingRepair] = useState<boolean>(false);
  const [repairFeedback, setRepairFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Maintenance Scrap & Retire Modal State
  const [retireModalAsset, setRetireModalAsset] = useState<MaintenanceAssetItem | null>(null);
  const [retireReason, setRetireReason] = useState<string>('');
  const [isSubmittingRetire, setIsSubmittingRetire] = useState<boolean>(false);
  const [retireFeedback, setRetireFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadInTransitFleet = React.useCallback(async () => {
    setIsLoadingInTransit(true);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId;
      const list = await getInTransitFleetAction(activeOrgId);
      setInTransitFleet(list);
    } catch (err) {
      console.warn('Error loading in-transit fleet:', err);
    } finally {
      setIsLoadingInTransit(false);
    }
  }, [currentOrganization?.id, user?.organizationId]);

  const loadMaintenanceAssets = React.useCallback(async () => {
    setIsLoadingMaintenance(true);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId;
      const list = await getMaintenanceAssetsAction(activeOrgId);
      setMaintenanceAssets(list);
    } catch (err) {
      console.warn('Error loading maintenance assets:', err);
    } finally {
      setIsLoadingMaintenance(false);
    }
  }, [currentOrganization?.id, user?.organizationId]);

  // Sync data on load and role/warehouse change
  React.useEffect(() => {
    if (isChiefOperations || isGeneralManager) {
      void loadChiefInbox();
      void loadInTransitFleet();
      void loadMaintenanceAssets();
    }
    void loadSiteStorekeeperData(selectedWarehouseId);
  }, [
    isChiefOperations,
    isGeneralManager,
    selectedWarehouseId,
    loadChiefInbox,
    loadSiteStorekeeperData,
    loadInTransitFleet,
    loadMaintenanceAssets,
  ]);

  const handleOpenRepairModal = (asset: MaintenanceAssetItem) => {
    setRepairModalAsset(asset);
    setRepairCondition('good');
    const defaultWh =
      asset.currentWarehouseId && asset.currentWarehouseId !== 'all'
        ? asset.currentWarehouseId
        : selectedWarehouseId !== 'all'
        ? selectedWarehouseId
        : assignedWarehouseId || (warehouses.find((w) => w.id !== 'all')?.id || '');
    setRepairReceivingWhId(defaultWh);
    setRepairNotes('');
    setRepairFeedback(null);
  };

  const handleOpenRetireModal = (asset: MaintenanceAssetItem) => {
    setRetireModalAsset(asset);
    setRetireReason('');
    setRetireFeedback(null);
  };

  const handleReturnFromMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repairModalAsset) return;
    if (!repairReceivingWhId) {
      setRepairFeedback({ text: 'אנא בחר מחסן לקליטת הכלי מהתיקון', type: 'error' });
      return;
    }
    setIsSubmittingRepair(true);
    setRepairFeedback(null);
    try {
      const res = await returnFromMaintenanceAction({
        assetId: repairModalAsset.assetId,
        receivingWarehouseId: repairReceivingWhId,
        condition: repairCondition,
        notes: repairNotes.trim() || undefined,
      });
      if (res.success) {
        setRepairFeedback({ text: res.message || 'הכלי נקלט בהצלחה מתיקון והוחזר למלאי!', type: 'success' });
        await loadMaintenanceAssets();
        await handleWarehouseChange(selectedWarehouseId);
        setTimeout(() => {
          setRepairModalAsset(null);
          setRepairFeedback(null);
          setRepairNotes('');
        }, 1500);
      } else {
        setRepairFeedback({ text: res.error || 'שגיאה בקליטת כלי מתיקון', type: 'error' });
      }
    } catch (err) {
      setRepairFeedback({ text: err instanceof Error ? err.message : 'שגיאת תקשורת', type: 'error' });
    } finally {
      setIsSubmittingRepair(false);
    }
  };

  const handleScrapAndRetireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retireModalAsset) return;
    if (!retireReason.trim()) {
      setRetireFeedback({ text: 'חובה לציין סיבת גריטה והשבתה', type: 'error' });
      return;
    }
    setIsSubmittingRetire(true);
    setRetireFeedback(null);
    try {
      const res = await scrapAndRetireAssetAction({
        assetId: retireModalAsset.assetId,
        reason: retireReason.trim(),
      });
      if (res.success) {
        setRetireFeedback({ text: res.message || 'הכלי נגרט והושבת לצמיתות מהמערכת', type: 'success' });
        await loadMaintenanceAssets();
        await handleWarehouseChange(selectedWarehouseId);
        setTimeout(() => {
          setRetireModalAsset(null);
          setRetireFeedback(null);
          setRetireReason('');
        }, 1500);
      } else {
        setRetireFeedback({ text: res.error || 'שגיאה בהשבתת הכלי', type: 'error' });
      }
    } catch (err) {
      setRetireFeedback({ text: err instanceof Error ? err.message : 'שגיאת תקשורת', type: 'error' });
    } finally {
      setIsSubmittingRetire(false);
    }
  };

  // Chief Storekeeper: Approve (Dispatch) or Reject site tool request
  const handleResolveSiteRequest = async (requestId: string, decision: 'APPROVE' | 'REJECT') => {
    setIsResolvingRequestId(requestId);
    setInboxFeedback(null);
    try {
      let assignedAssetId: string | undefined = undefined;
      let sourceWarehouseId: string | undefined = undefined;

      if (decision === 'APPROVE') {
        assignedAssetId = selectedAssetForRequest[requestId];
        if (!assignedAssetId) {
          setInboxFeedback({ text: 'יש לבחור כלי עבודה זמין לשינוע לאתר מהרשימה', type: 'error' });
          setIsResolvingRequestId(null);
          return;
        }
        const asset = availableAssetsForInbox.find((a) => a.id === assignedAssetId);
        sourceWarehouseId = asset?.currentWarehouseId || 'wh-central';
      }

      const res = await resolveToolRequestAction({
        requestId,
        decision,
        assignedAssetId,
        sourceWarehouseId,
        rejectionReason: decision === 'REJECT' ? rejectReasonInput : undefined,
      });

      if (res.success) {
        setInboxFeedback({ text: res.message || 'הבקשה עודכנה בהצלחה', type: 'success' });
        setRejectingSiteRequestId(null);
        setRejectReasonInput('');
        await loadChiefInbox();
        if (selectedWarehouseId !== 'all') {
          await loadSiteStorekeeperData(selectedWarehouseId);
        }
      } else {
        setInboxFeedback({ text: res.error || 'שגיאה בעדכון הבקשה', type: 'error' });
      }
    } catch (err) {
      setInboxFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsResolvingRequestId(null);
    }
  };

  // Site Storekeeper: Confirm tool reception at job site
  const handleConfirmSiteReception = async (req: SiteToolRequestItem) => {
    if (!req.assignedAssetId) return;
    setReceivingSiteRequestId(req.id);
    setSiteActionFeedback(null);
    try {
      const res = await confirmToolReceptionAction(
        req.id,
        req.assignedAssetId,
        selectedWarehouseId !== 'all' ? selectedWarehouseId : (assignedWarehouseId || '10000000-0000-0000-0000-000000000002')
      );
      if (res.success) {
        setSiteActionFeedback({ text: res.message || 'הכלי נקלט בהצלחה במחסן האתר!', type: 'success' });
        await loadSiteStorekeeperData(selectedWarehouseId);
        await handleWarehouseChange(selectedWarehouseId);
      } else {
        setSiteActionFeedback({ text: res.error || 'שגיאה בקליטת הכלי', type: 'error' });
      }
    } catch (err) {
      setSiteActionFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setReceivingSiteRequestId(null);
    }
  };

  // Site Storekeeper: Submit new tool request for their site
  const handleSubmitSiteToolRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestToolDesc.trim()) {
      setSiteRequestFeedback({ text: 'יש לציין תיאור של כלי העבודה הנדרש', type: 'error' });
      return;
    }
    setIsSubmittingSiteRequest(true);
    setSiteRequestFeedback(null);
    try {
      const targetWh = selectedWarehouseId !== 'all' ? selectedWarehouseId : assignedWarehouseId;
      const res = await createSiteToolRequestAction({
        toolDescription: requestToolDesc,
        quantity: requestQuantity,
        urgency: requestUrgency,
        reason: requestReason,
        requestingWarehouseId: targetWh,
      });

      if (res.success) {
        setSiteRequestFeedback({ text: res.message || 'הבקשה נשלחה בהצלחה!', type: 'success' });
        setRequestToolDesc('');
        setRequestQuantity(1);
        setRequestUrgency('NORMAL');
        setRequestReason('');
        await loadSiteStorekeeperData(selectedWarehouseId);
        if (isChiefOperations || isGeneralManager) {
          await loadChiefInbox();
        }
        setTimeout(() => {
          setIsSiteRequestModalOpen(false);
          setSiteRequestFeedback(null);
        }, 1500);
      } else {
        setSiteRequestFeedback({ text: res.error || 'שגיאה בהגשת הבקשה', type: 'error' });
      }
    } catch (err) {
      setSiteRequestFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsSubmittingSiteRequest(false);
    }
  };

  // Incoming in-transit equipment to this warehouse
  const [incomingTransfers, setIncomingTransfers] = useState<PendingTransferItem[]>([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState<boolean>(false);
  const [receivingTransferId, setReceivingTransferId] = useState<string | null>(null);

  // Site Dispatch with Tag Verification & Digital Signature State
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [dispatchTagInput, setDispatchTagInput] = useState<string>('');
  const [isSearchingAsset, setIsSearchingAsset] = useState<boolean>(false);
  const [dispatchAsset, setDispatchAsset] = useState<ScannedAssetDetails | null>(null);
  const [isTagVerified, setIsTagVerified] = useState<boolean>(false);
  const [dispatchTargetWhId, setDispatchTargetWhId] = useState<string>(() => {
    const whList = propWarehouses || initialData.warehouses || initialData.allWarehouses || [];
    const firstOther = whList.find((w) => w.id !== initialData.warehouse.id);
    return firstOther ? firstOther.id : (whList[0]?.id || 'wh-site-02');
  });
  const [dispatchWorkerName, setDispatchWorkerName] = useState<string>('');
  const [dispatchWorkerPhone, setDispatchWorkerPhone] = useState<string>('');
  const [dispatchSignature, setDispatchSignature] = useState<string | null>(null);
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState<boolean>(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

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
        void loadPendingTransfers();
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

  // Load local available assets for direct outbound transfer
  const loadLocalAvailableAssets = React.useCallback(async (whId: string) => {
    setIsLoadingLocalAssets(true);
    try {
      const list = await getLocalAvailableAssetsForTransferAction(whId !== 'all' ? whId : undefined);
      setLocalAvailableAssets(list);
    } catch (err) {
      console.warn('Error loading local available assets for transfer:', err);
    } finally {
      setIsLoadingLocalAssets(false);
    }
  }, []);

  React.useEffect(() => {
    if (isDirectTransferModalOpen) {
      void loadLocalAvailableAssets(selectedWarehouseId);
    }
  }, [isDirectTransferModalOpen, selectedWarehouseId, loadLocalAvailableAssets]);

  // Submit direct outbound equipment transfer
  const handleDirectTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirectAsset) {
      setDirectTransferFeedback({ text: 'אנא בחר כלי עבודה זמין לשילוח מהרשימה', type: 'error' });
      return;
    }
    if (!directTargetWarehouseId) {
      setDirectTransferFeedback({ text: 'אנא בחר מחסן או אתר יעד לקליטת הציוד', type: 'error' });
      return;
    }
    if (selectedDirectAsset.currentWarehouseId === directTargetWarehouseId) {
      setDirectTransferFeedback({ text: 'מחסן המקור ומחסן היעד חייבים להיות שונים', type: 'error' });
      return;
    }
    setIsSubmittingDirectTransfer(true);
    setDirectTransferFeedback(null);
    try {
      const res = await directStorekeeperTransferAction({
        assetId: selectedDirectAsset.id,
        targetWarehouseId: directTargetWarehouseId,
        transporterNotes: transporterNotes.trim() || undefined,
        sourceWarehouseId:
          selectedDirectAsset.currentWarehouseId ||
          (selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined),
      });

      if (res.success) {
        setDirectTransferFeedback({
          text: res.message || 'הכלי שולח בהצלחה ועודכן בסטטוס בשינוע!',
          type: 'success',
        });
        await handleWarehouseChange(selectedWarehouseId);
        if (isChiefOperations || isGeneralManager) {
          await loadInTransitFleet();
        }
        await loadIncomingTransfers(selectedWarehouseId);
        setTimeout(() => {
          setIsDirectTransferModalOpen(false);
          setSelectedDirectAsset(null);
          setTransporterNotes('');
          setDirectTransferFeedback(null);
          setDirectSearchQuery('');
        }, 1500);
      } else {
        setDirectTransferFeedback({ text: res.error || 'שגיאה בשילוח ישיר', type: 'error' });
      }
    } catch (err) {
      setDirectTransferFeedback({
        text: err instanceof Error ? err.message : 'שגיאת תקשורת',
        type: 'error',
      });
    } finally {
      setIsSubmittingDirectTransfer(false);
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

  // Search tool by Tag/QR for site dispatch
  const handleSearchAssetForDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = dispatchTagInput.trim();
    if (!term) return;

    setIsSearchingAsset(true);
    setDispatchFeedback(null);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId;
      const asset = await getAssetDetailsByQr(
        term,
        selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined,
        activeOrgId
      );
      if (asset) {
        setDispatchAsset(asset);
        setIsTagVerified(false);
      } else {
        setDispatchAsset(null);
        setDispatchFeedback({
          text: `לא נמצא כלי עבודה התואם לתג/ברקוד "${term}". ודא שהכלי רשום במערכת.`,
          type: 'error',
        });
      }
    } catch {
      setDispatchFeedback({
        text: 'שגיאה באיתור הכלי. אנא נסה שנית.',
        type: 'error',
      });
    } finally {
      setIsSearchingAsset(false);
    }
  };

  // Submit site dispatch with tag verification and signature
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchAsset) {
      setDispatchFeedback({ text: 'אנא אמת כלי עבודה להוצאה', type: 'error' });
      return;
    }
    if (!isTagVerified) {
      setDispatchFeedback({ text: 'חובה לאשר פיזית את תקינות תג ה-QR על הכלי', type: 'error' });
      return;
    }
    if (!dispatchTargetWhId) {
      setDispatchFeedback({ text: 'אנא בחר אתר יעד להוצאת הכלי', type: 'error' });
      return;
    }
    if (!dispatchWorkerName.trim()) {
      setDispatchFeedback({ text: 'אנא הזן את שם מקבל הציוד', type: 'error' });
      return;
    }
    if (!dispatchSignature) {
      setDispatchFeedback({ text: 'חובה לחתום בחתימה דיגיטלית בלוח החתימה', type: 'error' });
      return;
    }

    setIsSubmittingDispatch(true);
    setDispatchFeedback(null);
    try {
      const result = await dispatchAssetWithSignatureAction({
        assetId: dispatchAsset.id,
        targetWarehouseId: dispatchTargetWhId,
        workerName: dispatchWorkerName.trim(),
        workerPhone: dispatchWorkerPhone.trim(),
        signatureData: dispatchSignature,
        isTagVerified: true,
      });

      if (result.success) {
        setDispatchFeedback({
          text: result.message || 'הציוד נופק בהצלחה לאתר עם אישור תיוג וחתימה!',
          type: 'success',
        });
        const activeOrgId = currentOrganization?.id || user?.organizationId;
        const fresh = await getStorekeeperOperations(selectedWarehouseId, activeOrgId);
        setData(fresh);
        setTimeout(() => {
          setIsDispatchModalOpen(false);
          setDispatchAsset(null);
          setDispatchTagInput('');
          setIsTagVerified(false);
          setDispatchWorkerName('');
          setDispatchWorkerPhone('');
          setDispatchSignature(null);
          setDispatchFeedback(null);
        }, 1500);
      } else {
        setDispatchFeedback({ text: result.error || 'שגיאה בניפוק הציוד', type: 'error' });
      }
    } catch {
      setDispatchFeedback({ text: 'אירעה שגיאה בלתי צפויה', type: 'error' });
    } finally {
      setIsSubmittingDispatch(false);
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

  // Open tool passport modal by QR / Tag
  const handleOpenPassport = async (qrCode: string) => {
    const clean = qrCode?.trim();
    if (!clean) return;

    setIsSearchingPassport(true);
    setPassportLookupFeedback(null);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId;
      const asset = await getAssetDetailsByQr(clean, undefined, activeOrgId);
      if (asset) {
        setPassportAsset(asset);
        setIsPassportOpen(true);
        setPassportLookupInput('');
      } else {
        setPassportLookupFeedback(`לא נמצא כלי עבודה עבור תג / ברקוד "${clean}".`);
      }
    } catch (err) {
      console.warn('Error fetching tool passport:', err);
      setPassportLookupFeedback('שגיאה באיתור דרכון הכלי.');
    } finally {
      setIsSearchingPassport(false);
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

        {/* CHIEF STOREKEEPER: INSTANT TOOL PASSPORT LOOKUP */}
        {(isChiefOperations || isGeneralManager || canSwitchDepots) && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 border-2 border-indigo-300 rounded-3xl p-4 sm:p-5 text-white shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/50 border border-indigo-400/30 flex items-center justify-center text-indigo-200 shrink-0">
                  <QrCode className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white flex items-center gap-2">
                    <span>איתור תיק כלי מלא והיסטוריית חיים</span>
                    <span className="text-xs font-normal text-indigo-200 font-mono" dir="ltr">
                      (Instant Tool Passport Lookup)
                    </span>
                  </h2>
                  <p className="text-xs text-indigo-200">
                    מעקב כרונולוגי אחר מחזורי הנפקה, מיקומי שינוע, תקלות ואישורי חתימות
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passportLookupInput.trim()) {
                  void handleOpenPassport(passportLookupInput.trim());
                }
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input
                  type="text"
                  value={passportLookupInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPassportLookupInput(val);
                    setPassportLookupFeedback(null);
                    // Instant open if exact pattern matched or barcode scanned
                    if (/^ZR-\d{3,6}$/i.test(val.trim())) {
                      void handleOpenPassport(val.trim());
                    }
                  }}
                  placeholder="איתור תיק כלי מלא (הזן מספר תג ZR-XXXX או סרוק ברקוד)"
                  className="w-full min-h-[48px] bg-white/10 hover:bg-white/15 focus:bg-white text-white focus:text-slate-950 font-bold text-sm pr-10 pl-24 rounded-2xl border-2 border-indigo-400/40 focus:border-indigo-400 focus:outline-none placeholder:text-indigo-200 shadow-inner transition-colors"
                />
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {isSearchingPassport && (
                    <Loader2 className="w-4 h-4 text-indigo-300 animate-spin" />
                  )}
                  {passportLookupInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setPassportLookupInput('');
                        setPassportLookupFeedback(null);
                      }}
                      className="text-xs text-indigo-300 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!passportLookupInput.trim() || isSearchingPassport}
                className="min-h-[48px] px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
              >
                <QrCode className="w-4 h-4" />
                <span>פתח תיק כלי</span>
              </button>
            </form>

            {passportLookupFeedback && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{passportLookupFeedback}</span>
              </div>
            )}
          </div>
        )}

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
                    <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">(Field Requisitions)</span>
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

              {isLoadingInbox && (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              )}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                            <Flame className="w-3 h-3" />
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
                              onClick={() => handleResolveSiteRequest(req.id, 'REJECT')}
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
                              onClick={() => handleResolveSiteRequest(req.id, 'APPROVE')}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                              onClick={() => handleOpenPassport(req.qrCode)}
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
                              onClick={() => handleRejectTransfer(req.id)}
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
                            onClick={() => handleApproveTransfer(req.id)}
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

        {/* CHIEF STOREKEEPER: IN-TRANSIT FLEET TRACKER (מעקב שינוע וציוד בדרך) */}
        {(isChiefOperations || isGeneralManager) && (
          <div className="bg-white border-2 border-sky-200/90 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100/70 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>מעקב שינוע וציוד בדרך</span>
                    <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">(In-Transit Fleet Logistics)</span>
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
                  onClick={() => void loadInTransitFleet()}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                              onClick={() => handleOpenPassport(item.qrCode)}
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

                        {/* Delivery Status Badge: 🚚 "בשינוע לשטח" (En Route) */}
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

                      {/* Transit Details: Dispatch timestamp + elapsed transit time + authorized storekeeper */}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHIEF STOREKEEPER: CENTRAL MAINTENANCE & REPAIR HUB (מרכז אחזקה ובקרת תיקונים) */}
        {(isChiefOperations || isGeneralManager) && (
          <div className="bg-white border-2 border-amber-300/80 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>מרכז אחזקה ובקרת תיקונים</span>
                    <span className="text-xs font-bold text-slate-500 font-mono" dir="ltr">(Central Maintenance & Repair Hub)</span>
                    {maintenanceAssets.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-600 text-white animate-pulse">
                        {maintenanceAssets.length} כלים בטיפול
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ספר מעקב אחזקה מרכזי &bull; שליטה במעבדות שירות, קליטה מתיקון והחזרה למלאי, וגריטת ציוד תקול
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => void loadMaintenanceAssets()}
                  disabled={isLoadingMaintenance}
                  className="px-3 py-1.5 rounded-xl border border-amber-200 hover:bg-amber-50 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMaintenance ? 'animate-spin' : ''}`} />
                  <span>רענן נתוני אחזקה</span>
                </button>
              </div>
            </div>

            {isLoadingMaintenance && maintenanceAssets.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                <span>טוען נתוני תיקונים ומעבדות...</span>
              </div>
            ) : maintenanceAssets.length === 0 ? (
              <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-slate-200 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>כל הציוד הארגוני תקין ועומד לרשות המחסנים והאתרים &bull; אין כרגע כלים בתיקון או במעבדה</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {maintenanceAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="p-4 rounded-2xl bg-gradient-to-br from-white to-amber-50/30 border-2 border-amber-200 shadow-sm flex flex-col justify-between gap-4 hover:border-amber-400 transition-all"
                  >
                    <div className="space-y-3">
                      {/* Top Bar: Tool Tag & Model + Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenPassport(asset.qrCode)}
                              className="font-mono text-xs font-black text-amber-950 bg-amber-50 hover:bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300 hover:border-amber-500 transition-colors cursor-pointer group flex items-center gap-1 shadow-2xs"
                              title={`לחץ לפתיחת תיק כלי מלא עבור ${asset.qrCode}`}
                              dir="ltr"
                            >
                              <QrCode className="w-3.5 h-3.5 text-amber-700 group-hover:scale-110 transition-transform" />
                              <span className="underline decoration-amber-400">{asset.qrCode}</span>
                            </button>
                            {asset.serialNumber && (
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                מס&quot;ד: {asset.serialNumber}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-black text-slate-900 mt-1">
                            {asset.toolName}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {asset.brand} {asset.modelNumber ? `• דגם: ${asset.modelNumber}` : ''}
                          </p>
                        </div>

                        <span className="text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                          <Wrench className="w-3.5 h-3.5 text-amber-700" />
                          <span>בתיקון / מעבדה</span>
                        </span>
                      </div>

                      {/* Fault Description Callout from custody_ledger */}
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/90 text-xs space-y-1">
                        <div className="font-black text-amber-950 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>תיאור תקלה ודוח פגם:</span>
                        </div>
                        <p className="text-amber-900 font-medium leading-relaxed">
                          {asset.faultDescription}
                        </p>
                      </div>

                      {/* Lab / Tech + Reporting Site + Dispatch Date */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold block">מעבדה / טכנאי מטפל</span>
                          <span className="font-black text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate">{asset.assignedTechnicianOrLab}</span>
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold block">מחסן / אתר מדווח</span>
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">{asset.reportingWarehouseName}</span>
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 sm:col-span-2 flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>נשלח לתיקון: <strong>{new Date(asset.dispatchedDate).toLocaleDateString('he-IL')}</strong></span>
                          </span>
                          <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                            {asset.elapsedTimeText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Action Buttons on each card */}
                    <div className="pt-3 border-t border-amber-200/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenRetireModal(asset)}
                        className="py-2 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>גריטת כלי / השבתה</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenRepairModal(asset)}
                        className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>קליטה מתיקון / Return to Stock</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHIEF STOREKEEPER: CENTRAL NOTES & FIELD REMARKS FEED (מרכז הערות ותיעוד שטח) */}
        {(isChiefOperations || isGeneralManager) && (
          <ChiefNotesFeedView
            warehouses={data.allWarehouses || data.warehouses}
            onOpenPassport={handleOpenPassport}
          />
        )}

        {/* SITE STOREKEEPER: REQUEST TOOL FOR SITE BANNER */}
        {(!isChiefOperations && !isGeneralManager) && (
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
              onClick={() => {
                setSiteRequestFeedback(null);
                setRequestToolDesc('');
                setRequestQuantity(1);
                setRequestUrgency('NORMAL');
                setRequestReason('');
                setIsSiteRequestModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>בקשת ציוד לאתר</span>
            </button>
          </div>
        )}

        {/* SITE STOREKEEPER: INCOMING IN-TRANSIT TOOLS TO THIS SITE */}
        {(!isChiefOperations && !isGeneralManager) && siteIncomingShipments.length > 0 && (
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                      onClick={() => handleConfirmSiteReception(req)}
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
        {(!isChiefOperations && !isGeneralManager) && mySiteRequests.length > 0 && (
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

        {/* DIRECT OUTBOUND EQUIPMENT TRANSFER (העברה ישירה ע"י מחסנאי ללא צורך באישור מנהל) */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950 via-blue-900 to-indigo-950 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-sky-500/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/30 text-sky-200 flex items-center justify-center border border-sky-400/30 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>העברה ישירה לאתר אחר</span>
                <span className="text-[10px] font-bold bg-sky-500/30 text-sky-200 px-2 py-0.5 rounded-full border border-sky-400/30">
                  שילוח מיידי &bull; ללא אישור מנהל
                </span>
              </h3>
              <p className="text-xs text-sky-200 mt-0.5">
                שילוח ישיר של כלי עבודה זמין ממחסן זה ישירות לאתר בנייה או מחסן אחר בארגון
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDirectTransferFeedback(null);
              setSelectedDirectAsset(null);
              setTransporterNotes('');
              setDirectSearchQuery('');
              const otherWh = warehouses.find((w) => w.id !== 'all' && w.id !== selectedWarehouseId);
              setDirectTargetWarehouseId(otherWh ? otherWh.id : '');
              setIsDirectTransferModalOpen(true);
            }}
            className="py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Truck className="w-4 h-4" />
            <span>העברה ישירה לאתר אחר</span>
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
            onClick={() => {
              setDispatchFeedback(null);
              setDispatchAsset(null);
              setDispatchTagInput('');
              setIsTagVerified(false);
              setDispatchWorkerName('');
              setDispatchWorkerPhone('');
              setDispatchSignature(null);
              setIsDispatchModalOpen(true);
            }}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <PenTool className="w-4 h-4" />
            <span>הוצאת ציוד לאתר (אישור תיוג וחתימה)</span>
          </button>
        </div>

        {/* 3. PROMINENT ACTION SHORTCUTS */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          <Link
            href="/"
            className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-md shadow-blue-600/20 active:scale-95 transition-all"
          >
            <Zap className="w-6 h-6 stroke-[2.5]" />
            <span>⚡ ניפוק מרוכז מהיר</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setCheckinPreselectedAssetId(null);
              setIsCheckinModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-white hover:bg-blue-50 text-blue-900 border-2 border-blue-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Scan className="w-6 h-6 text-blue-600" />
            <span>קליטת ציוד והחזרה</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectTransferFeedback(null);
              setSelectedDirectAsset(null);
              setTransporterNotes('');
              setDirectSearchQuery('');
              const otherWh = warehouses.find((w) => w.id !== 'all' && w.id !== selectedWarehouseId);
              setDirectTargetWarehouseId(otherWh ? otherWh.id : '');
              setIsDirectTransferModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-white hover:bg-sky-50 text-sky-900 border-2 border-sky-200 font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Truck className="w-6 h-6 text-sky-600" />
            <span>🚚 העברה ישירה לאתר</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQuickOcrOpen(true)}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center text-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-6 h-6 text-amber-300 stroke-[2.5]" />
            <span>🔦 סורק OCR שטח</span>
          </button>

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
                          <button
                            type="button"
                            onClick={() => handleOpenPassport(tool.qrCode)}
                            className="font-mono text-[11px] font-black text-rose-950 hover:underline cursor-pointer flex items-center gap-1"
                            title={`לחץ לפתיחת תיק כלי מלא עבור ${tool.qrCode}`}
                            dir="ltr"
                          >
                            <QrCode className="w-3 h-3 text-rose-600" />
                            <span>{tool.qrCode}</span>
                          </button>
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

                    {/* Checkout Note if present */}
                    {tool.checkoutNote && (
                      <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-950 font-medium flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="font-bold">הערת ניפוק:</span>
                        <span className="italic truncate">&ldquo;{tool.checkoutNote}&rdquo;</span>
                      </div>
                    )}

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

                      <button
                        type="button"
                        onClick={() => {
                          setCheckinPreselectedAssetId(tool.assetId);
                          setIsCheckinModalOpen(true);
                        }}
                        className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="קלוט כלי זה חזרה למחסן"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>קלוט</span>
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
                    </div>

                    {/* Checkout Note if present */}
                    {item.checkoutNote && (
                      <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/70 text-[11px] text-amber-950 font-medium flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="font-bold">הערת ניפוק:</span>
                        <span className="italic truncate">&ldquo;{item.checkoutNote}&rdquo;</span>
                      </div>
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

      {/* STOREKEEPER: DIRECT OUTBOUND EQUIPMENT TRANSFER MODAL */}
      {isDirectTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-sky-300 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-sky-950 via-blue-900 to-indigo-950 text-white flex items-center justify-between shrink-0 border-b border-sky-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/30 flex items-center justify-center border border-sky-400/30">
                  <Truck className="w-5 h-5 text-sky-200" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white flex items-center gap-2">
                    <span>העברה ישירה לאתר אחר</span>
                    <span className="text-[10px] font-bold bg-sky-400/20 text-sky-200 px-2 py-0.5 rounded-full border border-sky-300/30">
                      שילוח מיידי
                    </span>
                  </h3>
                  <p className="text-xs text-sky-200">
                    שילוח כלי עבודה זמין ממחסן זה ישירות לאתר בנייה או מחסן אחר בארגון
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDirectTransferModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDirectTransferSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {directTransferFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    directTransferFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {directTransferFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{directTransferFeedback.text}</span>
                </div>
              )}

              {/* Source Warehouse Info */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    מחסן מקור (נוכחי): <strong className="text-slate-900">{data.warehouse?.name || 'מחסן שטח'}</strong>
                  </span>
                </div>
                <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  מלאי זמין לשילוח
                </span>
              </div>

              {/* 1. Tool Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>1. בחירת כלי עבודה מהמלאי הזמין <span className="text-rose-500">*</span></span>
                  {selectedDirectAsset && (
                    <button
                      type="button"
                      onClick={() => setSelectedDirectAsset(null)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                    >
                      החלף כלי
                    </button>
                  )}
                </label>

                {selectedDirectAsset ? (
                  <div className="p-3.5 rounded-2xl bg-sky-50/80 border-2 border-sky-400 flex items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-sky-950 bg-white px-2 py-0.5 rounded border border-sky-200" dir="ltr">
                          {selectedDirectAsset.qrCode}
                        </span>
                        {selectedDirectAsset.tagNumber && (
                          <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                            {selectedDirectAsset.tagNumber}
                          </span>
                        )}
                        <span className="text-xs font-black text-sky-950">
                          {selectedDirectAsset.name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {selectedDirectAsset.brand} {selectedDirectAsset.modelNumber ? `• דגם: ${selectedDirectAsset.modelNumber}` : ''} {selectedDirectAsset.serialNumber ? `• מס"ד: ${selectedDirectAsset.serialNumber}` : ''}
                      </p>
                    </div>
                    <Check className="w-5 h-5 text-sky-600 shrink-0" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={directSearchQuery}
                          onChange={(e) => setDirectSearchQuery(e.target.value)}
                          placeholder="סנן לפי תג (למשל: ZR-1099), שם כלי, מותג או מס' סידורי..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDirectTransferOcrOpen(true)}
                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm transition-all"
                        title="סריקת OCR תעשייתי"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>סרוק OCR</span>
                      </button>
                    </div>

                    {isLoadingLocalAssets ? (
                      <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                        <span>טוען כלי עבודה זמינים במחסן...</span>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-1.5 bg-slate-50/50">
                        {localAvailableAssets
                          .filter((a) => {
                            if (!directSearchQuery.trim()) return true;
                            const q = directSearchQuery.toLowerCase();
                            return (
                              a.name.toLowerCase().includes(q) ||
                              a.brand.toLowerCase().includes(q) ||
                              a.qrCode.toLowerCase().includes(q) ||
                              (a.tagNumber && a.tagNumber.toLowerCase().includes(q)) ||
                              (a.modelNumber && a.modelNumber.toLowerCase().includes(q)) ||
                              (a.serialNumber && a.serialNumber.toLowerCase().includes(q))
                            );
                          })
                          .slice(0, 50)
                          .map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => setSelectedDirectAsset(asset)}
                              className="w-full text-right p-2.5 rounded-xl bg-white hover:bg-sky-50/70 border border-slate-200 hover:border-sky-300 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded" dir="ltr">
                                    {asset.qrCode}
                                  </span>
                                  {asset.tagNumber && (
                                    <span className="font-mono text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                      {asset.tagNumber}
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-slate-900">{asset.name}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {asset.brand} {asset.modelNumber ? `• ${asset.modelNumber}` : ''}
                                </p>
                              </div>
                              <span className="text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg shrink-0">
                                בחר כלי
                              </span>
                            </button>
                          ))}

                        {localAvailableAssets.length === 0 && (
                          <div className="p-4 text-center text-xs text-slate-500">
                            אין כרגע כלים זמינים במחסן זה לשילוח
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Destination Warehouse */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  2. אתר יעד לקליטת הציוד (מחסן מקבל) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={directTargetWarehouseId}
                  onChange={(e) => setDirectTargetWarehouseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                >
                  <option value="" disabled>
                    בחר אתר יעד...
                  </option>
                  {warehouses
                    .filter((w) => w.id !== 'all' && w.id !== selectedWarehouseId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.code ? `(${w.code})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* 3. Transporter / Driver Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  3. פרטי המוביל / נהג שינוע או תעודת משלוח (הערות שינוע)
                </label>
                <input
                  type="text"
                  value={transporterNotes}
                  onChange={(e) => setTransporterNotes(e.target.value)}
                  placeholder="למשל: נהג אחמד (טנדר 44-555-66), נשלח בדחיפות לעבודות לילה..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Route Summary */}
              {selectedDirectAsset && directTargetWarehouseId && (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">ממחסן מקור</span>
                    <strong className="text-slate-900">
                      {data.warehouse?.name || 'מחסן מקור'}
                    </strong>
                  </div>
                  <Truck className="w-4 h-4 text-sky-600" />
                  <div className="text-left">
                    <span className="text-[10px] text-slate-500 block">ליעד</span>
                    <strong className="text-sky-900">
                      {warehouses.find((w) => w.id === directTargetWarehouseId)?.name || 'אתר יעד'}
                    </strong>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDirectTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDirectTransfer || !selectedDirectAsset || !directTargetWarehouseId}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-sky-600/20 cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingDirectTransfer ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>משלח כלי...</span>
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4" />
                      <span>אשר שילוח והעברה</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SITE EQUIPMENT DISPATCH (TAG VERIFICATION & DIGITAL SIGNATURE) MODAL */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-emerald-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-900 to-teal-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/50 flex items-center justify-center border border-emerald-400/30">
                  <FileSignature className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">הוצאת ציוד לאתר עבודה</h3>
                  <p className="text-[11px] text-emerald-200">נוהל מסירה מבוקר: אישור תיוג וחתימה דיגיטלית</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
              {dispatchFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    dispatchFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {dispatchFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{dispatchFeedback.text}</span>
                </div>
              )}

              {/* STEP 1: Tag & Asset Verification */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                    <span>אימות תג וזיהוי כלי עבודה</span>
                  </span>
                  {dispatchAsset && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                      כלי אותר בהצלחה
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <QrCode className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      dir="ltr"
                      value={dispatchTagInput}
                      onChange={(e) => setDispatchTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchAssetForDispatch();
                        }
                      }}
                      placeholder="הזן תג / QR (למשל ZR-1099, ZR-282)"
                      className="w-full bg-white border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchAssetForDispatch()}
                    disabled={isSearchingAsset || !dispatchTagInput.trim()}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isSearchingAsset ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>בדוק כלי</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDispatchOcrOpen(true)}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm transition-all"
                    title="סריקת OCR תעשייתי"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>סרוק OCR</span>
                  </button>
                </div>

                {/* Display Scanned Tool Card */}
                {dispatchAsset && (
                  <div className="p-3 bg-white rounded-xl border-2 border-emerald-300 shadow-xs space-y-2.5 animate-in fade-in">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[11px] font-black text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" dir="ltr">
                            {dispatchAsset.qrCode}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            {dispatchAsset.brand}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900">{dispatchAsset.toolName}</h4>
                        {dispatchAsset.modelNumber && (
                          <p className="text-xs text-slate-500 font-mono" dir="ltr">
                            דגם: {dispatchAsset.modelNumber}
                          </p>
                        )}
                      </div>
                      <div className="text-left text-[11px] text-slate-500 font-bold">
                        <div>מיקום נוכחי:</div>
                        <span className="text-slate-900">{dispatchAsset.warehouseName}</span>
                      </div>
                    </div>

                    {/* PHYSICAL TAG VERIFICATION CHECKBOX */}
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-50/90 border-2 border-amber-300 text-amber-950 cursor-pointer hover:bg-amber-100/80 transition-colors">
                      <input
                        type="checkbox"
                        checked={isTagVerified}
                        onChange={(e) => setIsTagVerified(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-black">
                        ☑️ אישור תיוג: נבדק פיזית ותג ה-QR מודבק ותקין על גבי הכלי
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* STEP 2: Target Site & Recipient Details */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
                  <span>אתר יעד ופרטי מקבל הציוד</span>
                </span>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    בחר אתר בנייה / מכולת יעד:
                  </label>
                  <select
                    value={dispatchTargetWhId}
                    onChange={(e) => setDispatchTargetWhId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:border-emerald-600 focus:outline-none"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} {wh.code ? `(${wh.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      שם מקבל הציוד בשטח: *
                    </label>
                    <input
                      type="text"
                      value={dispatchWorkerName}
                      onChange={(e) => setDispatchWorkerName(e.target.value)}
                      placeholder="לדוגמה: אחמד חטיב (מנהל עבודה)"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      טלפון נייד:
                    </label>
                    <input
                      type="tel"
                      dir="ltr"
                      value={dispatchWorkerPhone}
                      onChange={(e) => setDispatchWorkerPhone(e.target.value)}
                      placeholder="05X-XXXXXXX"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:border-emerald-600 focus:outline-none text-right"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 3: Digital Signature */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
                  <span>חתימה דיגיטלית של מקבל הציוד</span>
                </span>

                <SignaturePad
                  onSignatureChange={(sig) => setDispatchSignature(sig)}
                  height={150}
                  label="חתימת המקבל לאישור אחריות וקבלת הציוד:"
                />

                <p className="text-[11px] text-slate-500 font-medium pt-1">
                  בחתימתו, מאשר מקבל הציוד קבלת הכלי במצב תקין ונושא באחריות המבצעית לשמירתו והחזרתו.
                </p>
              </div>

              {/* STEP 4: Finalize Action */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingDispatch ||
                    !dispatchAsset ||
                    !isTagVerified ||
                    !dispatchWorkerName.trim() ||
                    !dispatchSignature
                  }
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingDispatch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>רושם מסירה...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>אשר מסירה וחתום</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SITE TOOL REQUEST MODAL (Site Storekeeper -> Operations Manager) */}
      {isSiteRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-blue-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
                  <Send className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">בקשת ציוד לאתר / מכולה</h3>
                  <p className="text-[11px] text-blue-200">הגשת דרישה מבצעית ישירה לאחראי תפעול ראשי</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSiteRequestModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSiteToolRequest} className="p-5 overflow-y-auto space-y-4 flex-1">
              {siteRequestFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    siteRequestFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                >
                  {siteRequestFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{siteRequestFeedback.text}</span>
                </div>
              )}

              {/* Tool Description & Quick Chips */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  תיאור כלי העבודה או הציוד הנדרש <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={requestToolDesc}
                  onChange={(e) => setRequestToolDesc(e.target.value)}
                  placeholder="למשל: פטיש חציבה כבד SDS-Max, משחזת 9 אינץ'..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                />

                {/* Quick Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'פטיש חציבה SDS-Max',
                    'משחזת זוית 9 אינץ\'',
                    'רתכת CO2 ניידת',
                    'גנרטור מושתק 5.5KVA',
                    'מהדק אדמה (ג\'מפינג)',
                    'שואב אבק תעשייתי',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setRequestToolDesc(chip)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition-all cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  כמות נדרשת
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black flex items-center justify-center cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={requestQuantity}
                    onChange={(e) => setRequestQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 text-center bg-slate-50 border border-slate-300 rounded-xl py-1.5 text-sm font-black text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setRequestQuantity((q) => q + 1)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Urgency Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  רמת דחיפות
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestUrgency('NORMAL')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      requestUrgency === 'NORMAL'
                        ? 'bg-blue-50 border-blue-400 text-blue-950 font-black ring-2 ring-blue-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🟢 רגיל</span>
                    <span className="text-[10px] text-slate-500 font-normal">אספקה שוטפת</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestUrgency('URGENT')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      requestUrgency === 'URGENT'
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-black ring-2 ring-amber-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🟡 דחוף</span>
                    <span className="text-[10px] text-slate-500 font-normal">למחר בבוקר</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestUrgency('CRITICAL')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      requestUrgency === 'CRITICAL'
                        ? 'bg-rose-50 border-rose-400 text-rose-950 font-black ring-2 ring-rose-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🔴 קריטי</span>
                    <span className="text-[10px] text-slate-500 font-normal">עצירת עבודה</span>
                  </button>
                </div>
              </div>

              {/* Operational Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  נימוק / סיבה מבצעית (אופציונלי)
                </label>
                <textarea
                  rows={2}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="למשל: נדרש ליציקת בטון דחופה מחר, הכלי הקיים הושבת..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSiteRequestModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSiteRequest || !requestToolDesc.trim()}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingSiteRequest ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>שולח בקשה...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>שלח בקשת ציוד לאישור</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: RETURN FROM MAINTENANCE (קליטה מתיקון והחזרה למלאי) */}
      {repairModalAsset && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full border-2 border-emerald-400 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    קליטת כלי מתיקון והחזרה למלאי
                  </h3>
                  <p className="text-xs text-slate-500">
                    עדכון מצב טכני והחזרת הכלי למעגל ההשאלות הפעיל
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRepairModalAsset(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {repairFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  repairFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                {repairFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{repairFeedback.text}</span>
              </div>
            )}

            {/* Asset details card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-300" dir="ltr">
                  {repairModalAsset.qrCode}
                </span>
                <span className="text-xs font-black text-slate-900">
                  {repairModalAsset.toolName}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {repairModalAsset.brand} {repairModalAsset.modelNumber ? `• דגם: ${repairModalAsset.modelNumber}` : ''}
              </div>
              <div className="text-[11px] text-amber-800 bg-amber-50/80 p-2 rounded-lg border border-amber-200 mt-2">
                <strong>תקלה שדווחה:</strong> {repairModalAsset.faultDescription}
              </div>
            </div>

            <form onSubmit={handleReturnFromMaintenanceSubmit} className="space-y-4">
              {/* Condition rating: excellent / good */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  דירוג מצב הכלי לאחר התיקון <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRepairCondition('good')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      repairCondition === 'good'
                        ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950 font-black'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>תקין ומוכן לעבודה</span>
                      <Check className={`w-4 h-4 ${repairCondition === 'good' ? 'text-emerald-600' : 'text-transparent'}`} />
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal">
                      הכלי תוקן ונבדק, מתאים לשימוש מלא בשטח
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRepairCondition('excellent')}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      repairCondition === 'excellent'
                        ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950 font-black'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>מצב מעולה / כחדש</span>
                      </span>
                      <Check className={`w-4 h-4 ${repairCondition === 'excellent' ? 'text-emerald-600' : 'text-transparent'}`} />
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal">
                      הוחלפו מכלולים ראשיים או כלי מחודש במצב מושלם
                    </span>
                  </button>
                </div>
              </div>

              {/* Receiving warehouse selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  מחסן מקבל לקליטת המלאי <span className="text-rose-500">*</span>
                </label>
                <select
                  value={repairReceivingWhId}
                  onChange={(e) => setRepairReceivingWhId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                >
                  <option value="" disabled>בחר מחסן לקליטה...</option>
                  {warehouses.filter((w) => w.id !== 'all').map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} {wh.code ? `(${wh.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Repair notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  הערות תיקון ובדיקה טכנית (אופציונלי)
                </label>
                <textarea
                  rows={2}
                  value={repairNotes}
                  onChange={(e) => setRepairNotes(e.target.value)}
                  placeholder="למשל: נבדק תחת עומס עבודה, הוחלף כבל חשמל ומגן להב..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRepairModalAsset(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRepair || !repairReceivingWhId}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingRepair ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>קולט כלי למלאי...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>אשר קליטה והחזרה למלאי</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SCRAP & RETIRE (גריטת כלי והשבתה לצמיתות) */}
      {retireModalAsset && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full border-2 border-rose-400 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    גריטת כלי והשבתה לצמיתות
                  </h3>
                  <p className="text-xs text-slate-500">
                    הוצאה סופית של הכלי מצי הכלים הפעיל של הארגון
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRetireModalAsset(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {retireFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  retireFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                {retireFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{retireFeedback.text}</span>
              </div>
            )}

            {/* Warning callout */}
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-1.5">
              <div className="font-black text-rose-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>שים לב: השבתה בלתי הפיכה</span>
              </div>
              <p className="text-rose-900 text-[11px] leading-relaxed">
                גריטת הכלי תסיר אותו ממצבת הכלים הזמינים להשאלה, תעדכן את יומן המשמורת (Custody Ledger) בפעולת <code>DECOMMISSION</code> ותשמור את היסטוריית הכלי למטרות ביקורת.
              </p>
            </div>

            {/* Asset details card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-300" dir="ltr">
                  {retireModalAsset.qrCode}
                </span>
                <span className="text-xs font-black text-slate-900">
                  {retireModalAsset.toolName}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {retireModalAsset.brand} {retireModalAsset.modelNumber ? `• דגם: ${retireModalAsset.modelNumber}` : ''}
              </div>
            </div>

            <form onSubmit={handleScrapAndRetireSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  סיבת גריטה והשבתה מנומקת <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={retireReason}
                  onChange={(e) => setRetireReason(e.target.value)}
                  placeholder="פרט את סיבת הגריטה (למשל: מנוע שרוף ושלדה סדוקה, עלות תיקון עולה על 85% מעלות כלי חדש)..."
                  className="w-full bg-slate-50 border border-rose-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRetireModalAsset(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRetire || !retireReason.trim()}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {isSubmittingRetire ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>משבית כלי...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>אשר גריטה והשבתה לצמיתות</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EQUIPMENT RETURN & CHECK-IN MODAL (Camera Scanner + Manual Omnisearch) */}
      <ManualCheckinModal
        isOpen={isCheckinModalOpen}
        onClose={() => {
          setIsCheckinModalOpen(false);
          setCheckinPreselectedAssetId(null);
        }}
        warehouseId={selectedWarehouseId}
        preSelectedAssetId={checkinPreselectedAssetId}
        onSuccess={() => {
          void handleWarehouseChange(selectedWarehouseId);
        }}
      />

      {/* OCR SCANNER 1: DIRECT OUTBOUND EQUIPMENT TRANSFER */}
      <OcrScannerModal
        isOpen={isDirectTransferOcrOpen}
        onClose={() => setIsDirectTransferOcrOpen(false)}
        onAssetDetected={(asset) => {
          const found = localAvailableAssets.find((a) => a.id === asset.id || a.qrCode === asset.qrCode);
          if (found) {
            setSelectedDirectAsset(found);
          } else {
            setSelectedDirectAsset({
              id: asset.id,
              name: asset.toolName,
              brand: asset.brand,
              modelNumber: asset.modelNumber,
              qrCode: asset.qrCode,
              tagNumber: asset.qrCode,
              serialNumber: null,
              currentWarehouseId: asset.currentWarehouseId || '',
              currentWarehouseName: asset.warehouseName || '',
            });
          }
          setIsDirectTransferOcrOpen(false);
        }}
        warehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        title="שילוח ציוד ישיר - סריקת OCR שטח"
        description="זיהוי תגית כלי לצורך שילוח ישיר לאתר אחר ללא אישור"
      />

      {/* OCR SCANNER 2: SITE DISPATCH VERIFICATION */}
      <OcrScannerModal
        isOpen={isDispatchOcrOpen}
        onClose={() => setIsDispatchOcrOpen(false)}
        onAssetDetected={(asset) => {
          setDispatchAsset(asset);
          setDispatchTagInput(asset.qrCode);
          setIsTagVerified(true);
          setIsDispatchOcrOpen(false);
        }}
        warehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        title="הוצאת ציוד לאתר - אימות תגית OCR"
        description="סריקה מוקשחת לאישור תיוג פיזי של הכלי המנופק"
      />

      {/* OCR SCANNER 3: PROMINENT FIELD SCANNER & PASSPORT LOCK */}
      <OcrScannerModal
        isOpen={isQuickOcrOpen}
        onClose={() => setIsQuickOcrOpen(false)}
        onAssetDetected={(asset) => {
          setIsQuickOcrOpen(false);
          setPassportAsset(asset);
          setIsPassportOpen(true);
        }}
        warehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        title="סורק שטח תעשייתי OCR"
        description="סריקה מוקשחת עם פנס וסינון רעשים - נעילה מיידית על כלי במלאי"
      />
    </AppLayout>
  );
}
