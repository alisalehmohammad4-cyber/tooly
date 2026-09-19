import type { ScannedAssetDetails } from '@/app/actions/custody';

export type SyncActionType =
  | 'checkout'
  | 'bulk_checkout'
  | 'checkin'
  | 'transfer'
  | 'damage_report';

export interface SyncQueueItem<T = unknown> {
  id: string;
  type: SyncActionType;
  payload: T;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  errorMessage?: string;
}

export function getActiveOrganizationId(): string {
  if (typeof window === 'undefined') return 'default';
  try {
    const raw = localStorage.getItem('tooly_active_user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.organizationId) return user.organizationId;
    }
  } catch {}
  return 'default';
}

const DB_VERSION = 3;

const STORE_CACHED_ASSETS = 'cached_assets';
const STORE_SYNC_QUEUE = 'sync_queue';

const dbPromises = new Map<string, Promise<IDBDatabase>>();

/**
 * Initializes or returns the tenant-partitioned IndexedDB instance.
 * Dynamic database name: tooly_offline_db_${organizationId || 'default'}
 * Safe for SSR (resolves to null-guarded error if window is undefined).
 */
export function getOfflineDb(organizationId?: string): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }

  const orgId = organizationId || getActiveOrganizationId() || 'default';
  const dbName = `tooly_offline_db_${orgId}`;

  const existing = dbPromises.get(dbName);
  if (existing) {
    return existing;
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // 1. Cached Assets Store
      let assetStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_CACHED_ASSETS)) {
        assetStore = db.createObjectStore(STORE_CACHED_ASSETS, {
          keyPath: 'id',
        });
        assetStore.createIndex('qrCode', 'qrCode', { unique: false });
        assetStore.createIndex('toolName', 'toolName', { unique: false });
        assetStore.createIndex('status', 'status', { unique: false });
        assetStore.createIndex('nfcUid', 'nfcUid', { unique: false });
      } else {
        assetStore = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_CACHED_ASSETS);
        if (!assetStore.indexNames.contains('nfcUid')) {
          assetStore.createIndex('nfcUid', 'nfcUid', { unique: false });
        }
      }

      // 2. Offline Sync Queue Store
      let syncStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        syncStore = db.createObjectStore(STORE_SYNC_QUEUE, {
          keyPath: 'id',
        });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('type', 'type', { unique: false });
      } else {
        syncStore = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_SYNC_QUEUE);
      }

      // Production Reset: Purge demo records from cache and sync queue on upgrade to v3
      if (oldVersion < 3) {
        try {
          assetStore.clear();
          syncStore.clear();
        } catch (err) {
          console.warn('Error clearing legacy demo cache during DB upgrade:', err);
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      // Automatic client cleanup check for Production Reset
      if (typeof window !== 'undefined') {
        const PURGE_KEY = `tooly_prod_reset_v3_purged_${orgId}`;
        if (!localStorage.getItem(PURGE_KEY)) {
          try {
            const tx = db.transaction([STORE_CACHED_ASSETS, STORE_SYNC_QUEUE], 'readwrite');
            tx.objectStore(STORE_CACHED_ASSETS).clear();
            tx.objectStore(STORE_SYNC_QUEUE).clear();
            tx.oncomplete = () => {
              localStorage.setItem(PURGE_KEY, 'true');
              window.dispatchEvent(new CustomEvent('tooly-sync-queue-updated'));
            };
          } catch {
            localStorage.setItem(PURGE_KEY, 'true');
          }
        }
      }

      resolve(db);
    };

    request.onerror = () => {
      dbPromises.delete(dbName);
      reject(request.error || new Error(`Failed to open IndexedDB ${dbName}`));
    };

    request.onblocked = () => {
      console.warn(`Tooly IndexedDB upgrade blocked for ${dbName} by open tab`);
    };
  });

  dbPromises.set(dbName, promise);
  return promise;
}

// -------------------------------------------------------------
// CACHED ASSETS OPERATIONS
// -------------------------------------------------------------

/**
 * Stores or updates an asset in local IndexedDB cache.
 */
export async function cacheAsset(asset: ScannedAssetDetails, organizationId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const targetOrgId =
      organizationId ||
      asset.organizationId ||
      ((asset as unknown as { organization_id?: string }).organization_id) ||
      getActiveOrganizationId();
    const db = await getOfflineDb(targetOrgId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const req = store.put(asset);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error caching asset in IndexedDB:', err);
  }
}

/**
 * Stores multiple assets in local cache in a single transaction.
 */
export async function cacheAssets(assets: ScannedAssetDetails[], organizationId?: string): Promise<void> {
  if (typeof window === 'undefined' || assets.length === 0) return;
  try {
    const targetOrgId =
      organizationId ||
      assets[0]?.organizationId ||
      ((assets[0] as unknown as { organization_id?: string })?.organization_id) ||
      getActiveOrganizationId();
    const db = await getOfflineDb(targetOrgId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_CACHED_ASSETS);

      assets.forEach((item) => store.put(item));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error caching batch assets in IndexedDB:', err);
  }
}

/**
 * Finds an asset by QR code or NFC UID from IndexedDB.
 */
