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

const DB_NAME = 'tooly_offline_db';
const DB_VERSION = 2;

const STORE_CACHED_ASSETS = 'cached_assets';
const STORE_SYNC_QUEUE = 'sync_queue';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initializes or returns the singleton IndexedDB instance.
 * Safe for SSR (resolves to null-guarded error if window is undefined).
 */
export function getOfflineDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

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
        if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORE_SYNC_QUEUE, {
            keyPath: 'id',
          });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('Tooly IndexedDB upgrade blocked by open tab');
      };
    });
  }

  return dbPromise;
}

// -------------------------------------------------------------
// CACHED ASSETS OPERATIONS
// -------------------------------------------------------------

/**
 * Stores or updates an asset in local IndexedDB cache.
 */
export async function cacheAsset(asset: ScannedAssetDetails): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getOfflineDb();
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
export async function cacheAssets(assets: ScannedAssetDetails[]): Promise<void> {
  if (typeof window === 'undefined' || assets.length === 0) return;
  try {
    const db = await getOfflineDb();
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
  qrCode: string
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  const cleanCode = qrCode.trim().toUpperCase();
  if (!cleanCode) return null;

  try {
    const db = await getOfflineDb();
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
  nfcUid: string
): Promise<ScannedAssetDetails | null> {
  return getCachedAssetByQr(nfcUid);
}

/**
 * Finds an asset by its primary ID.
 */
export async function getCachedAssetById(
  id: string
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getOfflineDb();
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
export async function getAllCachedAssets(): Promise<ScannedAssetDetails[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await getOfflineDb();
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
  updates: Partial<ScannedAssetDetails>
): Promise<ScannedAssetDetails | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getOfflineDb();
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
  payload: T
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
    const db = await getOfflineDb();
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
export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  if (typeof window === 'undefined') return [];

  try {
    const db = await getOfflineDb();
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
  errorMessage?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb();
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
export async function removeSyncItem(id: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb();
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
export async function getPendingSyncCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;

  try {
    const items = await getPendingSyncQueue();
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Clears the entire sync queue.
 */
export async function clearSyncQueue(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await getOfflineDb();
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
