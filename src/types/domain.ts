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
  | 'lost';

export type AssetCondition =
  | 'excellent'
  | 'good'
  | 'needs_repair'
  | 'retired';

export interface Asset {
  id: string;
  toolModelId: string;
  qrCode: string;
  currentWarehouseId: string;
  currentAssignedWorker: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  version: number;
}
