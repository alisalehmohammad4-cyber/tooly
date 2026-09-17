export type WarehouseType = 'central_warehouse' | 'site_container' | 'service_van';

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  type?: WarehouseType;
  address?: string | null;
  isActive?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  displayOrder?: number;
}

export interface ToolModel {
  id: string;
  categoryId: string;
  name: string;
  brand: string;
  modelNumber: string | null;
  isSerialized: boolean;
}

export type AssetStatus =
  | 'available'
  | 'checked_out'
  | 'in_transit'
  | 'maintenance'
  | 'lost'
  | 'needs_repair';

export type AssetCondition =
  | 'excellent'
  | 'good'
  | 'needs_repair'
  | 'retired';

export interface AssetReservation {
  projectName: string;
  reservedForDate: string;
  reservedBy: string;
}

export type DamageType =
  | 'misuse'
  | 'wear_tear'
  | 'burned_motor'
  | 'impact_drop'
  | 'other';

export type ChargeParty = 'worker' | 'subcontractor' | 'company';

export interface DamageReport {
  isDamaged: boolean;
  damageType: DamageType;
  estimatedCost?: number;
  chargeParty?: ChargeParty;
  notes?: string;
}

export interface GpsCoordinates {
  lat: number;
  lng: number;
}

export interface Asset {
  id: string;
  toolModelId: string;
  qrCode: string;
  nfcUid?: string;
  currentWarehouseId: string;
  currentAssignedWorker: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  version: number;
  expectedReturnDate?: string | null;
  accessories?: {
    batteriesCount: number;
    hasCharger: boolean;
    hasCase: boolean;
  } | null;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyUntil?: string;
  photoUrl?: string;
  safetyInspectionDue?: string;
  isLocked?: boolean;
  lockReason?: string;
  reservation?: AssetReservation | null;
}

export type UserRole =
  | 'worker'
  | 'storekeeper'
  | 'chief_operations'
  | 'general_manager'
  | 'supervisor'
  | 'admin';

export interface AppUser {
  id: string;
  fullName: string;
  role: UserRole;
  pinCode?: string;
  username?: string;
  assignedWarehouseId?: string;
  assignedWarehouseName?: string;
  isActive?: boolean;
  createdAt?: string;
}

