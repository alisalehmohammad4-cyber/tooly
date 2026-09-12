'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  getPendingSyncQueue,
  getPendingSyncCount,
  updateSyncItemStatus,
  removeSyncItem,
  cacheAsset,
  cacheAssets,
  type SyncQueueItem,
} from '@/lib/offline/offlineDb';
import {
  checkoutAssetAction,
  bulkCheckoutAssetAction,
  checkinAssetAction,
  transferAssetAction,
  reportAssetDamageAction,
} from '@/app/actions/custody';
import type {
  CheckoutInput,
  BulkCheckoutInput,
  CheckinInput,
  TransferInput,
} from '@/core/assets/custody.schema';
import type { ReportDamageInput } from '@/app/actions/custody';

interface SyncResult {
  succeeded: number;
  failed: number;
}

interface OfflineSyncContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncNow: () => Promise<SyncResult>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(
  undefined
);

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getOnlineServerSnapshot(): boolean {
  return true;
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function OfflineSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot
  );

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const isSyncingRef = useRef<boolean>(false);

  // Refresh pending items count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingSyncCount();
      setPendingCount(count);
    } catch (err) {
      console.warn('Failed refreshing sync queue count:', err);
    }
  }, []);

  // Autonomous Sync Engine runner
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (typeof window === 'undefined') return { succeeded: 0, failed: 0 };
    if (!navigator.onLine) {
      return { succeeded: 0, failed: 0 };
    }
    if (isSyncingRef.current) {
      return { succeeded: 0, failed: 0 };
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    let succeeded = 0;
    let failed = 0;

    try {
      const queue: SyncQueueItem[] = await getPendingSyncQueue();

      for (const item of queue) {
        await updateSyncItemStatus(item.id, 'syncing');

        try {
          let isSuccess = false;

          switch (item.type) {
            case 'checkout': {
              const res = await checkoutAssetAction(item.payload as CheckoutInput);
              if (res.success) {
                isSuccess = true;
                if (res.asset) await cacheAsset(res.asset);
              } else {
                await updateSyncItemStatus(item.id, 'failed', res.error);
              }
              break;
            }

            case 'bulk_checkout': {
              const res = await bulkCheckoutAssetAction(
                item.payload as BulkCheckoutInput
              );
              if (res.success) {
                isSuccess = true;
                if (res.assets) await cacheAssets(res.assets);
              } else {
                await updateSyncItemStatus(item.id, 'failed', res.error);
              }
              break;
            }

            case 'checkin': {
              const res = await checkinAssetAction(item.payload as CheckinInput);
              if (res.success) {
                isSuccess = true;
                if (res.asset) await cacheAsset(res.asset);
              } else {
                await updateSyncItemStatus(item.id, 'failed', res.error);
              }
              break;
            }

            case 'transfer': {
              const res = await transferAssetAction(item.payload as TransferInput);
              if (res.success) {
                isSuccess = true;
                if (res.asset) await cacheAsset(res.asset);
              } else {
                await updateSyncItemStatus(item.id, 'failed', res.error);
              }
              break;
            }

            case 'damage_report': {
              const res = await reportAssetDamageAction(
                item.payload as ReportDamageInput
              );
              if (res.success) {
                isSuccess = true;
                if (res.asset) await cacheAsset(res.asset);
              } else {
                await updateSyncItemStatus(item.id, 'failed', res.error);
              }
              break;
            }

            default: {
              await updateSyncItemStatus(
                item.id,
                'failed',
                `Unknown action type: ${item.type}`
              );
              break;
            }
          }

          if (isSuccess) {
            await removeSyncItem(item.id);
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (itemErr: unknown) {
          failed += 1;
          const msg = itemErr instanceof Error ? itemErr.message : 'Sync execution error';
          await updateSyncItemStatus(item.id, 'failed', msg);
        }
      }

      setLastSyncTime(new Date());
      window.dispatchEvent(new CustomEvent('tooly-assets-synced'));
    } catch (err) {
      console.warn('General error in sync engine:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }

    return { succeeded, failed };
  }, [refreshPendingCount]);

  // Listen to queue updates from other components
  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshPendingCount();
    }, 0);

    const handleQueueUpdated = () => {
      void refreshPendingCount();
    };

    window.addEventListener('tooly-sync-queue-updated', handleQueueUpdated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('tooly-sync-queue-updated', handleQueueUpdated);
    };
  }, [refreshPendingCount]);

  // When back online, automatically trigger sync
  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(() => {
        void syncNow();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncNow]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        lastSyncTime,
        syncNow,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextType {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
}