export async function getCachedAssetByQr(
  qrCode: string,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  const cleanCode = qrCode.trim().toUpperCase();
  if (!cleanCode) return null;

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const qrIndex = store.index('qrCode');
      const req = qrIndex.get(cleanCode);

      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result as ScannedAssetDetails);
        } else {
          // Check nfcUid index if available
          if (store.indexNames.contains('nfcUid')) {
            const nfcIndex = store.index('nfcUid');
            const nfcReq = nfcIndex.get(cleanCode);
            nfcReq.onsuccess = () => {
              if (nfcReq.result) {
                resolve(nfcReq.result as ScannedAssetDetails);
                return;
              }
              // Full scan fallback
              scanCursorFallback();
            };
            nfcReq.onerror = () => scanCursorFallback();
          } else {
            scanCursorFallback();
          }

          function scanCursorFallback() {
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor) {
                const val = cursor.value as ScannedAssetDetails;
                if (
                  val.qrCode?.trim().toUpperCase() === cleanCode ||
                  val.nfcUid?.trim().toUpperCase() === cleanCode ||
                  val.id?.trim().toUpperCase() === cleanCode
                ) {
                  resolve(val);
                  return;
                }
                cursor.continue();
              } else {
                resolve(null);
              }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
          }
        }
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error reading cached asset from IndexedDB:', err);
    return null;
  }
}

/**
 * Finds an asset by NFC UID specifically from IndexedDB.
 */
export async function getCachedAssetByNfc(
  nfcUid: string,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  return getCachedAssetByQr(nfcUid, organizationId);
}

/**
 * Finds an asset by its primary ID.
 */
export async function getCachedAssetById(
  id: string,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const req = store.get(id);

      req.onsuccess = () => resolve((req.result as ScannedAssetDetails) || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error getting asset by ID from IndexedDB:', err);
    return null;
  }
}

/**
 * Retrieves all locally cached assets.
 */
export async function getAllCachedAssets(organizationId?: string): Promise<ScannedAssetDetails[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as ScannedAssetDetails[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error getting all cached assets from IndexedDB:', err);
    return [];
  }
}

/**
 * Optimistically updates a cached asset's details in IndexedDB.
 */
export async function updateCachedAsset(
  id: string,
  updates: Partial<ScannedAssetDetails>,
  organizationId?: string
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve(null);
          return;
        }
        const updated = {
          ...(getReq.result as ScannedAssetDetails),
          ...updates,
          version: ((getReq.result as ScannedAssetDetails).version || 1) + 1,
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('Error updating cached asset in IndexedDB:', err);
    return null;
  }
}

// -------------------------------------------------------------
// SYNC QUEUE OPERATIONS
// -------------------------------------------------------------

/**
 * Enqueues an offline action into the sync queue.
 */
export async function enqueueSyncAction<T = unknown>(
  type: SyncActionType,
  payload: T,
  organizationId?: string
): Promise<SyncQueueItem<T>> {
  const item: SyncQueueItem<T> = {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  if (typeof window === 'undefined') return item;

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const req = store.put(item);

      req.onsuccess = () => {
        // Dispatch window event so components can update sync badge immediately
        window.dispatchEvent(new CustomEvent('tooly-sync-queue-updated'));
        resolve(item);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error enqueuing sync action in IndexedDB:', err);
    return item;
  }
}

/**
 * Retrieves all pending or failed items from the sync queue, sorted by timestamp ascending.
 */
export async function getPendingSyncQueue(organizationId?: string): Promise<SyncQueueItem[]> {
  if (typeof window === 'undefined') return [];

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const req = store.getAll();

      req.onsuccess = () => {
        const allItems = (req.result as SyncQueueItem[]) || [];
        const pending = allItems
          .filter((item) => item.status === 'pending' || item.status === 'failed')
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(pending);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error fetching sync queue from IndexedDB:', err);
    return [];
  }
}

/**
 * Updates a queue item's status and optional error message.
 */
export async function updateSyncItemStatus(
  id: string,
  status: 'pending' | 'syncing' | 'failed',
  errorMessage?: string,
  organizationId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve();
          return;
        }
        const item = getReq.result as SyncQueueItem;
        item.status = status;
        if (errorMessage) item.errorMessage = errorMessage;
        if (status === 'failed') item.retryCount += 1;

        const putReq = store.put(item);
        putReq.onsuccess = () => {
          window.dispatchEvent(new CustomEvent('tooly-sync-queue-updated'));
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('Error updating sync queue item status:', err);
  }
}

/**
 * Removes an item from the sync queue after successful sync.
 */
export async function removeSyncItem(id: string, organizationId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const req = store.delete(id);

      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('tooly-sync-queue-updated'));
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error removing sync queue item from IndexedDB:', err);
  }
}

/**
 * Gets the count of pending items in the sync queue.
 */
export async function getPendingSyncCount(organizationId?: string): Promise<number> {
  if (typeof window === 'undefined') return 0;

  try {
    const items = await getPendingSyncQueue(organizationId);
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Clears the entire sync queue.
 */
export async function clearSyncQueue(organizationId?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_SYNC_QUEUE);
      const req = store.clear();

      req.onsuccess = () => {
        window.dispatchEvent(new CustomEvent('tooly-sync-queue-updated'));
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error clearing sync queue:', err);
  }
}

/**
 * Clears all cached assets from IndexedDB.
 */
export async function clearCachedAssets(organizationId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getOfflineDb(organizationId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_CACHED_ASSETS);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error clearing cached assets:', err);
  }
}

/**
 * Purges both cached assets and offline sync queue for a complete client reset.
 */
export async function purgeAllOfflineData(organizationId?: string): Promise<void> {
  await Promise.all([clearCachedAssets(organizationId), clearSyncQueue(organizationId)]);
}
