/**
 * Storage quota checking using StorageManager API
 *
 * Provides storage usage information for IndexedDB, localStorage, and cache.
 */

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  percentUsed: number;
  canStore: (bytes: number) => boolean;
}

/**
 * Check storage quota using navigator.storage.estimate()
 *
 * Falls back to unlimited quota for browsers without StorageManager support.
 */
export async function checkStorageQuota(): Promise<StorageQuotaInfo> {
  // Check if StorageManager API is available
  if (!navigator.storage || !navigator.storage.estimate) {
    console.warn('StorageManager API not available, assuming unlimited quota');
    return {
      usage: 0,
      quota: Infinity,
      percentUsed: 0,
      canStore: () => true,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || Infinity;
    const percentUsed = quota !== Infinity ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      percentUsed,
      canStore: (bytes: number) => usage + bytes < quota,
    };
  } catch (error) {
    console.error('Failed to estimate storage quota:', error);
    return {
      usage: 0,
      quota: Infinity,
      percentUsed: 0,
      canStore: () => true,
    };
  }
}
