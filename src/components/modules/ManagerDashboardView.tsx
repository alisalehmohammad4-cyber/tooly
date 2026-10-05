'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Wrench,
  Building2,
  Calendar,
  Phone,
  FileSpreadsheet,
  Printer,
  Search,
  AlertTriangle,
  Users,
  UserPlus,
  CheckCircle2,
  Check,
  X,
  Loader2,
  ShieldCheck,
  UserCheck,
  Container,
  Truck,
  ArrowLeftRight,
  MapPin,
  Pencil,
  Trash2,
  Plus,
  TrendingDown,
  FileText,
  Package,
  Layers,
  Eye,
  Crown,
  Activity,
  Flame,
  Anchor,
  Clock,
  Sparkles,
  Factory,
  Scissors,
  PieChart,
  Mail,
} from 'lucide-react';
import Link from 'next/link';
import type { PlantManagerAnalyticsPayload } from '@/app/actions/dashboard';
import type { AppUser, Organization } from '@/types/domain';
import type { WarehouseAdminItem } from '@/lib/mockStore';
import {
  getStorekeepersListAction,
  createStorekeeperAction,
  updateStorekeeperWarehouseAction,
  updateUserRoleAction,
  toggleUserActiveAction,
  deleteStorekeeperAction,
  resetUserPinAction,
} from '@/app/actions/users';
import {
  getWarehousesAdminAction,
  deleteWarehouseAction,
} from '@/app/actions/warehouses';
import {
  getPendingOrganizationsAction,
  approveOrganizationAction,
  rejectOrganizationAction,
} from '@/app/actions/organizations';

import WarehouseFormModal from '@/components/modules/WarehouseFormModal';
import WarehouseToolsModal from '@/components/modules/WarehouseToolsModal';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { isPlatformSuperAdmin } from '@/lib/auth/superadmin';

interface ManagerDashboardViewProps {
  data: PlantManagerAnalyticsPayload;
}

