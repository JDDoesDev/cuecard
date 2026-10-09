import { get, set, del, keys } from 'idb-keyval';

/**
 * Stores a blob in IndexedDB and returns a blob URL.
 * Key format: "image:{hash}" where hash is based on file name/size for uploads,
 * or the URL for remote images.
 */
export async function cacheImage(key: string, blob: Blob): Promise<string> {
  await set(key, blob);
  const blobUrl = URL.createObjectURL(blob);
  return blobUrl;
}

/**
 * Retrieves a cached image from IndexedDB and returns a blob URL.
 * Returns null if not found.
 */
export async function getCachedImage(key: string): Promise<string | null> {
  const blob = await get<Blob>(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Deletes an image from IndexedDB.
 * Does NOT revoke blob URL - caller's responsibility.
 */
export async function deleteCachedImage(key: string): Promise<void> {
  await del(key);
}

/**
 * Lists all cached image keys.
 */
export async function listCachedImages(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys.filter((key) => typeof key === 'string' && key.startsWith('image:')) as string[];
}
