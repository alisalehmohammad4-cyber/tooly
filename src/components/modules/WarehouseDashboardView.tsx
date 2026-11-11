'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Lock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Truck,
  Wrench,
  FileText,
} from 'lucide-react';

import type { StorekeeperOperationsPayload, WarehouseOption, StorekeeperActiveLoan } from '@/app/actions/dashboard';
import { getStorekeeperOperations } from '@/app/actions/dashboard';
import AppLayout from '@/components/layout/AppLayout';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import ManualCheckinModal from '@/components/modules/ManualCheckinModal';
import ChiefNotesFeedView from '@/components/modules/ChiefNotesFeedView';
import { useAuth } from '@/context/AuthContext';
import { normalizeFieldTag } from '@/lib/ocr/tagParser';
import {
  getAssetDetailsByQr,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import {
  getIncomingInTransitTransfersAction,
  completeTransferReceptionAction,
  cancelTransferRollbackAction,
  getPendingTransfersAction,
  decideTransferRequestAction,
  type AvailableTransferAssetItem,
  type PendingTransferItem,
} from '@/app/actions/transfers';
import {
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
  type InTransitFleetItem,
  type MaintenanceAssetItem,
} from '@/app/actions/maintenance';

// Modularized Tabs
import WarehouseDailyOperationsTab from './warehouse/tabs/WarehouseDailyOperationsTab';
import WarehouseTransfersTab from './warehouse/tabs/WarehouseTransfersTab';
import WarehouseMaintenanceTab from './warehouse/tabs/WarehouseMaintenanceTab';

// Modularized Modals
import DirectTransferModal from './warehouse/modals/DirectTransferModal';
import RepairReturnModal from './warehouse/modals/RepairReturnModal';
import ResolveToolRequestModal from './warehouse/modals/ResolveToolRequestModal';
import ScrapRetireModal from './warehouse/modals/ScrapRetireModal';
import SiteToolRequestModal from './warehouse/modals/SiteToolRequestModal';
import { InterDepotTransferModal } from './warehouse/modals/InterDepotTransferModal';
import { StockReconciliationModal } from './warehouse/modals/StockReconciliationModal';
import { InterSiteTransferRequestModal } from './warehouse/modals/InterSiteTransferRequestModal';
import { QuickCheckoutModal } from './warehouse/modals/QuickCheckoutModal';

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
  const router = useRouter();

  // Core Data State
  const [data, setData] = useState<StorekeeperOperationsPayload>(initialData);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    if (isStorekeeper && assignedWarehouseId) {
      return assignedWarehouseId;
    }
    return initialData.warehouse.id;
  });
  const [isLoadingWarehouse, setIsLoadingWarehouse] = useState<boolean>(false);

  // 4-Tab Navigation: 'operations' | 'transfers' | 'maintenance' | 'notes'
  const [activeTab, setActiveTab] = useState<'operations' | 'transfers' | 'maintenance' | 'notes'>('operations');

  // Keep dashboard metrics synchronized when Server Component re-fetches via router.refresh()
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const warehouses = useMemo(
    () => propWarehouses || data.warehouses || data.allWarehouses || [],
    [propWarehouses, data.warehouses, data.allWarehouses]
  );

  // Modal Open States
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState<boolean>(false);
  const [checkinPreselectedAssetId, setCheckinPreselectedAssetId] = useState<string | null>(null);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);
  const [passportAsset, setPassportAsset] = useState<ScannedAssetDetails | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isTransferRequestModalOpen, setIsTransferRequestModalOpen] = useState<boolean>(false);
  const [isDirectTransferModalOpen, setIsDirectTransferModalOpen] = useState<boolean>(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [isSiteRequestModalOpen, setIsSiteRequestModalOpen] = useState<boolean>(false);

  const [repairModalAsset, setRepairModalAsset] = useState<MaintenanceAssetItem | null>(null);
  const [retireModalAsset, setRetireModalAsset] = useState<MaintenanceAssetItem | null>(null);

  // ---------------------------------------------------------------------------
  // Data State for Tab 2 (Transfers) & Tab 3 (Maintenance)
  // ---------------------------------------------------------------------------
  const [inTransitFleet, setInTransitFleet] = useState<InTransitFleetItem[]>([]);
  const [isLoadingInTransit, setIsLoadingInTransit] = useState<boolean>(false);
  const [operatingFleetAssetId, setOperatingFleetAssetId] = useState<string | null>(null);
  const [fleetOperationType, setFleetOperationType] = useState<'receive' | 'cancel' | null>(null);

  const [incomingTransfers, setIncomingTransfers] = useState<PendingTransferItem[]>([]);
  const [receivingTransferId, setReceivingTransferId] = useState<string | null>(null);

  const [siteRequestsInbox, setSiteRequestsInbox] = useState<SiteToolRequestItem[]>([]);
  const [availableAssetsForInbox, setAvailableAssetsForInbox] = useState<SuggestedToolAsset[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState<boolean>(false);
  const [selectedAssetForRequest, setSelectedAssetForRequest] = useState<Record<string, string>>({});
  const [isResolvingRequestId, setIsResolvingRequestId] = useState<string | null>(null);
  const [rejectingSiteRequestId, setRejectingSiteRequestId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');
  const [inboxFeedback, setInboxFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [pendingTransfers, setPendingTransfers] = useState<PendingTransferItem[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState<boolean>(false);
  const [decidingTransferId, setDecidingTransferId] = useState<string | null>(null);
  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [transferApprovalFeedback, setTransferApprovalFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const [siteIncomingShipments, setSiteIncomingShipments] = useState<SiteToolRequestItem[]>([]);
  const [mySiteRequests, setMySiteRequests] = useState<SiteToolRequestItem[]>([]);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState<boolean>(false);
  const [receivingSiteRequestId, setReceivingSiteRequestId] = useState<string | null>(null);
  const [siteActionFeedback, setSiteActionFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [maintenanceAssets, setMaintenanceAssets] = useState<MaintenanceAssetItem[]>([]);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Data Loaders
  // ---------------------------------------------------------------------------
  const handleWarehouseChange = useCallback(
    async (newId: string, forceRefresh?: boolean) => {
      setSelectedWarehouseId(newId);
      setIsLoadingWarehouse(true);
      try {
        const activeOrgId = currentOrganization?.id || user?.organizationId;
        const updated = await getStorekeeperOperations(newId, activeOrgId, forceRefresh);
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
    },
    [currentOrganization, user]
  );

  const loadInTransitFleet = useCallback(async () => {
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
  }, [currentOrganization, user]);

  const loadMaintenanceAssets = useCallback(async () => {
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
  }, [currentOrganization, user]);

  const loadChiefInbox = useCallback(async () => {
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

  const loadSiteStorekeeperData = useCallback(async (whId: string) => {
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

  const loadIncomingTransfers = useCallback(async (whId: string) => {
    try {
      const list = await getIncomingInTransitTransfersAction(whId);
      setIncomingTransfers(list);
    } catch (err) {
      console.warn('Error loading incoming transfers:', err);
    }
  }, []);

  const loadPendingTransfers = useCallback(async () => {
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

  // Initial and reactive effects
  useEffect(() => {
    void loadInTransitFleet();
    void loadMaintenanceAssets();
    if (isChiefOperations || isGeneralManager) {
      void loadChiefInbox();
      void loadPendingTransfers();
    }
    void loadSiteStorekeeperData(selectedWarehouseId);
    void loadIncomingTransfers(selectedWarehouseId);
  }, [
    isChiefOperations,
    isGeneralManager,
    selectedWarehouseId,
    loadChiefInbox,
    loadPendingTransfers,
    loadSiteStorekeeperData,
    loadIncomingTransfers,
    loadInTransitFleet,
    loadMaintenanceAssets,
  ]);

  // Sync warehouse for storekeeper if scoped
  useEffect(() => {
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

  // Open Tool Passport Modal
  const handleOpenPassport = useCallback(
    async (qrCode: string, fallbackItem?: unknown) => {
      const clean = qrCode?.trim();
      if (!clean && !fallbackItem) return;

      const fb = (fallbackItem && typeof fallbackItem === 'object' ? fallbackItem : {}) as Record<string, unknown>;

      if (fallbackItem) {
        const itemObj: ScannedAssetDetails = {
          id: String(fb.assetId || fb.id || ''),
          qrCode: clean || String(fb.qrCode || fb.tag_number || ''),
          name: String(fb.toolName || fb.name || 'כלי עבודה'),
          toolName: String(fb.toolName || fb.name || 'כלי עבודה'),
          brand: String(fb.brand || 'MAGMA'),
          modelNumber: fb.modelNumber ? String(fb.modelNumber) : fb.model ? String(fb.model) : null,
          status: (fb.status as 'available' | 'checked_out' | 'maintenance' | 'retired') || 'available',
          condition: (fb.condition as 'excellent' | 'good' | 'needs_repair' | 'retired') || 'good',
          warehouseName: String(fb.warehouseName || 'מתקן כללי'),
          warehouseCode: 'WH',
          currentWarehouseId: String(fb.currentWarehouseId || fb.warehouseId || selectedWarehouseId || ''),
          currentAssignedWorker: fb.workerName
            ? String(fb.workerName)
            : fb.currentAssignedWorker
            ? String(fb.currentAssignedWorker)
            : null,
          version: 1,
        };
        setPassportAsset(itemObj);
        setIsPassportOpen(true);
      }

      try {
        const activeOrgId = currentOrganization?.id || user?.organizationId;
        let asset = await getAssetDetailsByQr(clean || String(fb.qrCode || ''), undefined, activeOrgId);

        if (!asset && clean) {
          const norm = normalizeFieldTag(clean);
          if (norm.success && norm.rawDigits) {
            const zrTag = `ZR-${norm.rawDigits}`;
            if (clean !== zrTag) {
              asset = await getAssetDetailsByQr(zrTag, undefined, activeOrgId);
            }
            if (!asset && clean !== norm.rawDigits) {
              asset = await getAssetDetailsByQr(norm.rawDigits, undefined, activeOrgId);
            }
          }
        }

        if (asset) {
          setPassportAsset(asset);
          setIsPassportOpen(true);
        }
      } catch (err) {
        console.warn('Error fetching tool passport:', err);
      }
    },
    [currentOrganization, user, selectedWarehouseId]
  );

  // ---------------------------------------------------------------------------
  // Action Handlers for Tab 2 (Transfers)
  // ---------------------------------------------------------------------------
  const handleConfirmArrivalFleet = async (item: InTransitFleetItem) => {
    setOperatingFleetAssetId(item.assetId);
    setFleetOperationType('receive');

    try {
      const res = await completeTransferReceptionAction({
        assetId: item.assetId,
        qrCode: item.qrCode,
        targetWarehouseId: item.destinationWarehouseId,
        notes: `אישור הגעה וקליטת ציוד ${item.toolName} (${item.qrCode})`,
        requestId: item.requestId,
      });

      if (!res.success) {
        alert(`שגיאה בקליטת הציוד: ${res.error || 'שגיאה לא ידועה'}`);
        return;
      }

      setInTransitFleet((prev) => prev.filter((f) => f.assetId !== item.assetId && f.id !== item.id));

      if (selectedWarehouseId === item.destinationWarehouseId || selectedWarehouseId === 'all') {
        setData((prev) => ({
          ...prev,
          availableCount: (prev.availableCount || 0) + 1,
        }));
      }

      router.refresh();
      await loadInTransitFleet();
      await loadIncomingTransfers(selectedWarehouseId);
      await handleWarehouseChange(selectedWarehouseId, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      alert(`שגיאה בקליטת הציוד: ${msg}`);
      await loadInTransitFleet();
    } finally {
      setOperatingFleetAssetId(null);
      setFleetOperationType(null);
    }
  };

  const handleCancelTransferFleet = async (item: InTransitFleetItem) => {
    setOperatingFleetAssetId(item.assetId);
    setFleetOperationType('cancel');

    try {
      const res = await cancelTransferRollbackAction({
        assetId: item.assetId,
        qrCode: item.qrCode,
        sourceWarehouseId: item.originWarehouseId,
        notes: `ביטול שינוע והחזרת כלי ${item.toolName} (${item.qrCode}) למחסן מקור`,
        requestId: item.requestId,
      });

      if (!res.success) {
        alert(`שגיאה בביטול השינוע: ${res.error || 'שגיאה לא ידועה'}`);
        return;
      }

      setInTransitFleet((prev) => prev.filter((f) => f.assetId !== item.assetId && f.id !== item.id));

      if (selectedWarehouseId === item.originWarehouseId || selectedWarehouseId === 'all') {
        setData((prev) => ({
          ...prev,
          availableCount: (prev.availableCount || 0) + 1,
        }));
      }

      router.refresh();
      await loadInTransitFleet();
      await loadIncomingTransfers(selectedWarehouseId);
      await handleWarehouseChange(selectedWarehouseId, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      alert(`שגיאה בביטול השינוע: ${msg}`);
      await loadInTransitFleet();
    } finally {
      setOperatingFleetAssetId(null);
      setFleetOperationType(null);
    }
  };

  const handleCompleteReception = async (req: PendingTransferItem) => {
    setReceivingTransferId(req.id);
    try {
      const res = await completeTransferReceptionAction({
        assetId: req.assetId,
        qrCode: req.qrCode,
        tagNumber: req.tagNumber || undefined,
        targetWarehouseId: req.targetWarehouseId,
        requestId: req.id,
      });
      if (!res.success) {
        alert(`שגיאה בביצוע הפעולה: ${res.error || 'שגיאה בקליטת הציוד'}`);
        return;
      }

      setIncomingTransfers((prev) => prev.filter((item) => item.id !== req.id));
      if (selectedWarehouseId === req.targetWarehouseId || selectedWarehouseId === 'all') {
        setData((prev) => ({
          ...prev,
          availableCount: (prev.availableCount || 0) + 1,
        }));
      }

      router.refresh();
      await handleWarehouseChange(selectedWarehouseId, true);
      await loadIncomingTransfers(selectedWarehouseId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בקליטת הציוד';
      alert(`שגיאה בביצוע הפעולה: ${msg}`);
    } finally {
      setReceivingTransferId(null);
    }
  };

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
        setSiteRequestsInbox((prev) => prev.filter((r) => r.id !== requestId));
        router.refresh();
        await loadChiefInbox();
        if (selectedWarehouseId !== 'all') {
          await loadSiteStorekeeperData(selectedWarehouseId);
        }
      } else {
        alert(res.error || 'שגיאה בעדכון הבקשה');
        setInboxFeedback({ text: res.error || 'שגיאה בעדכון הבקשה', type: 'error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת';
      alert(msg);
      setInboxFeedback({ text: msg, type: 'error' });
    } finally {
      setIsResolvingRequestId(null);
    }
  };

  const handleConfirmSiteReception = async (req: SiteToolRequestItem) => {
    if (!req.assignedAssetId) return;
    setReceivingSiteRequestId(req.id);
    setSiteActionFeedback(null);
    try {
      const res = await confirmToolReceptionAction(
        req.id,
        req.assignedAssetId,
        selectedWarehouseId !== 'all' ? selectedWarehouseId : (assignedWarehouseId || '')
      );
      if (res.success) {
        setSiteActionFeedback({ text: res.message || 'הכלי נקלט בהצלחה במחסן האתר!', type: 'success' });
        setSiteIncomingShipments((prev) => prev.filter((s) => s.id !== req.id));
        router.refresh();
        await loadSiteStorekeeperData(selectedWarehouseId);
        await handleWarehouseChange(selectedWarehouseId);
      } else {
        alert(res.error || 'שגיאה בקליטת הכלי');
        setSiteActionFeedback({ text: res.error || 'שגיאה בקליטת הכלי', type: 'error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאת תקשורת';
      alert(msg);
      setSiteActionFeedback({ text: msg, type: 'error' });
    } finally {
      setReceivingSiteRequestId(null);
    }
  };

  const handleApproveTransfer = async (requestId: string) => {
    setDecidingTransferId(requestId);
    setTransferApprovalFeedback(null);
    try {
      const res = await decideTransferRequestAction(requestId, 'APPROVED');
      if (res.success) {
        setPendingTransfers((prev) => prev.filter((r) => r.id !== requestId));
        setTransferApprovalFeedback({
          text: res.message || 'בקשת ההעברה אושרה והכלי עודכן בסטטוס בשינוע (in_transit)',
          type: 'success',
        });
        await loadPendingTransfers();
        await loadIncomingTransfers(selectedWarehouseId);
      } else {
        alert(`שגיאה באישור העברה: ${res.error || 'נסה שוב'}`);
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
        setPendingTransfers((prev) => prev.filter((r) => r.id !== requestId));
        setTransferApprovalFeedback({
          text: res.message || 'בקשת ההעברה נדחתה',
          type: 'success',
        });
        setRejectingTransferId(null);
        setRejectionReasonInput('');
        await loadPendingTransfers();
      } else {
        alert(`שגיאה בדחיית העברה: ${res.error || 'נסה שוב'}`);
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

  // ---------------------------------------------------------------------------
  // Action Handlers for Modals
  // ---------------------------------------------------------------------------
  const handleQuickCheckoutSuccess = (checkedOutAsset: {
    id: string;
    toolName: string;
    brand: string;
    modelNumber: string | null;
    qrCode: string;
    workerName: string;
    workerPhone: string | null;
    expectedReturnDate: string | null;
    checkoutNotes: string | null;
  }) => {
    const newLoan: StorekeeperActiveLoan = {
      assetId: checkedOutAsset.id,
      toolName: checkedOutAsset.toolName,
      brand: checkedOutAsset.brand,
      modelNumber: checkedOutAsset.modelNumber || null,
      qrCode: checkedOutAsset.qrCode || '',
      workerName: checkedOutAsset.workerName,
      workerPhone: checkedOutAsset.workerPhone || null,
      expectedReturnDate: checkedOutAsset.expectedReturnDate || null,
      checkedOutAt: new Date().toISOString(),
      checkoutNote: checkedOutAsset.checkoutNotes || null,
      daysActive: 0,
    };

    setData((prev) => ({
      ...prev,
      availableCount: Math.max(0, (prev.availableCount || 1) - 1),
      checkedOutCount: (prev.checkedOutCount || 0) + 1,
      activeLoans: prev.activeLoans
        ? [newLoan, ...prev.activeLoans.filter((l) => l.assetId !== checkedOutAsset.id)]
        : [newLoan],
      returnsDueToday: (prev.returnsDueToday || []).filter((r) => r.assetId !== checkedOutAsset.id),
      overdueAssets: (prev.overdueAssets || []).filter((o) => o.assetId !== checkedOutAsset.id),
    }));

    setAvailableAssetsForInbox((prev) => prev.filter((a) => a.id !== checkedOutAsset.id));
    router.refresh();
    void handleWarehouseChange(selectedWarehouseId, true);
  };

  const handleManualCheckinSuccess = (returned: unknown) => {
    if (returned && typeof returned === 'object') {
      const ret = returned as Record<string, unknown>;
      const assetId = String(ret.id || '');
      const isMaintenance = ret.status === 'maintenance';
      setData((prev) => ({
        ...prev,
        availableCount: (prev.availableCount || 0) + (isMaintenance ? 0 : 1),
        checkedOutCount: Math.max(0, (prev.checkedOutCount || 1) - 1),
        activeLoans: (prev.activeLoans || []).filter((l) => l.assetId !== assetId),
        returnsDueToday: (prev.returnsDueToday || []).filter((r) => r.assetId !== assetId),
        overdueAssets: (prev.overdueAssets || []).filter((o) => o.assetId !== assetId),
      }));
    }
    router.refresh();
    void handleWarehouseChange(selectedWarehouseId, true);
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
      warehouseSelector={
        warehouses && warehouses.length > 0 ? (
          <div className="relative">
            <select
              value={selectedWarehouseId}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              disabled={isLoadingWarehouse || (isStorekeeper && !!assignedWarehouseId)}
              className="w-full h-8 text-[11px] font-black px-2 pr-5 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-950 focus:border-blue-600 focus:outline-none appearance-none truncate cursor-pointer shadow-2xs"
            >
              <option value="all">כלל המחסנים</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 text-[9px]">
              ▼
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-5 space-y-4 sm:space-y-6">
        {/* ========================================================================= */}
        {/* TOP STICKY BAR: WAREHOUSE SELECTOR + 4 COMPACT KPIS + 4-TAB NAVIGATION     */}
        {/* ========================================================================= */}
        <div className="sticky top-12 sm:top-[52px] z-30 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm rounded-2xl p-2.5 sm:p-3 space-y-2.5 print:hidden transition-all">
          {/* Top Row: Active Warehouse Selector & 4 Compact KPI Badges */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            {/* Warehouse Selector */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                  isChiefOperations
                    ? 'bg-indigo-700 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500">מחסן / אתר פעיל:</span>
                  {isStorekeeper && !!assignedWarehouseId && (
                    <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                      מורשה בלבד
                    </span>
                  )}
                  {canSwitchDepots && (
                    <span className="text-[9px] font-bold text-indigo-800 bg-indigo-50 px-1 py-0.2 rounded border border-indigo-200">
                      🌐 רב-אתרי
                    </span>
                  )}
                </div>
                <div className="relative inline-block mt-0.5">
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => handleWarehouseChange(e.target.value)}
                    disabled={isLoadingWarehouse || (isStorekeeper && !!assignedWarehouseId)}
                    className={`border-2 text-xs sm:text-sm font-black rounded-xl pr-2.5 pl-7 py-1 focus:outline-none appearance-none ${
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
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  ) : (
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">
                      ▼
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4 Compact Mobile-First KPI Badges */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1 md:max-w-md">
              {/* KPI 1: Available */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-1.5 text-center">
                <span className="text-[10px] font-bold text-emerald-800 block truncate flex items-center justify-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  זמינים
                </span>
                <span className="text-sm sm:text-base font-black text-emerald-950 font-mono">
                  {data.availableCount}
                </span>
              </div>

              {/* KPI 2: Checked Out */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-1.5 text-center">
                <span className="text-[10px] font-bold text-blue-800 block truncate flex items-center justify-center gap-0.5">
                  <Clock className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                  בשטח
                </span>
                <span className="text-sm sm:text-base font-black text-blue-950 font-mono">
                  {data.checkedOutCount}
                </span>
              </div>

              {/* KPI 3: Overdue */}
              <div className={`rounded-xl p-1.5 text-center border ${
                data.overdueAssets.length > 0
                  ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <span className={`text-[10px] font-bold block truncate flex items-center justify-center gap-0.5 ${
                  data.overdueAssets.length > 0 ? 'text-rose-800' : 'text-slate-500'
                }`}>
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  באיחור
                </span>
                <span className="text-sm sm:text-base font-black font-mono">
                  {data.overdueAssets.length}
                </span>
              </div>

              {/* KPI 4: Quarantined */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-1.5 text-center">
                <span className="text-[10px] font-bold text-amber-800 block truncate flex items-center justify-center gap-0.5">
                  <Wrench className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  בתיקון
                </span>
                <span className="text-sm sm:text-base font-black text-amber-950 font-mono">
                  {data.quarantinedCount}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Tab Navigation Architecture */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100">
            {/* Tab 1: ⚡ תפעול שוטף */}
            <button
              type="button"
              onClick={() => setActiveTab('operations')}
              className={`shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'operations'
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/20'
                  : 'text-slate-600 hover:text-blue-900 hover:bg-white/60'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'operations' ? 'text-amber-300' : 'text-blue-600'}`} />
              <span>⚡ תפעול שוטף</span>
              {data.overdueAssets.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                  activeTab === 'operations'
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-rose-100 text-rose-900 border border-rose-200'
                }`}>
                  {data.overdueAssets.length}
                </span>
              )}
            </button>

            {/* Tab 2: 🚚 שינוע ובקשות שטח */}
            <button
              type="button"
              onClick={() => setActiveTab('transfers')}
              className={`shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'transfers'
                  ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-600/20'
                  : 'text-slate-600 hover:text-sky-900 hover:bg-white/60'
              }`}
            >
              <Truck className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'transfers' ? 'text-white' : 'text-sky-600'}`} />
              <span>🚚 שינוע ובקשות שטח</span>
              {(inTransitFleet.length + incomingTransfers.length + pendingTransfers.length + mySiteRequests.length) > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                  activeTab === 'transfers'
                    ? 'bg-sky-900/80 text-sky-100'
                    : 'bg-sky-100 text-sky-900 border border-sky-200'
                }`}>
                  {inTransitFleet.length + incomingTransfers.length + pendingTransfers.length + mySiteRequests.length}
                </span>
              )}
            </button>

            {/* Tab 3: 🔧 מרכז אחזקה ותיקונים */}
            <button
              type="button"
              onClick={() => setActiveTab('maintenance')}
              className={`shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'maintenance'
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-600/20'
                  : 'text-slate-600 hover:text-amber-900 hover:bg-white/60'
              }`}
            >
              <Wrench className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'maintenance' ? 'text-white' : 'text-amber-600'}`} />
              <span>🔧 מרכז אחזקה ותיקונים</span>
              {maintenanceAssets.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                  activeTab === 'maintenance'
                    ? 'bg-amber-900/80 text-amber-100'
                    : 'bg-amber-100 text-amber-900 border border-amber-200'
                }`}>
                  {maintenanceAssets.length}
                </span>
              )}
            </button>

            {/* Tab 4: 📝 מרכז הערות ותיעוד */}
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-black transition-all cursor-pointer ${
                activeTab === 'notes'
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-600/20'
                  : 'text-slate-600 hover:text-indigo-900 hover:bg-white/60'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'notes' ? 'text-white' : 'text-indigo-600'}`} />
              <span>📝 מרכז הערות ותיעוד</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: ⚡ תפעול שוטף (DAILY OPERATIONS)                                    */}
        {/* ========================================================================= */}
        {activeTab === 'operations' && (
          <WarehouseDailyOperationsTab
            data={data}
            selectedWarehouseId={selectedWarehouseId}
            isPassportOpen={isPassportOpen}
            onOpenCheckout={() => setIsCheckoutModalOpen(true)}
            onOpenCheckin={(assetId) => {
              setCheckinPreselectedAssetId(assetId || null);
              setIsCheckinModalOpen(true);
            }}
            onOpenPassport={handleOpenPassport}
            organizationId={currentOrganization?.id || user?.organizationId}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 🚚 שינוע ובקשות שטח (TRANSFERS & FIELD LOGISTICS)                   */}
        {/* ========================================================================= */}
        {activeTab === 'transfers' && (
          <WarehouseTransfersTab
            isChiefOperations={isChiefOperations}
            isGeneralManager={isGeneralManager}
            isStorekeeper={isStorekeeper}
            onOpenSiteRequestModal={() => setIsSiteRequestModalOpen(true)}
            onOpenTransferRequestModal={() => setIsTransferRequestModalOpen(true)}
            onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
            inTransitFleet={inTransitFleet}
            isLoadingInTransit={isLoadingInTransit}
            onRefreshInTransitFleet={loadInTransitFleet}
            operatingFleetAssetId={operatingFleetAssetId}
            fleetOperationType={fleetOperationType}
            onConfirmArrivalFleet={handleConfirmArrivalFleet}
            onCancelTransferFleet={handleCancelTransferFleet}
            incomingTransfers={incomingTransfers}
            receivingTransferId={receivingTransferId}
            onCompleteReception={handleCompleteReception}
            siteRequestsInbox={siteRequestsInbox}
            isLoadingInbox={isLoadingInbox}
            inboxFeedback={inboxFeedback}
            setInboxFeedback={setInboxFeedback}
            availableAssetsForInbox={availableAssetsForInbox}
            selectedAssetForRequest={selectedAssetForRequest}
            setSelectedAssetForRequest={setSelectedAssetForRequest}
            rejectingSiteRequestId={rejectingSiteRequestId}
            setRejectingSiteRequestId={setRejectingSiteRequestId}
            rejectReasonInput={rejectReasonInput}
            setRejectReasonInput={setRejectReasonInput}
            isResolvingRequestId={isResolvingRequestId}
            onResolveSiteRequest={handleResolveSiteRequest}
            pendingTransfers={pendingTransfers}
            isLoadingTransfers={isLoadingTransfers}
            transferApprovalFeedback={transferApprovalFeedback}
            setTransferApprovalFeedback={setTransferApprovalFeedback}
            rejectingTransferId={rejectingTransferId}
            setRejectingTransferId={setRejectingTransferId}
            rejectionReasonInput={rejectionReasonInput}
            setRejectionReasonInput={setRejectionReasonInput}
            decidingTransferId={decidingTransferId}
            onApproveTransfer={handleApproveTransfer}
            onRejectTransfer={handleRejectTransfer}
            onRefreshPendingTransfers={loadPendingTransfers}
            siteIncomingShipments={siteIncomingShipments}
            mySiteRequests={mySiteRequests}
            isLoadingSiteData={isLoadingSiteData}
            onRefreshSiteData={() => loadSiteStorekeeperData(selectedWarehouseId)}
            receivingSiteRequestId={receivingSiteRequestId}
            siteActionFeedback={siteActionFeedback}
            setSiteActionFeedback={setSiteActionFeedback}
            onConfirmSiteReception={handleConfirmSiteReception}
            onOpenPassport={handleOpenPassport}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 🔧 מרכז אחזקה ותיקונים (CENTRAL MAINTENANCE & REPAIRS)              */}
        {/* ========================================================================= */}
        {activeTab === 'maintenance' && (
          <WarehouseMaintenanceTab
            maintenanceAssets={maintenanceAssets}
            isLoadingMaintenance={isLoadingMaintenance}
            onRefreshMaintenance={loadMaintenanceAssets}
            onOpenPassport={(qrCode, asset) => handleOpenPassport(qrCode, asset)}
            onOpenRepairModal={(asset) => setRepairModalAsset(asset)}
            onOpenRetireModal={(asset) => setRetireModalAsset(asset)}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 📝 מרכז הערות ותיעוד (FIELD NOTES & FEED)                           */}
        {/* ========================================================================= */}
        {activeTab === 'notes' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <ChiefNotesFeedView
              warehouses={data.allWarehouses || data.warehouses}
              onOpenPassport={handleOpenPassport}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALS & DIALOGS                                                          */}
      {/* ========================================================================= */}

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

      {/* EQUIPMENT RETURN & CHECK-IN MODAL */}
      <ManualCheckinModal
        isOpen={isCheckinModalOpen}
        onClose={() => {
          setIsCheckinModalOpen(false);
          setCheckinPreselectedAssetId(null);
        }}
        warehouseId={selectedWarehouseId}
        preSelectedAssetId={checkinPreselectedAssetId}
        onSuccess={handleManualCheckinSuccess}
      />

      {/* QUICK CHECKOUT TO WORKER MODAL */}
      <QuickCheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        selectedWarehouseId={selectedWarehouseId}
        organizationId={currentOrganization?.id || user?.organizationId}
        onSuccess={handleQuickCheckoutSuccess}
      />

      {/* CHIEF OPERATIONS: INTER-DEPOT ASSET TRANSFER MODAL */}
      <InterDepotTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        onSuccess={async () => {
          router.refresh();
          await handleWarehouseChange(selectedWarehouseId);
        }}
      />

      {/* CHIEF OPERATIONS: STOCK RECONCILIATION MODAL */}
      <StockReconciliationModal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        warehouse={data.warehouse}
        availableCount={data.availableCount}
        checkedOutCount={data.checkedOutCount}
        quarantinedCount={data.quarantinedCount}
        verifiedAssetIds={(data.overdueAssets || []).map((a) => a.assetId)}
        onSuccess={async () => {
          router.refresh();
        }}
      />

      {/* STOREKEEPER: INTER-SITE EQUIPMENT TRANSFER REQUEST MODAL */}
      <InterSiteTransferRequestModal
        isOpen={isTransferRequestModalOpen}
        onClose={() => setIsTransferRequestModalOpen(false)}
        warehouses={warehouses}
        currentWarehouseId={selectedWarehouseId}
        onSuccess={async () => {
          router.refresh();
          await loadPendingTransfers();
        }}
      />

      {/* STOREKEEPER: DIRECT OUTBOUND EQUIPMENT TRANSFER MODAL */}
      <DirectTransferModal
        isOpen={isDirectTransferModalOpen}
        onClose={() => setIsDirectTransferModalOpen(false)}
        selectedWarehouseId={selectedWarehouseId}
        sourceWarehouseName={data.warehouse?.name}
        warehouses={warehouses}
        onSuccess={async (_assetId) => {
          setData((prev) => ({
            ...prev,
            availableCount: Math.max(0, (prev.availableCount || 1) - 1),
          }));
          router.refresh();
          await handleWarehouseChange(selectedWarehouseId);
          if (isChiefOperations || isGeneralManager) {
            await loadInTransitFleet();
          }
          await loadIncomingTransfers(selectedWarehouseId);
        }}
      />

      {/* CHIEF OPERATIONS: SITE DISPATCH WITH TAG VERIFICATION & SIGNATURE */}
      <ResolveToolRequestModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        selectedWarehouseId={selectedWarehouseId}
        warehouses={warehouses}
        organizationId={currentOrganization?.id || user?.organizationId}
        onSuccess={async (_dispatchedAssetId) => {
          router.refresh();
          await handleWarehouseChange(selectedWarehouseId, true);
        }}
      />

      {/* SITE STOREKEEPER: SITE TOOL REQUISITION REQUEST MODAL */}
      <SiteToolRequestModal
        isOpen={isSiteRequestModalOpen}
        onClose={() => setIsSiteRequestModalOpen(false)}
        requestingWarehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : assignedWarehouseId}
        onSuccess={async () => {
          router.refresh();
          await loadSiteStorekeeperData(selectedWarehouseId);
          if (isChiefOperations || isGeneralManager) {
            await loadChiefInbox();
          }
        }}
      />

      {/* CENTRAL MAINTENANCE: RETURN FROM REPAIR MODAL */}
      <RepairReturnModal
        asset={repairModalAsset}
        isOpen={!!repairModalAsset}
        onClose={() => setRepairModalAsset(null)}
        warehouses={warehouses}
        defaultWarehouseId={selectedWarehouseId !== 'all' ? selectedWarehouseId : undefined}
        onSuccess={async () => {
          router.refresh();
          await loadMaintenanceAssets();
          await handleWarehouseChange(selectedWarehouseId);
        }}
      />

      {/* CENTRAL MAINTENANCE: SCRAP & RETIRE ASSET MODAL */}
      <ScrapRetireModal
        asset={retireModalAsset}
        isOpen={!!retireModalAsset}
        onClose={() => setRetireModalAsset(null)}
        onSuccess={async () => {
          router.refresh();
          await loadMaintenanceAssets();
          await handleWarehouseChange(selectedWarehouseId);
        }}
      />
    </AppLayout>
  );
}