export default function ManagerDashboardView({ data }: ManagerDashboardViewProps) {
  const { currentOrganization, user, isSuperAdmin: authIsSuperAdmin } = useAuth();
  const isSuperAdmin = authIsSuperAdmin || isPlatformSuperAdmin(user);

  const orgDisplayName = data.organizationName || currentOrganization?.name || 'סאמי זעתות';
  const totalAssetsCount = data.utilization?.totalAssets ?? 0;

  // Main Tab Navigation: Warehouses vs Storekeepers vs Executive BI Analytics
  const [activeTab, setActiveTab] = useState<'warehouses' | 'users' | 'analytics'>('warehouses');

  // Analytics Search Query
  const [searchQuery, setSearchQuery] = useState<string>('');



  // Facilities / Warehouse Management State
  const [warehousesList, setWarehousesList] = useState<WarehouseAdminItem[]>([]);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState<boolean>(false);
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState<boolean>(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseAdminItem | null>(null);
  const [deletingWarehouseId, setDeletingWarehouseId] = useState<string | null>(null);
  const [selectedViewingWarehouse, setSelectedViewingWarehouse] = useState<WarehouseAdminItem | null>(null);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState<boolean>(false);

  // Storekeepers Management State
  const [storekeepers, setStorekeepers] = useState<AppUser[]>([]);
  const [isLoadingStorekeepers, setIsLoadingStorekeepers] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Reset PIN State
  const [resetPinTarget, setResetPinTarget] = useState<AppUser | null>(null);
  const [newPinValue, setNewPinValue] = useState<string>('');
  const [isResettingPin, setIsResettingPin] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // New Enterprise User Form State
  const [newFullName, setNewFullName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPinCode, setNewPinCode] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'storekeeper' | 'chief_operations'>('storekeeper');
  const [newAssignedWarehouseId, setNewAssignedWarehouseId] = useState<string>(
    data.facilityDistribution[0]?.warehouseId || 'wh-main-01'
  );
  const [isSavingUser, setIsSavingUser] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);



  // Accounting Report Modal
  const [isAccountingModalOpen, setIsAccountingModalOpen] = useState<boolean>(false);

  // Synchronized facilities list for dropdowns
  const availableFacilities = useMemo(() => {
    if (warehousesList.length > 0) {
      return warehousesList.map((w) => ({
        warehouseId: w.id,
        warehouseName: w.name,
        warehouseCode: w.code,
      }));
    }
    return data.facilityDistribution;
  }, [warehousesList, data.facilityDistribution]);

  // Pending Organization Approvals State (SuperAdmin / Manager)
  const [pendingOrganizations, setPendingOrganizations] = useState<Organization[]>([]);
  const [isLoadingPendingOrgs, setIsLoadingPendingOrgs] = useState<boolean>(false);
  const [approvingOrgId, setApprovingOrgId] = useState<string | null>(null);
  const [rejectingOrgId, setRejectingOrgId] = useState<string | null>(null);

  // Derived effective warehouse ID for form dropdown
  const effectiveAssignedWarehouseId = useMemo(() => {
    if (newAssignedWarehouseId === 'all') {
      return 'all';
    }
    if (availableFacilities.some((f) => f.warehouseId === newAssignedWarehouseId)) {
      return newAssignedWarehouseId;
    }
    return availableFacilities[0]?.warehouseId || newAssignedWarehouseId || 'all';
  }, [availableFacilities, newAssignedWarehouseId]);

  // Load storekeepers list
  const loadStorekeepers = useCallback(async () => {
    setIsLoadingStorekeepers(true);
    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId || user?.organization_id;
      const list = await getStorekeepersListAction(activeOrgId);
      if (Array.isArray(list)) {
        setStorekeepers(list);
      }
    } catch (err) {
      console.warn('Error loading storekeepers:', err);
    } finally {
      setIsLoadingStorekeepers(false);
    }
  }, [currentOrganization, user]);

  // Load warehouses list
  const loadWarehouses = useCallback(async () => {
    setIsLoadingWarehouses(true);
    try {
      const list = await getWarehousesAdminAction(currentOrganization?.id);
      setWarehousesList(list);
    } catch (err) {
      console.warn('Error loading warehouses:', err);
    } finally {
      setIsLoadingWarehouses(false);
    }
  }, [currentOrganization]);

  // Load pending organizations for SuperAdmin approval only
  const loadPendingOrganizations = useCallback(async () => {
    if (!isPlatformSuperAdmin(user)) {
      setPendingOrganizations([]);
      return;
    }
    setIsLoadingPendingOrgs(true);
    try {
      const res = await getPendingOrganizationsAction();
      if (res.success && Array.isArray(res.organizations)) {
        setPendingOrganizations(res.organizations);
      } else {
        setPendingOrganizations([]);
      }
    } catch (err) {
      console.warn('Error loading pending organizations:', err);
      setPendingOrganizations([]);
    } finally {
      setIsLoadingPendingOrgs(false);
    }
  }, [user]);

  const handleApproveOrganization = async (orgId: string, orgName: string) => {
    if (!isSuperAdmin) return;
    setApprovingOrgId(orgId);
    // Optimistic UI update
    setPendingOrganizations((prev) => prev.filter((o) => o.id !== orgId));
    try {
      const res = await approveOrganizationAction(orgId, user?.id);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || `ארגון "${orgName}" אושר בהצלחה!`,
          type: 'success',
        });
        await loadPendingOrganizations();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה באישור הארגון',
          type: 'error',
        });
        await loadPendingOrganizations();
      }
    } catch {
      setFeedbackMessage({
        text: 'שגיאת רשת באישור הארגון',
        type: 'error',
      });
      await loadPendingOrganizations();
    } finally {
      setApprovingOrgId(null);
    }
  };

  const handleRejectOrganization = async (orgId: string, orgName: string) => {
    if (!isSuperAdmin) return;
    if (!confirm(`האם אתה בטוח שברצונך לדחות את בקשת ההצטרפות של ארגון "${orgName}"?`)) {
      return;
    }
    setRejectingOrgId(orgId);
    // Optimistic UI update
    setPendingOrganizations((prev) => prev.filter((o) => o.id !== orgId));
    try {
      const res = await rejectOrganizationAction(orgId);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || `בקשת הארגון "${orgName}" נדחתה.`,
          type: 'success',
        });
        await loadPendingOrganizations();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בדחיית הארגון',
          type: 'error',
        });
        await loadPendingOrganizations();
      }
    } catch {
      setFeedbackMessage({
        text: 'שגיאת רשת בדחיית הארגון',
        type: 'error',
      });
      await loadPendingOrganizations();
    } finally {
      setRejectingOrgId(null);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      void loadPendingOrganizations();
    } else {
      setPendingOrganizations([]);
    }
  }, [isSuperAdmin, loadPendingOrganizations]);

  // Fetch data whenever tabs change or on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'users') {
        void loadStorekeepers();
        void loadWarehouses();
      } else if (activeTab === 'warehouses') {
        void loadWarehouses();
        void loadStorekeepers();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, loadStorekeepers, loadWarehouses]);

  // Handle warehouse deletion with strict safety check & optimistic UI update
  const handleDeleteWarehouse = async (target: string | WarehouseAdminItem) => {
    const id = typeof target === 'string' ? target : target.id;
    const wh =
      typeof target === 'string'
        ? warehousesList.find((w) => w.id === id || w.code === id)
        : target;

    if (wh && wh.toolCount > 0) {
      setFeedbackMessage({
        text: 'לא ניתן למחוק מחסן המכיל כלי עבודה פעילים. יש להעביר את הכלים תחילה',
        type: 'error',
      });
      return;
    }

    const displayName = wh?.name ? `"${wh.name}" (${wh.code})` : 'המבוקש';
    if (
      !confirm(
        `האם אתה בטוח שברצונך למחוק את המחסן ${displayName}? פעולה זו אינה ניתנת לביטול.`
      )
    ) {
      return;
    }

    setDeletingWarehouseId(id);
    try {
      const res = await deleteWarehouseAction(id);
      if (res.success) {
        // Optimistic UI update: immediately filter out the deleted warehouse from the local state list
        setWarehousesList((prev) =>
          prev.filter((w) => w.id !== id && (!wh?.code || w.code !== wh.code))
        );
        setFeedbackMessage({
          text: res.message || 'המחסן הוסר בהצלחה מהמערכת.',
          type: 'success',
        });
        await loadWarehouses();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה במחיקת המחסן',
          type: 'error',
        });
      }
    } catch {
      setFeedbackMessage({
        text: 'שגיאת רשת במחיקת המחסן',
        type: 'error',
      });
    } finally {
      setDeletingWarehouseId(null);
    }
  };

  // Handle storekeeper deletion
  const handleDeleteStorekeeper = async (user: AppUser) => {
    if (
      user.id === 'usr-gm-01' ||
      user.username?.toLowerCase() === 'zatout01' ||
      user.role === 'general_manager'
    ) {
      setFeedbackMessage({
        text: 'לא ניתן למחוק את משתמש מנהל המערכת הראשי.',
        type: 'error',
      });
      return;
    }

    if (
      !confirm(
        `האם אתה בטוח שברצונך למחוק את המשתמש "${user.fullName}" (${user.username || 'ללא שם משתמש'}) לצמיתות מהמערכת? פעולה זו אינה ניתנת לביטול.`
      )
    ) {
      return;
    }

    try {
      // Optimistically remove from UI
      setStorekeepers((prev) => prev.filter((u) => u.id !== user.id));

      const res = await deleteStorekeeperAction(user.id);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'המשתמש הוסר בהצלחה מהמערכת.',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה במחיקת המשתמש.',
          type: 'error',
        });
        await loadStorekeepers();
      }
    } catch {
      setFeedbackMessage({
        text: 'שגיאת רשת במחיקת המשתמש.',
        type: 'error',
      });
      await loadStorekeepers();
    }
  };

  // Handle warehouse reassignment
  const handleWarehouseReassign = async (userId: string, newWarehouseId: string) => {
    try {
      const wh = availableFacilities.find((f) => f.warehouseId === newWarehouseId);
      setStorekeepers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                assignedWarehouseId: newWarehouseId,
                assignedWarehouseName: wh?.warehouseName || u.assignedWarehouseName,
              }
            : u
        )
      );

      const res = await updateStorekeeperWarehouseAction(userId, newWarehouseId);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'שיוך המחסן עודכן בהצלחה',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בעדכון שיוך המחסן',
          type: 'error',
        });
        await loadStorekeepers();
      }
    } catch {
      setFeedbackMessage({ text: 'שגיאה בעדכון שיוך המחסן', type: 'error' });
      await loadStorekeepers();
    }
  };

  // Handle user active toggle
  const handleToggleActive = async (userId: string, currentStatus?: boolean) => {
    const newStatus = !(currentStatus ?? true);
    try {
      setStorekeepers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive: newStatus } : u))
      );

      const res = await toggleUserActiveAction(userId, newStatus);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'סטטוס המשתמש עודכן',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בעדכון סטטוס המשתמש',
          type: 'error',
        });
        await loadStorekeepers();
      }
    } catch {
      setFeedbackMessage({ text: 'שגיאה בעדכון סטטוס המשתמש', type: 'error' });
    }
  };

  // Handle secure PIN reset
  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinTarget) return;
    if (!newPinValue || newPinValue.trim().length < 4) {
      setPinError('קוד כניסה (PIN) חייב להכיל לפחות 4 ספרות.');
      return;
    }
    setIsResettingPin(true);
    setPinError(null);
    try {
      const res = await resetUserPinAction(resetPinTarget.id, newPinValue.trim());
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'קוד ה-PIN עודכן בהצלחה.',
          type: 'success',
        });
        setResetPinTarget(null);
        setNewPinValue('');
        await loadStorekeepers();
      } else {
        setPinError(res.error || 'שגיאה באיפוס קוד PIN.');
      }
    } catch {
      setPinError('שגיאת תקשורת באיפוס קוד PIN.');
    } finally {
      setIsResettingPin(false);
    }
  };

  // Handle create new storekeeper or chief operations
  const handleCreateStorekeeper = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSavingUser(true);

    try {
      const activeOrgId = currentOrganization?.id || user?.organizationId || user?.organization_id;
      const warehouseIdToSend =
        newUserRole === 'chief_operations'
          ? 'all'
          : effectiveAssignedWarehouseId || 'all';

      const res = await createStorekeeperAction({
        name: newFullName,
        fullName: newFullName,
        username: newUsername,
        pin: newPinCode,
        pinCode: newPinCode,
        role: newUserRole,
        warehouseId: warehouseIdToSend,
        assignedWarehouseId: warehouseIdToSend === 'all' ? undefined : warehouseIdToSend,
        email: newEmail,
        phone: newPhone,
        organizationId: activeOrgId,
      });

      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'משתמש תפעול חדש נוצר בהצלחה',
          type: 'success',
        });

        // Immediately append newly created user to local storekeepers state so it displays instantly
        if (res.user) {
          setStorekeepers((prev) => {
            const filtered = prev.filter((u) => u.id !== res.user!.id);
            return [res.user!, ...filtered];
          });
        }

        setNewFullName('');
        setNewUsername('');
        setNewPinCode('');
        setNewEmail('');
        setNewPhone('');
        setNewUserRole('storekeeper');
        setIsAddModalOpen(false);

        // Re-fetch storekeepers list from server to stay 100% in sync
        await loadStorekeepers();
      } else {
        setFormError(res.error || 'שגיאה ביצירת המשתמש');
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'שגיאה ביצירת המשתמש');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Handle role change between Storekeeper and Chief Operations
  const handleRoleChange = async (userId: string, newRole: 'storekeeper' | 'chief_operations') => {
    try {
      const defaultWh = availableFacilities[0]?.warehouseId || 'wh-main-01';
      const res = await updateUserRoleAction(userId, newRole, defaultWh);
      if (res.success) {
        setFeedbackMessage({
          text: res.message || 'תפקיד המשתמש עודכן בהצלחה',
          type: 'success',
        });
        await loadStorekeepers();
      } else {
        setFeedbackMessage({
          text: res.error || 'שגיאה בעדכון תפקיד',
          type: 'error',
        });
      }
    } catch {
      setFeedbackMessage({ text: 'שגיאת רשת בעדכון תפקיד', type: 'error' });
    }
  };

  // Export Full Accounting Valuation & Depreciation to Excel CSV (UTF-8 BOM)
  const handleExportAccountingCsv = () => {
    const headers = [
      'שם הכלי',
      'ברקוד / QR',
      'יצרן',
      'דגם',
      'אתר / מחסן',
      'עלות רכישה (₪)',
      'פחת מצטבר (₪)',
      'ערך נוכחי בספרים (₪)',
      'סטטוס תפעולי',
      'עובד אחראי',
      'טלפון עובד',
      'תאריך בדיקת בטיחות',
    ];

    const rows = (data.highRiskOverdueAssets || []).map((item) => {
      const cost = item.purchaseCost || 1200;
      const deprec = Math.round(cost * 0.3);
      const net = cost - deprec;
      return [
        `"${item.toolName.replace(/"/g, '""')}"`,
        `"${item.qrCode}"`,
        `"${item.brand.replace(/"/g, '""')}"`,
        `"${(item.modelNumber || '').replace(/"/g, '""')}"`,
        `"${item.warehouseName.replace(/"/g, '""')}"`,
        cost,
        deprec,
        net,
        '"בשימוש בשטח"',
        `"${item.workerName.replace(/"/g, '""')}"`,
        `"${item.workerPhone || ''}"`,
        `"${new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}"`,
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `tooly_accounting_valuation_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filter overdue assets
  const filteredOverdue = useMemo(() => {
    if (!searchQuery.trim()) return data.highRiskOverdueAssets;
    const q = searchQuery.toLowerCase().trim();
    return data.highRiskOverdueAssets.filter(
      (item) =>
        item.toolName.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.qrCode.toLowerCase().includes(q) ||
        item.workerName.toLowerCase().includes(q) ||
        (item.workerPhone && item.workerPhone.includes(q)) ||
        item.warehouseName.toLowerCase().includes(q)
    );
  }, [data.highRiskOverdueAssets, searchQuery]);

  // Export Overdue Table to Excel CSV with UTF-8 BOM for proper Hebrew encoding
  const handleExportCsv = () => {
    const headers = [
      'שם הכלי',
      'יצרן',
      'דגם',
      'ברקוד/QR',
      'עובד אחראי',
      'טלפון עובד',
      'אתר שיוך',
      'תאריך החזרה צפוי',
      'ימי איחור',
      'שווי כספי (₪)',
    ];

    const rows = filteredOverdue.map((item) => [
      `"${item.toolName.replace(/"/g, '""')}"`,
      `"${item.brand.replace(/"/g, '""')}"`,
      `"${(item.modelNumber || '').replace(/"/g, '""')}"`,
      `"${item.qrCode}"`,
      `"${item.workerName.replace(/"/g, '""')}"`,
      `"${item.workerPhone || ''}"`,
      `"${item.warehouseName.replace(/"/g, '""')}"`,
      `"${new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}"`,
      item.daysOverdue,
      item.purchaseCost,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `tooly_overdue_report_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Report Handler
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <AppLayout
      title={`Tooly - ${orgDisplayName} (Executive BI)`}
      subtitle="לוח בקרה ניהולי, מדדים פיננסיים ומרכז דוחות"
      requiredRole="general_manager"
    >
      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block p-6 border-b-2 border-slate-900 mb-6 text-center" dir="rtl">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <div className="text-right">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{orgDisplayName} - Tooly</h1>
            <p className="text-xs text-slate-600 font-bold">דוח מאזן ציוד, שווי נכסים ופחת תקופתי לחשבונאות</p>
          </div>
          <div className="text-left text-xs text-slate-500 font-mono">
            <div>תאריך הפקה: {new Date().toLocaleDateString('he-IL')}</div>
            <div>שעה: {new Date().toLocaleTimeString('he-IL')}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center my-4 text-xs font-bold bg-slate-50 p-3 rounded-xl border border-slate-300">
          <div>שווי רכישה כולל: ₪{(data.totalFleetValue ?? 0).toLocaleString()}</div>
          <div>פחת מצטבר: ₪{(data.depreciation?.accumulatedDepreciation ?? 0).toLocaleString()}</div>
          <div>שווי ספרים נקי: ₪{(data.depreciation?.currentBookValue ?? 0).toLocaleString()}</div>
          <div>סה&quot;כ כלים: {totalAssetsCount}</div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-6">
        {/* ============================================================ */}
        {/* SUPERADMIN APPROVAL QUEUE: PENDING ORGANIZATIONS             */}
        {/* ============================================================ */}
        {isSuperAdmin && (
          <section
            className={`rounded-3xl border transition-all print:hidden ${
              pendingOrganizations.length > 0
                ? 'border-amber-300 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white p-5 sm:p-6 shadow-md'
                : 'border-slate-200 bg-white p-4 sm:p-5 shadow-xs'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${
                    pendingOrganizations.length > 0
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      {pendingOrganizations.length > 0
                        ? `🔔 בקשות הצטרפות חדשות לאישור (${pendingOrganizations.length})`
                        : 'אישור ארגונים חדשים (Onboarding Approvals)'}
                    </h3>
                    {pendingOrganizations.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500 text-white font-black px-2.5 py-0.5 rounded-full shadow-xs animate-pulse">
                        <Clock className="w-3 h-3" />
                        {pendingOrganizations.length} ממתינים לאישור
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        הכל מעודכן
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    בקרת הצטרפות ארגונים וסביבות עבודה עצמאיות למערכת Tooly
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadPendingOrganizations}
                disabled={isLoadingPendingOrgs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Activity className={`w-3.5 h-3.5 text-blue-600 ${isLoadingPendingOrgs ? 'animate-spin' : ''}`} />
                <span>רענן רשימה</span>
              </button>
            </div>

            {/* Pending List or Empty State */}
            {pendingOrganizations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {pendingOrganizations.map((org) => {
                  const isApproving = approvingOrgId === org.id;
                  const contactPhone = org.contact_phone || org.contactPhone;
                  const contactEmail = org.contact_email || org.contactEmail;

                  return (
                    <div
                      key={org.id}
                      className="relative bg-white rounded-2xl border border-amber-200/90 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-900 leading-tight">
                                {org.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                                  {org.slug}
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  קידומת: <strong className="font-mono text-slate-700">{org.serialPrefix || 'TOOL-'}</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-200 shrink-0">
                            <Clock className="w-3 h-3 text-amber-700" />
                            ממתין לאישור
                          </span>
                        </div>

                        {/* Contact & Registration Meta */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-700">
                          {contactPhone ? (
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-mono font-medium" dir="ltr">
                                {contactPhone}
                              </span>
                            </div>
                          ) : (
                            <div className="text-slate-400 text-[11px]">ללא טלפון</div>
                          )}

                          {contactEmail ? (
                            <div className="flex items-center gap-2 truncate">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-mono font-medium truncate" dir="ltr">
                                {contactEmail}
                              </span>
                            </div>
                          ) : (
                            <div className="text-slate-400 text-[11px]">ללא אימייל</div>
                          )}

                          {org.created_at && (
                            <div className="sm:col-span-2 text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>
                                תאריך הרשמה: {new Date(org.created_at).toLocaleDateString('he-IL')} בשעה {new Date(org.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isApproving || rejectingOrgId === org.id}
                          onClick={() => handleRejectOrganization(org.id, org.name)}
                          className="py-2 px-3.5 rounded-xl border border-red-300 hover:bg-red-50 text-red-700 disabled:opacity-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        >
                          {rejectingOrgId === org.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                              <span>דוחה...</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3.5 h-3.5 text-red-600" />
                              <span>דחה</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isApproving || rejectingOrgId === org.id}
                          onClick={() => handleApproveOrganization(org.id, org.name)}
                          className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        >
                          {isApproving ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>מאשר...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>אשר ארגון</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 py-2 px-3 text-xs text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>אין כרגע ארגונים הממתינים לאישור. כל בקשות ההצטרפות נבדקו ואושרו.</span>
              </div>
            )}
          </section>
        )}

        {/* Navigation Tab Switcher */}
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar py-1 gap-2 border-b border-slate-200 sm:border sm:border-slate-300 sm:bg-slate-200/80 sm:p-1.5 sm:rounded-2xl print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('warehouses')}
            className={`shrink-0 whitespace-nowrap flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'warehouses'
                ? 'bg-white text-purple-950 shadow-sm border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-purple-600" />
            <span>🏢 ניהול אתרים ומחסנים (Warehouses)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`shrink-0 whitespace-nowrap flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-purple-950 shadow-sm border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-purple-600" />
            <span>👥 ניהול צוות ומחסנאים (Storekeepers)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`shrink-0 whitespace-nowrap flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-purple-950 shadow-sm border border-purple-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span>📊 מדדי BI, פחת ודוחות (Executive BI & Accounting)</span>
          </button>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-red-50 border-red-300 text-red-950'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: ANALYTICS & FLEET METRICS (EXECUTIVE BI COCKPIT)      */}
        {/* ============================================================ */}
        {activeTab === 'analytics' && (
          <div className="bg-slate-50/50 p-4 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-8 animate-in fade-in duration-300">
            {/* Zero State Alert for Live Production */}
            {data.utilization.totalAssets === 0 && (
              <div className="p-6 rounded-2xl bg-amber-50/90 border-2 border-amber-200 text-center space-y-3 shadow-sm">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                  <Package className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-amber-950">
                    אין עדיין כלים רשומים במערכת - התחל בקליטת כלי חדש
                  </h3>
                  <p className="text-xs text-amber-800/90 max-w-md mx-auto">
                    המערכת אופסה למצב ייצור פעיל. קלוט כלי עבודה חדשים כדי להתחיל מעקב מלא, ניהול מלאי והקצאות לשטח.
                  </p>
                </div>
                <div className="pt-1 flex flex-wrap justify-center gap-2">
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
                    <span>צפייה בקטלוג</span>
                  </Link>
                </div>
              </div>
            )}

            {/* EXECUTIVE COCKPIT HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-600 flex items-center justify-center shadow-xs">
                  <Crown className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      לוח בינה עסקית (BI) - {orgDisplayName}
                    </h2>
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live Sync
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">
                    {orgDisplayName} | {totalAssetsCount.toLocaleString()} פריטי ציוד
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 self-start sm:self-auto bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <Activity className="w-4 h-4 text-blue-600" />
                <span>עדכון מאזן שוטף</span>
              </div>
            </div>



            {/* 4 HERO KPI METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Fleet Valuation */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    שווי כולל ורכישה
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    ₪{(data.totalFleetValue ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-black text-emerald-800 bg-emerald-50/80 border border-emerald-200/60 px-2.5 py-1 rounded-lg">
                    <span>ערך נקי בספרים:</span>
                    <span className="font-mono font-bold">₪{(data.depreciation?.currentBookValue ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Fleet Utilization */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    ניצולת ציוד מבצעית
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {data.utilization?.utilizationRate ?? 0}%
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-black text-blue-800 bg-blue-50/80 border border-blue-200/60 px-2.5 py-1 rounded-lg">
                    <span>{(data.utilization?.inUse ?? 0).toLocaleString()} כלים פעילים בשטח מתוך {totalAssetsCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Safety & Readiness */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    מד כשירות ובטיחות
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {data.safetyCompliance?.complianceRate ?? 100}%
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-black text-indigo-800 bg-indigo-50/80 border border-indigo-200/60 px-2.5 py-1 rounded-lg">
                    <span>יחס ציוד תקין, {(data.utilization?.maintenance ?? 0).toLocaleString()} כלים בתהליך שיקום</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Accumulated Depreciation */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    פחת חשבונאי מצטבר
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    ₪{(data.depreciation?.accumulatedDepreciation ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-50/80 border border-amber-200/60 px-2.5 py-1 rounded-lg">
                    <span>פחת שנתי מבוקר לפי תקנות מס</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 EXECUTIVE INFOGRAPHICS (2x2 GRID) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Infographic 1: Operational Readiness Donut Chart */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-emerald-600" />
                      <span>מצב כשירות מבצעי של צי הכלים</span>
                    </h3>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {totalAssetsCount.toLocaleString()} נכסים
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    פילוח סטטוס תפעולי בזמן אמת של כלל כלי העבודה בפריסה ארצית
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-2">
                  {/* SVG Donut */}
                  {(() => {
                    const inUseCount = data.utilization?.inUse ?? 0;
                    const inWarehouseCount = data.utilization?.inWarehouse ?? 0;
                    const maintenanceCount = data.utilization?.maintenance ?? 0;
                    const T = totalAssetsCount;

                    const inUsePct = T > 0 ? inUseCount / T : 0;
                    const inWarehousePct = T > 0 ? inWarehouseCount / T : 0;
                    const maintenancePct = T > 0 ? maintenanceCount / T : 0;

                    const inUseDash = inUsePct * 408.4;
                    const inWarehouseDash = inWarehousePct * 408.4;
                    const maintenanceDash = maintenancePct * 408.4;

                    const readyPct = T > 0 ? Math.round(((T - maintenanceCount) / T) * 100) : 100;

                    return (
                      <>
                        <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
                          <svg className="w-full h-full -rotate-90 origin-center" viewBox="0 0 170 170">
                            {/* Background circle */}
                            <circle
                              cx="85"
                              cy="85"
                              r="65"
                              className="stroke-slate-100"
                              strokeWidth="18"
                              fill="transparent"
                            />
                            {/* Segment 1: Active In-Use */}
                            {inUseDash > 0 && (
                              <circle
                                cx="85"
                                cy="85"
                                r="65"
                                stroke="#10b981"
                                strokeWidth="18"
                                strokeDasharray={`${inUseDash} 408.4`}
                                strokeDashoffset="0"
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-1000"
                              />
                            )}
                            {/* Segment 2: Central Depot Available */}
                            {inWarehouseDash > 0 && (
                              <circle
                                cx="85"
                                cy="85"
                                r="65"
                                stroke="#3b82f6"
                                strokeWidth="18"
                                strokeDasharray={`${inWarehouseDash} 408.4`}
                                strokeDashoffset={`${-inUseDash}`}
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-1000"
                              />
                            )}
                            {/* Segment 3: Maintenance In-Repair */}
                            {maintenanceDash > 0 && (
                              <circle
                                cx="85"
                                cy="85"
                                r="65"
                                stroke="#f43f5e"
                                strokeWidth="18"
                                strokeDasharray={`${maintenanceDash} 408.4`}
                                strokeDashoffset={`${-(inUseDash + inWarehouseDash)}`}
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-1000"
                              />
                            )}
                          </svg>
                          {/* Centered Readout */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-slate-900 leading-none">{readyPct}%</span>
                            <span className="text-[10px] font-black text-slate-500 mt-1">כשיר לפעילות</span>
                          </div>
                        </div>

                        {/* Donut Legend */}
                        <div className="space-y-3 w-full max-w-xs">
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-700">פעיל באתרי פרויקטים</span>
                            </div>
                            <div className="text-left">
                              <span className="text-xs font-black text-slate-900 font-mono">{inUseCount.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-500 font-semibold mr-1">({Math.round(inUsePct * 100)}%)</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-700">מלאי זמין במחסנים</span>
                            </div>
                            <div className="text-left">
                              <span className="text-xs font-black text-slate-900 font-mono">{inWarehouseCount.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-500 font-semibold mr-1">({Math.round(inWarehousePct * 100)}%)</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-700">בתיקון / שיקום סדנה</span>
                            </div>
                            <div className="text-left">
                              <span className="text-xs font-black text-slate-900 font-mono">{maintenanceCount.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-500 font-semibold mr-1">({Math.round(maintenancePct * 100)}%)</span>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Infographic 2: Proportional Site Capital Breakdown */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span>פיזור הון הציוד לפי אתרים ומתקנים</span>
                    </h3>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                      סה&quot;כ: ₪{(data.totalFleetValue ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    חלוקת משאבים ושווי הציוד המושקע בכל אחד ממוקדי הפעילות
                  </p>
                </div>

                <div className="space-y-3.5 py-1">
                  {data.facilityDistribution && data.facilityDistribution.length > 0 ? (
                    data.facilityDistribution.map((fac, idx) => {
                      const facTotal = fac.totalTools || fac.totalAssets || 0;
                      const pct = totalAssetsCount > 0 ? Math.round((facTotal / totalAssetsCount) * 100) : 0;
                      const estValue = totalAssetsCount > 0 ? Math.round((facTotal / totalAssetsCount) * (data.totalFleetValue ?? 0)) : 0;
                      
                      const isBazan = fac.warehouseName.includes('בז"ן') || fac.warehouseCode.includes('BZN');
                      const isHabonim = fac.warehouseName.includes('הבונים') || fac.warehouseCode.includes('HB');
                      const isSagi = fac.warehouseName.includes('שגיא') || fac.warehouseCode.includes('SG');
                      const FacIcon = isBazan ? Factory : isHabonim ? Building2 : isSagi ? Container : Truck;
                      
                      const gradientColors = [
                        'from-blue-600 to-indigo-600',
                        'from-indigo-500 to-purple-500',
                        'from-emerald-500 to-teal-500',
                        'from-amber-500 to-orange-500',
                        'from-cyan-500 to-blue-500',
                      ];
                      const gradientClass = gradientColors[idx % gradientColors.length];

                      return (
                        <div key={fac.warehouseId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span className="flex items-center gap-1.5">
                              <FacIcon className="w-3.5 h-3.5 text-blue-600" />
                              <span>{fac.warehouseName} ({fac.warehouseCode})</span>
                            </span>
                            <span className="font-mono text-slate-900">
                              {pct}% ({facTotal} כלים · ~₪{estValue.toLocaleString()})
                            </span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full bg-gradient-to-r ${gradientClass} rounded-full transition-all duration-500`}
                              style={{ width: `${Math.max(pct, facTotal > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400 font-semibold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      אין אתרים או מחסנים מוגדרים לארגון זה
                    </div>
                  )}
                </div>
              </div>

              {/* Infographic 3: Fleet Maintenance & Risk Radar */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      <span>רדאר תחזוקה ובקרת סיכוני ציוד</span>
                    </h3>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                      {data.facilityDistribution[0]?.warehouseName || 'מוקד תחזוקה ובטיחות'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    מעקב טיפולים תקופתיים, השבתות תפעוליות וזמני סבב תיקון
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-700">
                      <Wrench className="w-4 h-4" />
                      <span className="text-[11px] font-black uppercase">בתיקון והשבתה</span>
                    </div>
                    <div className="text-xl font-black text-slate-900">
                      {(data.utilization?.maintenance ?? 0).toLocaleString()} כלים
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                      כלים הנמצאים כעת בסדנה או בהשבתה
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-700">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-[11px] font-black uppercase">בדיקות באיחור</span>
                    </div>
                    <div className="text-xl font-black text-slate-900">
                      {(data.safetyCompliance?.overdueCount ?? 0).toLocaleString()} כלים
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                      ציוד שמועד ביקורת הבטיחות שלו חלף
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <Clock className="w-4 h-4" />
                      <span className="text-[11px] font-black uppercase">ביקורות קרובות</span>
                    </div>
                    <div className="text-xl font-black text-slate-900">
                      {(data.safetyCompliance?.upcomingInspectionCount ?? 0).toLocaleString()} כלים
                    </div>
                    <p className="text-[10px] text-emerald-700 font-semibold leading-tight">
                      בדיקות מתוכננות במהלך 7 הימים הקרובים
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-xs font-bold text-emerald-950">עמידה ביעדי SLA לכשירות ובטיחות</span>
                  </div>
                  <span className="text-xs font-black text-emerald-700 font-mono">
                    {data.safetyCompliance?.complianceRate ?? 100}% הצלחה
                  </span>
                </div>
              </div>

              {/* Infographic 4: Heavy Capital Equipment Matrix */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <span>עמודי התווך של הון הציוד התעשייתי</span>
                    </h3>
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                      קטגוריות מובילות
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    ריכוז הנכסים הכבדים והציוד עתיר ההון של {orgDisplayName}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(data.categoryBreakdown && data.categoryBreakdown.length > 0) ? (
                    data.categoryBreakdown.slice(0, 4).map((cat, idx) => {
                      const catIcons = [Scissors, Flame, Anchor, Sparkles];
                      const IconComp = catIcons[idx % catIcons.length];
                      return (
                        <div key={cat.name} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                            <IconComp className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="text-2xl font-black text-slate-900 font-mono">{cat.count} כלים</div>
                          <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                            ציוד מבוקר ורשום במערך התפעול
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 p-6 text-center text-xs text-slate-400 font-semibold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      אין עדיין קטגוריות ציוד פעילות לארגון זה
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SITE INVENTORY BREAKDOWN GRID (MODERNIZED FACILITY CARDS) */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>התפלגות ציוד לפי אתרים ומחסנים ({data.facilityDistribution.length} מתקנים מבצעיים)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    פירוט נפח פעילות, כלים מושאלים וסטטוס בכל מתקן עם גישה מהירה לרשימת הכלים המלאה
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.facilityDistribution.map((fac) => {
                  const isBazan = fac.warehouseName.includes('בז"ן') || fac.warehouseCode.includes('BZN');
                  const isHabonim = fac.warehouseName.includes('הבונים') || fac.warehouseCode.includes('HB');
                  const isSagi = fac.warehouseName.includes('שגיא') || fac.warehouseCode.includes('SG');
                  
                  const FacIcon = isBazan ? Factory : isHabonim ? Building2 : isSagi ? Container : Truck;
                  const totalWhTools = fac.totalTools || (fac.available + fac.checkedOut + fac.maintenance);

                  return (
                    <div
                      key={fac.warehouseId}
                      className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shrink-0">
                            <FacIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{fac.warehouseName}</span>
                            <span className="text-[11px] font-bold text-slate-500">{totalWhTools} כלים רשומים</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                          {fac.warehouseCode}
                        </span>
                      </div>

                      {/* Utilization progress */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                          <span>ניצולת מבצעית</span>
                          <span className="font-mono font-black">{fac.utilizationRate}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${fac.utilizationRate}%` }}
                            className="bg-blue-600 h-full rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>

                      {/* Breakdown pills */}
                      <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-bold pt-1">
                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
                          <div className="text-[10px] text-slate-500">זמינים במחסן</div>
                          <div className="text-emerald-700 font-black text-sm">{fac.available}</div>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
                          <div className="text-[10px] text-slate-500">בשימוש בשטח</div>
                          <div className="text-blue-900 font-black text-sm">{fac.checkedOut}</div>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
                          <div className="text-[10px] text-slate-500">בתיקון / תקלה</div>
                          <div className="text-rose-600 font-black text-sm">{fac.maintenance}</div>
                        </div>
                      </div>

                      {/* Direct Action: Open Warehouse Tools Modal */}
                      <button
                        type="button"
                        onClick={() => {
                          const whItem: WarehouseAdminItem = warehousesList.find((w) => w.id === fac.warehouseId) || {
                            id: fac.warehouseId,
                            name: fac.warehouseName,
                            code: fac.warehouseCode,
                            type: isHabonim ? 'central_warehouse' : isBazan ? 'site_container' : 'site_container',
                            isActive: true,
                            toolCount: totalWhTools,
                            totalTools: totalWhTools,
                            availableCount: fac.available,
                            inUseCount: fac.checkedOut,
                            maintenanceCount: fac.maintenance,
                          };
                          setSelectedViewingWarehouse(whItem);
                          setIsToolsModalOpen(true);
                        }}
                        className="w-full mt-1 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>צפה בכלים ({totalWhTools})</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STRATEGIC EXPORT & ACCOUNTING CENTER (POLISHED WHITE CARD) */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5 print:hidden">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-black">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>מרכז דוחות כספיים וביקורת מבוקרת (Accounting Audit Center)</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  ייצוא נתונים מוסמך ודוח מאזן תקופתי לחשבונאות
                </h3>
                <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                  ייצוא קובץ אקסל מבוקר (CSV בקידוד UTF-8 BOM מותאם לעברית) או הפקת דוח מאזן רשמי לרואה חשבון הכולל שווי נכסים, פחת מצטבר, שיוך נזקים ואישורי חתימה.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleExportAccountingCsv}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>📥 ייצוא קובץ אקסל מבוקר (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAccountingModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-50 border border-slate-300 font-black text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Printer className="w-4 h-4 text-purple-600" />
                  <span>🖨️ הדפסת דוח מאזן רשמי (PDF)</span>
                </button>
              </div>
            </div>

            {/* OVERDUE ASSETS TABLE */}
            <div className="p-5 rounded-2xl bg-white border-2 border-rose-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-rose-950 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>כלים באיחור החזרה - סיכון אובדן</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    רשימת הכלים שלא הוחזרו בתום מועד ההשאלה עם פרטי התקשרות לעובדים
                  </p>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>ייצוא לאקסל (CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all shadow-sm cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>הדפסת דוח</span>
                  </button>
                </div>
              </div>

              {/* Search filter */}
              <div className="relative print:hidden">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חפש לפי שם כלי, עובד, טלפון, ברקוד או אתר..."
                  className="w-full bg-slate-50 text-blue-950 text-xs font-bold pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Table */}
              {filteredOverdue.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-500">
                  אין כלים באיחור התואמים את החיפוש
                </div>
              ) : (
                <>
                  {/* Desktop Table (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                        <tr>
                          <th className="p-3">כלי עבודה</th>
                          <th className="p-3">ברקוד/QR</th>
                          <th className="p-3">עובד אחראי</th>
                          <th className="p-3">טלפון</th>
                          <th className="p-3">אתר שיוך</th>
                          <th className="p-3">מועד צפוי</th>
                          <th className="p-3">ימי איחור</th>
                          <th className="p-3">שווי (₪)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filteredOverdue.map((item) => (
                          <tr key={item.assetId} className="hover:bg-blue-50/40 transition-colors">
                            <td className="p-3 font-bold text-blue-950">
                              <div>{item.toolName}</div>
                              <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                                {item.brand} {item.modelNumber ? `• ${item.modelNumber}` : ''}
                              </div>
                            </td>
                            <td className="p-3 font-mono font-bold text-blue-800" dir="ltr">
                              {item.qrCode}
                            </td>
                            <td className="p-3 font-bold text-slate-900">{item.workerName}</td>
                            <td className="p-3 font-mono text-slate-600" dir="ltr">
                              {item.workerPhone ? (
                                <a
                                  href={`tel:${item.workerPhone}`}
                                  className="text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  <Phone className="w-3 h-3 text-blue-500" />
                                  <span>{item.workerPhone}</span>
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-3 text-slate-700">{item.warehouseName}</td>
                            <td className="p-3 text-slate-600">
                              <div className="flex items-center gap-1 text-[11px]">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>
                                  {new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}
                                </span>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                +{item.daysOverdue} ימים
                              </span>
                            </td>
                            <td className="p-3 font-black text-slate-900">
                              ₪{item.purchaseCost.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Touch Cards (< 768px) */}
                  <div className="block md:hidden space-y-3">
                    {filteredOverdue.map((item) => (
                      <div
                        key={item.assetId}
                        className="p-3.5 bg-white rounded-2xl border-2 border-rose-100 shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black text-blue-950 truncate">
                              {item.toolName}
                            </h4>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                              {item.brand} {item.modelNumber ? `• ${item.modelNumber}` : ''}
                            </div>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                            +{item.daysOverdue} ימים
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">עובד אחראי</span>
                            <span className="font-bold text-slate-900 truncate block">{item.workerName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">אתר שיוך</span>
                            <span className="font-bold text-slate-700 truncate block">{item.warehouseName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">מועד צפוי</span>
                            <span className="font-medium text-slate-600 flex items-center gap-1 text-[11px]">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{new Date(item.expectedReturnDate).toLocaleDateString('he-IL')}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">שווי כלי</span>
                            <span className="font-black text-slate-900 block">₪{item.purchaseCost.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100" dir="ltr">
                            {item.qrCode}
                          </span>
                          {item.workerPhone && (
                            <a
                              href={`tel:${item.workerPhone}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs cursor-pointer active:scale-95 transition-all"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>חייג לעובד</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: STOREKEEPER ACCESS CONTROL & WAREHOUSE SCOPING        */}
        {/* ============================================================ */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Add Button */}
            <div className="p-5 rounded-2xl bg-white border-2 border-purple-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-black text-purple-950">
                    בקרת גישה ושיוך מחסנים למחסנאים
                  </h2>
                </div>
                <p className="hidden sm:block text-xs text-slate-500">
                  כל מחסנאי מורשה משויך בלעדית למחסן פעיל. פעולות ניפוק והעברה מוגבלות לכלי המחסן שלו בלבד.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>➕ הוספת מחסנאי חדש</span>
                </button>
              </div>
            </div>

            {/* Add Storekeeper Modal / Panel */}
            {isAddModalOpen && (
              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-4 border-b border-purple-200 pb-3">
                  <div className="flex items-center gap-2 font-black text-sm text-purple-950">
                    <UserPlus className="w-4 h-4 text-purple-700" />
                    <span>טופס רישום מחסנאי מורשה חדש</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setFormError(null);
                    }}
                    className="p-1 rounded-lg hover:bg-purple-200 text-purple-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateStorekeeper} className="space-y-4">
                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      דרגת תפקיד והרשאה במערכת <span className="text-purple-600">*</span>:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        className={`p-3 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                          newUserRole === 'storekeeper'
                            ? 'bg-purple-50 border-purple-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="userRole"
                          checked={newUserRole === 'storekeeper'}
                          onChange={() => setNewUserRole('storekeeper')}
                          className="mt-1 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="text-xs font-black text-slate-900 block">
                            🔑 מחסנאי מורשה (Storekeeper)
                          </span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            גישה מוגבלת ומאובטחת למחסן יחיד בלבד (&quot;כל אחד של שלו&quot;)
                          </span>
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                          newUserRole === 'chief_operations'
                            ? 'bg-indigo-50 border-indigo-600 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="userRole"
                          checked={newUserRole === 'chief_operations'}
                          onChange={() => setNewUserRole('chief_operations')}
                          className="mt-1 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="text-xs font-black text-slate-900 block">
                            🌐 אחראי תפעול ראשי (Chief Operations)
                          </span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            שליטה מלאה בכלל המחסנים, מכולות שטח ורכבים, העברות מלאי וספירות
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        שם מלא <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        placeholder="לדוגמה: ירון כהן"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        שם משתמש לכניסה (Username) <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="לדוגמה: yaron"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        קוד כניסה סודי (PIN - 4 ספרות) <span className="text-purple-600">*</span>:
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        value={newPinCode}
                        onChange={(e) => setNewPinCode(e.target.value)}
                        placeholder="לדוגמה: 4321"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        מחסן / אתר באחריות <span className="text-purple-600">*</span>:
                      </label>
                      {newUserRole === 'chief_operations' ? (
                        <div className="w-full bg-indigo-50/70 border border-indigo-200 rounded-xl px-3.5 py-2.5 text-xs text-indigo-950 font-bold flex items-center gap-2">
                          <span>🌐 כלל המחסנים (שליטה מבצעית חוצת מתקנים)</span>
                        </div>
                      ) : (
                        <select
                          value={effectiveAssignedWarehouseId}
                          onChange={(e) => setNewAssignedWarehouseId(e.target.value)}
                          className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:border-purple-600 focus:outline-none"
                        >
                          <option value="all">🌐 כלל המחסנים (ללא שיוך מחסן ספציפי)</option>
                          {availableFacilities.map((fac) => (
                            <option key={fac.warehouseId} value={fac.warehouseId}>
                              {fac.warehouseName} [{fac.warehouseCode}]
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        אימייל ארגוני (אופציונלי):
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="לדוגמה: yaron@company.co.il"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        טלפון ליצירת קשר (אופציונלי):
                      </label>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="לדוגמה: 050-1234567"
                        dir="ltr"
                        className="w-full bg-white border border-purple-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold text-right focus:border-purple-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="py-2.5 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUser}
                      className="py-2.5 px-5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingUser ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>שומר במערכת...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>הוסף משתמש למערכת</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Storekeepers Table */}
            <div className="p-5 rounded-2xl bg-white border-2 border-purple-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-purple-950 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-700" />
                    <span>רשימת בעלי תפקידים ומחסנאים ({storekeepers.length})</span>
                  </h3>
                  <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                    בקרת הרשאות היררכית: מנהל כללי, אחראי תפעול ראשי, ומחסנאי שטח מוגבלי מחסן
                  </p>
                </div>

                {isLoadingStorekeepers && (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                )}
              </div>

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-purple-50 text-purple-950 font-black border-b border-purple-100">
                    <tr>
                      <th className="p-3.5">שם מלא</th>
                      <th className="p-3.5">דרגת תפקיד</th>
                      <th className="p-3.5">שם משתמש</th>
                      <th className="p-3.5">קוד כניסה (PIN)</th>
                      <th className="p-3.5">מתקן משויך (הגבלת פעילות)</th>
                      <th className="p-3.5">סטטוס</th>
                      <th className="p-3.5 text-center">פעולות הנהלה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {storekeepers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                          לא נמצאו משתמשים במערכת
                        </td>
                      </tr>
                    ) : (
                      storekeepers.map((sk) => {
                        const isActive = sk.isActive ?? true;
                        const isGM = sk.role === 'general_manager' || sk.role === 'admin';
                        const isChief = sk.role === 'chief_operations';
                        return (
                          <tr
                            key={sk.id}
                            className={`hover:bg-purple-50/30 transition-colors ${
                              !isActive ? 'opacity-60 bg-slate-50' : ''
                            }`}
                          >
                            <td className="p-3.5 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-purple-600" />
                                <span>{sk.fullName}</span>
                              </div>
                            </td>
                            <td className="p-3.5">
                              {isGM ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-900 border border-purple-200 shadow-xs">
                                  👑 מנהל כללי
                                </span>
                              ) : isChief ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200 shadow-xs">
                                    🌐 אחראי תפעול ראשי
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRoleChange(sk.id, 'storekeeper')}
                                    className="text-[10px] text-slate-400 hover:text-indigo-600 underline cursor-pointer"
                                    title="שנה תפקיד למחסנאי"
                                  >
                                    הגדר כמחסנאי
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200 shadow-xs">
                                    🔑 מחסנאי מורשה
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRoleChange(sk.id, 'chief_operations')}
                                    className="text-[10px] text-slate-400 hover:text-indigo-600 underline cursor-pointer"
                                    title="קדם לאחראי תפעול ראשי"
                                  >
                                    קדם לתפעול
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="p-3.5 font-mono text-slate-600" dir="ltr">
                              <div>{sk.username || '—'}</div>
                              {sk.email && (
                                <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{sk.email}</div>
                              )}
                            </td>
                            <td className="p-3.5" dir="ltr">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm tracking-widest text-slate-400">••••</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetPinTarget(sk);
                                    setNewPinValue('');
                                    setPinError(null);
                                  }}
                                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition-colors cursor-pointer"
                                  title="איפוס קוד PIN"
                                >
                                  איפוס קוד PIN
                                </button>
                              </div>
                            </td>
                            <td className="p-3.5">
                              {isGM || isChief ? (
                                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 inline-block">
                                  🌐 כלל המחסנים (ללא הגבלה)
                                </span>
                              ) : (
                                <div className="relative inline-block">
                                  <select
                                    value={sk.assignedWarehouseId || ''}
                                    onChange={(e) =>
                                      handleWarehouseReassign(sk.id, e.target.value)
                                    }
                                    className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:border-purple-600 focus:outline-none cursor-pointer"
                                  >
                                    {availableFacilities.map((fac) => (
                                      <option key={fac.warehouseId} value={fac.warehouseId}>
                                        {fac.warehouseName} [{fac.warehouseCode}]
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-300'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isActive ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {isActive ? 'פעיל ומורשה' : 'מושבת'}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              {!isGM && (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(sk.id, sk.isActive)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                      isActive
                                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                    }`}
                                    title={isActive ? 'השבת משתמש' : 'הפעל משתמש'}
                                  >
                                    {isActive ? 'השבת גישה' : 'הפעל מחדש'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStorekeeper(sk)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                    title="מחק משתמש לצמיתות"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>מחיקה</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Touch-Friendly Cards View (< 768px) */}
              <div className="block md:hidden space-y-3">
                {storekeepers.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold">
                    לא נמצאו משתמשים במערכת
                  </div>
                ) : (
                  storekeepers.map((sk) => {
                    const isActive = sk.isActive ?? true;
                    const isGM = sk.role === 'general_manager' || sk.role === 'admin';
                    const isChief = sk.role === 'chief_operations';

                    return (
                      <div
                        key={sk.id}
                        className={`p-4 rounded-2xl bg-white border-2 transition-all space-y-3 shadow-2xs ${
                          !isActive ? 'opacity-60 bg-slate-50 border-slate-200' : 'border-purple-100 hover:border-purple-300'
                        }`}
                      >
                        {/* Top: User Full Name + Role Badge */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold shrink-0">
                              <UserCheck className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-black text-sm text-slate-900 leading-tight truncate">
                                {sk.fullName}
                              </h4>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                  isActive ? 'text-emerald-700' : 'text-slate-500'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                {isActive ? 'פעיל ומורשה' : 'מושבת'}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isGM ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs">
                                👑 מנהל כללי
                              </span>
                            ) : isChief ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200 shadow-2xs">
                                🌐 תפעול ראשי
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200 shadow-2xs">
                                🔑 מחסנאי
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Assigned Warehouse + Username */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-500 block mb-0.5">שם משתמש:</span>
                            <span className="font-mono font-bold text-slate-900 block truncate" dir="ltr">
                              @{sk.username || '—'}
                            </span>
                            {sk.email && (
                              <span className="text-[10px] text-slate-400 block truncate" dir="ltr">
                                {sk.email}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-slate-500 block mb-0.5">מתקן משויך:</span>
                            {isGM || isChief ? (
                              <span className="text-xs font-bold text-indigo-900 truncate block">
                                🌐 כלל המחסנים
                              </span>
                            ) : (
                              <select
                                value={sk.assignedWarehouseId || ''}
                                onChange={(e) => handleWarehouseReassign(sk.id, e.target.value)}
                                className="w-full bg-white border border-slate-300 text-slate-900 text-[11px] font-bold rounded-lg px-2 py-1 focus:border-purple-600 focus:outline-none cursor-pointer truncate"
                              >
                                {availableFacilities.map((fac) => (
                                  <option key={fac.warehouseId} value={fac.warehouseId}>
                                    {fac.warehouseName}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        {/* PIN Security Row */}
                        <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500">קוד PIN:</span>
                            <span className="font-mono text-sm tracking-widest text-slate-400" dir="ltr">••••</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setResetPinTarget(sk);
                              setNewPinValue('');
                              setPinError(null);
                            }}
                            className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition-colors cursor-pointer"
                          >
                            איפוס קוד PIN
                          </button>
                        </div>

                        {/* Bottom: Action buttons (Edit/Delete) */}
                        {!isGM && (
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                            {isChief ? (
                              <button
                                type="button"
                                onClick={() => handleRoleChange(sk.id, 'storekeeper')}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 transition-all cursor-pointer"
                              >
                                הגדר כמחסנאי
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRoleChange(sk.id, 'chief_operations')}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-all cursor-pointer"
                              >
                                קדם לתפעול
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleToggleActive(sk.id, sk.isActive)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isActive ? 'השבת' : 'הפעל'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteStorekeeper(sk)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>מחיקה</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: FACILITIES & WAREHOUSES MANAGEMENT                    */}
        {/* ============================================================ */}
        {activeTab === 'warehouses' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Section Header & Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-950 flex items-center justify-center font-black">
                    <Building2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <h2 className="text-lg font-black text-slate-900">
                    ניהול אתרים, מפעלים ומחסנים
                  </h2>
                </div>
                <p className="hidden sm:block text-xs text-slate-500 mt-1">
                  הגדרה וסנכרון של מחסנים מרכזיים, מכולות שטח באתרי בנייה ורכבי שירות ניידים
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingWarehouse(null);
                  setIsWarehouseModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-purple-900/20 transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>➕ הוסף מחסן / אתר חדש</span>
              </button>
            </div>

            {/* Facilities Cards Grid */}
            {isLoadingWarehouses ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">טוען רשימת מתקנים ומחסנים...</p>
              </div>
            ) : warehousesList.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">לא נמצאו מתקנים במערכת</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingWarehouse(null);
                    setIsWarehouseModalOpen(true);
                  }}
                  className="mt-3 text-xs font-black text-purple-600 hover:underline cursor-pointer"
                >
                  לחץ כאן להוספת המתקן הראשון
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {warehousesList.map((wh) => (
                  <div
                    key={wh.id}
                    className="bg-white border-2 border-slate-200/80 hover:border-purple-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    {/* Top Card Info */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                              wh.type === 'site_container'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : wh.type === 'service_van'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {wh.type === 'site_container' && <Container className="w-5 h-5" />}
                            {wh.type === 'service_van' && <Truck className="w-5 h-5" />}
                            {(!wh.type || wh.type === 'central_warehouse') && (
                              <Building2 className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900 text-base leading-tight">
                              {wh.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200"
                                dir="ltr"
                              >
                                {wh.code}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                  wh.type === 'site_container'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : wh.type === 'service_van'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                                }`}
                              >
                                {wh.type === 'site_container'
                                  ? 'מכולת אתר'
                                  : wh.type === 'service_van'
                                  ? 'רכב שירות'
                                  : 'מחסן מרכזי'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            wh.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-300'
                          }`}
                        >
                          {wh.isActive ? 'פעיל' : 'מושבת'}
                        </span>
                      </div>

                      {/* Physical Address */}
                      {wh.address && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{wh.address}</span>
                        </div>
                      )}

                      {/* Live Inventory Stats Pill */}
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">סה&quot;כ כלים במתקן:</span>
                          <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                            {wh.totalTools ?? wh.toolCount} כלים
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[11px] pt-1 border-t border-slate-200/60 text-center font-bold">
                          <div className="text-emerald-700 bg-emerald-50/80 py-1 rounded">
                            {wh.availableCount} זמינים במחסן
                          </div>
                          <div className="text-blue-900 bg-blue-50/80 py-1 rounded">
                            {wh.inUseCount} בשימוש בשטח
                          </div>
                          <div className="text-rose-700 bg-rose-50/80 py-1 rounded">
                            {wh.maintenanceCount} בתיקון
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedViewingWarehouse(wh);
                          setIsToolsModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white flex items-center gap-1.5 shadow-sm shadow-purple-900/10 transition-all cursor-pointer active:scale-95"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>צפה בכלים ({wh.totalTools ?? wh.toolCount})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingWarehouse(wh);
                          setIsWarehouseModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-600" />
                        <span>עריכה</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWarehouse(wh.id)}
                        disabled={deletingWarehouseId === wh.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {deletingWarehouseId === wh.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>מחיקה</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Accounting Balance Audit Modal */}
      {isAccountingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border-2 border-purple-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-purple-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/10 text-purple-300 flex items-center justify-center border border-white/20">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">
                      דוח מאזן נכסים וציוד לחשבונאות
                    </h3>
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                      ספר נכסים מבוקר
                    </span>
                  </div>
                  <p className="text-xs text-purple-200 mt-0.5">
                    Tooly Fleet Management Systems • דוח רשמי לצורכי ביקורת, שומת מס ופחת
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-purple-700/60 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 border border-purple-400/30 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>הדפס / שמור כ-PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAccountingModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - Printable document */}
            <div className="p-6 overflow-y-auto space-y-6 text-slate-800 printable-area">
              {/* Report Metadata Strip */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
                <div>
                  <span className="text-slate-500 block text-[10px]">תאריך הפקת הדוח:</span>
                  <span className="text-slate-900 font-mono text-sm">
                    {new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">מנהל מאשר (Executive):</span>
                  <span className="text-purple-950 font-black">{user?.fullName || 'מנהל כללי'} ({user?.username || orgDisplayName})</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">מספר מתקנים בביקורת:</span>
                  <span className="text-slate-900 font-black">
                    {data.facilityDistribution.length} מתקנים פעילים
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">שיטת חישוב פחת:</span>
                  <span className="text-indigo-700 font-bold">קו ישר (5 שנים - 20% לשנה)</span>
                </div>
              </div>

              {/* Financial Balance Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
                <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 block">שווי רכישה מקורי</span>
                  <span className="text-xl font-black text-emerald-950 mt-1 block">
                    ₪{(data.totalFleetValue ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200">
                  <span className="text-[11px] font-bold text-indigo-800 block">פחת מצטבר בספרים</span>
                  <span className="text-xl font-black text-indigo-950 mt-1 block">
                    ₪{(data.depreciation?.accumulatedDepreciation ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-purple-50/80 border border-purple-200">
                  <span className="text-[11px] font-bold text-purple-800 block">ערך נוכחי נקי בספרים</span>
                  <span className="text-xl font-black text-purple-950 mt-1 block">
                    ₪{(data.depreciation?.currentBookValue ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-800 block">נזקים וחיובי קבלנים</span>
                  <span className="text-xl font-black text-amber-950 mt-1 block">
                    ₪{(data.damageAttribution?.totalDamageCost ?? data.monthlyDamageCost ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Facility Breakdown Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-purple-700" />
                  <span>מאזן שווי וכלים בחלוקה לפי מחסנים ואתרים</span>
                </h4>
                {/* Desktop Table (>= 768px) */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">שם המתקן / מחסן</th>
                        <th className="p-2.5">קוד מתקן</th>
                        <th className="p-2.5">סה&quot;כ כלים</th>
                        <th className="p-2.5">זמינים במחסן</th>
                        <th className="p-2.5">בשימוש בשטח</th>
                        <th className="p-2.5">בתיקון / השבתה</th>
                        <th className="p-2.5">ניצולת מלאי</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.facilityDistribution.map((fac) => (
                        <tr key={fac.warehouseId} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{fac.warehouseName}</td>
                          <td className="p-2.5 font-mono text-purple-700" dir="ltr">{fac.warehouseCode}</td>
                          <td className="p-2.5 font-black">{fac.totalAssets}</td>
                          <td className="p-2.5 text-emerald-700 font-bold">{fac.available}</td>
                          <td className="p-2.5 text-blue-900 font-bold">{fac.checkedOut}</td>
                          <td className="p-2.5 text-rose-700 font-bold">{fac.maintenance}</td>
                          <td className="p-2.5 font-black text-slate-900">
                            {fac.utilizationRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View (< 768px) */}
                <div className="block md:hidden space-y-2.5">
                  {data.facilityDistribution.map((fac) => (
                    <div
                      key={fac.warehouseId}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">{fac.warehouseName}</span>
                        <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200" dir="ltr">
                          {fac.warehouseCode}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center">
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[10px] text-slate-400 font-bold block">סה&quot;כ</span>
                          <span className="text-xs font-black text-slate-900">{fac.totalAssets}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[10px] text-emerald-600 font-bold block">זמינים</span>
                          <span className="text-xs font-black text-emerald-700">{fac.available}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[10px] text-blue-600 font-bold block">בשטח</span>
                          <span className="text-xs font-black text-blue-900">{fac.checkedOut}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="text-[10px] text-rose-600 font-bold block">בתיקון</span>
                          <span className="text-xs font-black text-rose-700">{fac.maintenance}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                        <span className="text-slate-500 font-bold">ניצולת מלאי</span>
                        <span className="font-black text-purple-950 font-mono">{fac.utilizationRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formal Sign-off Section */}
              <div className="pt-6 border-t-2 border-slate-200">
                <h4 className="text-xs font-black text-slate-700 mb-4">
                  אישור מנהלים וביקורת חשבונות (Executive Sign-Off & Audit Verification):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <span className="text-xs font-bold text-slate-600 block">חתימת מנהל כללי (CEO / GM)</span>
                    <div className="h-12 border-b-2 border-dashed border-slate-300 flex items-center justify-center">
                      <span className="font-serif italic text-purple-900 font-bold text-lg">{user?.username || user?.fullName || orgDisplayName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">תאריך: {new Date().toLocaleDateString('he-IL')}</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <span className="text-xs font-bold text-slate-600 block">חתימת רואה חשבון / סמנכ&quot;ל כספים</span>
                    <div className="h-12 border-b-2 border-dashed border-slate-300 flex items-center justify-center">
                      <span className="text-xs text-slate-400 font-medium">(חתימה וחותמת)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">תאריך: ________________</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                    <span className="text-xs font-bold text-slate-600 block">חתימת אחראי תפעול ראשי (COO)</span>
                    <div className="h-12 border-b-2 border-dashed border-slate-300 flex items-center justify-center">
                      <span className="text-xs text-slate-400 font-medium">(אישור מלאי פיזי)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">תאריך: ________________</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={handleExportAccountingCsv}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>הורד כ-CSV אקסל</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAccountingModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer transition-all"
              >
                סגור דוח
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warehouse Create / Edit Modal */}
      <WarehouseFormModal
        isOpen={isWarehouseModalOpen}
        onClose={() => {
          setIsWarehouseModalOpen(false);
          setEditingWarehouse(null);
        }}
        onSaved={async (savedWh) => {
          setFeedbackMessage({
            text: `המתקן "${savedWh.name}" נשמר בהצלחה.`,
            type: 'success',
          });
          await loadWarehouses();
        }}
        initialData={editingWarehouse}
      />

      {/* Warehouse View Tools Modal */}
      <WarehouseToolsModal
        isOpen={isToolsModalOpen}
        onClose={() => {
          setIsToolsModalOpen(false);
          setSelectedViewingWarehouse(null);
        }}
        warehouse={selectedViewingWarehouse}
      />

      {/* Reset PIN Modal */}
      {resetPinTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white border-2 border-purple-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  🔑
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    איפוס קוד PIN
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    עבור: {resetPinTarget.fullName} ({resetPinTarget.username || 'ללא שם משתמש'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetPinTarget(null);
                  setNewPinValue('');
                  setPinError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  קוד PIN חדש (4-6 ספרות):
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewPinValue(val);
                  }}
                  placeholder="••••"
                  autoFocus
                  required
                  className="w-full text-center tracking-widest font-mono text-xl p-3 rounded-xl border-2 border-slate-200 focus:border-purple-600 focus:outline-none"
                  dir="ltr"
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                  {pinError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetPinTarget(null);
                    setNewPinValue('');
                    setPinError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isResettingPin || newPinValue.length < 4}
                  className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-black text-xs cursor-pointer transition-all shadow-md shadow-purple-900/20 flex items-center justify-center gap-1.5"
                >
                  {isResettingPin ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>שמור קוד PIN חדש</span>
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
