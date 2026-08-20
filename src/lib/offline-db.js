/**
 * IndexedDB wrapper for offline-first data storage.
 *
 * Teachers can mark attendance, enter grades, and create resources offline.
 * Changes are queued in IndexedDB and synced when connectivity returns.
 *
 * Architecture:
 *   - Pending changes stored in IndexedDB with a sync queue
 *   - Service worker intercepts fetch requests when offline
 *   - Background sync replays queued operations when back online
 *   - Read data is cached in IndexedDB for offline viewing
 */

const DB_NAME = "edutrack-offline";
const DB_VERSION = 1;

const STORES = {
  PENDING: "pendingChanges",    // Queued write operations
  CACHE: "dataCache",           // Cached read data
  SYNC_STATUS: "syncStatus",   // Last sync timestamps
};

let _db = null;

/**
 * Open the IndexedDB database (creates on first use).
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Pending changes queue
      if (!db.objectStoreNames.contains(STORES.PENDING)) {
        const store = db.createObjectStore(STORES.PENDING, { keyPath: "id", autoIncrement: true });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
      }

      // Cached data
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        const store = db.createObjectStore(STORES.CACHE, { keyPath: "key" });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }

      // Sync status
      if (!db.objectStoreNames.contains(STORES.SYNC_STATUS)) {
        db.createObjectStore(STORES.SYNC_STATUS, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Queue a write operation for later sync.
 *
 * @param {Object} change
 * @param {string} change.type — "attendance" | "grade" | "resource" | "message"
 * @param {string} change.endpoint — API endpoint to call
 * @param {string} change.method — HTTP method
 * @param {Object} change.body — request body
 * @param {string} [change.description] — human-readable description
 */
export async function queueChange(change) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING, "readwrite");
    const store = tx.objectStore(STORES.PENDING);
    const record = {
      ...change,
      timestamp: Date.now(),
      synced: false,
      retryCount: 0,
    };
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending (unsynced) changes.
 */
export async function getPendingChanges() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING, "readonly");
    const store = tx.objectStore(STORES.PENDING);
    const index = store.index("synced");
    const request = index.getAll(IDBKeyRange.only(false));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mark a change as synced.
 */
export async function markSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING, "readwrite");
    const store = tx.objectStore(STORES.PENDING);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result;
      if (record) {
        record.synced = true;
        record.syncedAt = Date.now();
        store.put(record);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a synced change (cleanup).
 */
export async function removeSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING, "readwrite");
    const store = tx.objectStore(STORES.PENDING);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Cache read data for offline viewing.
 *
 * @param {string} key — cache key (e.g. "grades-SS1-Science")
 * @param {any} data — data to cache
 * @param {number} [ttlMs=3600000] — time to live (default 1 hour)
 */
export async function cacheData(key, data, ttlMs = 3600000) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHE, "readwrite");
    const store = tx.objectStore(STORES.CACHE);
    const record = {
      key,
      data,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now(),
    };
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached data (returns null if expired or missing).
 */
export async function getCachedData(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHE, "readonly");
    const store = tx.objectStore(STORES.CACHE);
    const request = store.get(key);
    request.onsuccess = () => {
      const record = request.result;
      if (!record || Date.now() > record.expiresAt) {
        resolve(null);
      } else {
        resolve(record.data);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear expired cache entries.
 */
export async function clearExpiredCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHE, "readwrite");
    const store = tx.objectStore(STORES.CACHE);
    const index = store.index("expiresAt");
    const range = IDBKeyRange.upperBound(Date.now());
    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get sync status (last successful sync time).
 */
export async function getSyncStatus(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_STATUS, "readonly");
    const store = tx.objectStore(STORES.SYNC_STATUS);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.timestamp || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update sync status.
 */
export async function setSyncStatus(key, timestamp = Date.now()) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_STATUS, "readwrite");
    const store = tx.objectStore(STORES.SYNC_STATUS);
    const request = store.put({ key, timestamp });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get count of pending changes.
 */
export async function getPendingCount() {
  const changes = await getPendingChanges();
  return changes.length;
}

/**
 * Check if the browser is online.
 */
export function isOnline() {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/**
 * Get pending changes summary by type.
 */
export async function getPendingSummary() {
  const changes = await getPendingChanges();
  const summary = {};
  for (const c of changes) {
    summary[c.type] = (summary[c.type] || 0) + 1;
  }
  return { total: changes.length, byType: summary };
}
