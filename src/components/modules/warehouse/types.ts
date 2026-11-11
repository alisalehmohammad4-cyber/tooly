export type {
  StorekeeperOperationsPayload,
  WarehouseOption,
  StorekeeperActiveLoan,
} from '@/app/actions/dashboard';

export type { ScannedAssetDetails } from '@/app/actions/custody';

export type {
  AvailableTransferAssetItem,
  PendingTransferItem,
} from '@/app/actions/transfers';

export type {
  SiteToolRequestItem,
  SuggestedToolAsset,
} from '@/app/actions/toolRequests';

export type {
  InTransitFleetItem,
  MaintenanceAssetItem,
} from '@/app/actions/maintenance';

export type WarehouseTabId = 'operations' | 'transfers' | 'maintenance' | 'notes';
