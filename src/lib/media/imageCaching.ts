import { get, set, del, keys } from 'idb-keyval';

/**
 * Image cache backed by IndexedDB.
 *
 * Keys are content-addressed: "image:<sha256 hex of the blob>". Older
 * presentations may still reference legacy keys ("image:<name>-<size>" or
 * "image:<url>"); those keep working as opaque keys.
 *
 * Blob URLs are only valid for the lifetime of the document that created them,
 * so we keep one live object URL per cache key in a module-level map and reuse
 * it instead of minting a new URL on every lookup.
 */

/** IndexedDB key holding a { [fileName]: cacheKey } index (not prefixed with "image:"). */
const NAME_INDEX_KEY = 'image-names';

const liveUrls = new Map<string, string>();
/** When each live URL was created (recent URLs are never released). */
const liveUrlCreatedAt = new Map<string, number>();
/** Ref-counted keys whose URLs must not be released (e.g. import preview). */
const pinnedKeys = new Map<string, number>();
/** Cache keys whose blobs were not found in IndexedDB this session. */
const missingKeys = new Set<string>();

/** URLs younger than this are kept even if unreferenced (in-flight uploads). */
const RELEASE_GRACE_MS = 10_000;

// ============================================================================
// Hashing / encoding helpers (pure, unit-tested)
// ============================================================================

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

/**
 * Computes the content-addressed cache key for a blob: "image:<sha256>".
 */
export async function hashImageBlob(blob: Blob): Promise<string> {
  const buffer = await blobToArrayBuffer(blob);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `image:${hex}`;
}

/** Encodes a blob as a base64 data URI. */
export async function blobToDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blobToArrayBuffer(blob));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/** Decodes a data URI (base64 or URL-encoded) into a Blob. */
export function dataUriToBlob(dataUri: string): Blob {
  const match = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(dataUri);
  if (!match) throw new Error('Invalid data URI');
  const mime = match[1] || 'application/octet-stream';
  const payload = match[4];
  if (match[3]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

// ============================================================================
// Live blob URL registry
// ============================================================================

/** True if `url` is the live blob URL this document created for `key`. */
export function isLiveUrl(key: string, url: string | undefined): boolean {
  return !!url && liveUrls.get(key) === url;
}

/** Snapshot of the live key → URL map (for pure restore computations). */
export function getLiveUrls(): ReadonlyMap<string, string> {
  return liveUrls;
}

function registerLiveUrl(key: string, blob: Blob): string {
  missingKeys.delete(key);
  const existing = liveUrls.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  liveUrls.set(key, url);
  liveUrlCreatedAt.set(key, Date.now());
  return url;
}

/**
 * Revokes live blob URLs whose keys are no longer referenced. Pinned keys and
 * URLs created within the grace period are kept.
 */
export function releaseUnreferencedUrls(referencedKeys: Set<string>, now = Date.now()): void {
  for (const [key, url] of liveUrls) {
    if (referencedKeys.has(key) || pinnedKeys.has(key)) continue;
    if (now - (liveUrlCreatedAt.get(key) ?? 0) < RELEASE_GRACE_MS) continue;
    URL.revokeObjectURL(url);
    liveUrls.delete(key);
    liveUrlCreatedAt.delete(key);
  }
}

/** Prevents URLs for these keys from being released until unpinned. */
export function pinImageKeys(keys: Iterable<string>): void {
  for (const key of keys) pinnedKeys.set(key, (pinnedKeys.get(key) ?? 0) + 1);
}

export function unpinImageKeys(keys: Iterable<string>): void {
  for (const key of keys) {
    const n = (pinnedKeys.get(key) ?? 0) - 1;
    if (n > 0) pinnedKeys.set(key, n);
    else pinnedKeys.delete(key);
  }
}

// ============================================================================
// Missing-key tracking
// ============================================================================

export function getMissingKeys(): ReadonlySet<string> {
  return missingKeys;
}

export function markImageMissing(key: string): void {
  missingKeys.add(key);
}

/** Forget missing state (one key, or all) so the keys are retried. */
export function clearImageMissing(key?: string): void {
  if (key === undefined) missingKeys.clear();
  else missingKeys.delete(key);
}

// ============================================================================
// Cache operations
// ============================================================================

/**
 * Stores a blob in IndexedDB under the given key and returns a live blob URL.
 */
export async function cacheImage(key: string, blob: Blob): Promise<string> {
  await set(key, blob);
  missingKeys.delete(key);
  return registerLiveUrl(key, blob);
}

/**
 * Stores a blob under its content hash. Optionally records `fileName` so that
 * markdown/legacy references by filename can be resolved later.
 */
export async function cacheImageBlob(
  blob: Blob,
  fileName?: string
): Promise<{ cacheKey: string; blobUrl: string }> {
  const cacheKey = await hashImageBlob(blob);
  const existing = await get<Blob>(cacheKey);
  if (!existing) await set(cacheKey, blob);
  missingKeys.delete(cacheKey);
  if (fileName) await rememberImageName(fileName, cacheKey);
  return { cacheKey, blobUrl: registerLiveUrl(cacheKey, existing ?? blob) };
}

/**
 * Returns the live blob URL for a cached image, loading it from IndexedDB if
 * needed. Returns null if the blob is not in the cache.
 */
export async function getCachedImage(key: string): Promise<string | null> {
  const live = liveUrls.get(key);
  if (live) return live;
  const blob = await get<Blob>(key);
  if (!blob) return null;
  return registerLiveUrl(key, blob);
}

/**
 * Retrieves the raw cached blob (e.g. for embedding in exports).
 */
export async function getCachedImageBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key);
}

/**
 * Stores a blob under an explicit key only if absent (used when importing file
 * assets). Returns true if `blob` was stored, false if a blob already existed.
 */
export async function importCachedImageBlob(key: string, blob: Blob): Promise<boolean> {
  const existing = await get<Blob>(key);
  if (!existing) await set(key, blob);
  missingKeys.delete(key);
  return !existing;
}

/**
 * Deletes an image from IndexedDB and revokes its live blob URL.
 */
export async function deleteCachedImage(key: string): Promise<void> {
  const live = liveUrls.get(key);
  if (live) {
    URL.revokeObjectURL(live);
    liveUrls.delete(key);
    liveUrlCreatedAt.delete(key);
  }
  await del(key);
}

/**
 * Lists all cached image keys.
 */
export async function listCachedImages(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys.filter((key) => typeof key === 'string' && key.startsWith('image:')) as string[];
}

// ============================================================================
// Filename index (for resolving markdown / legacy filename references)
// ============================================================================

function baseName(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const parts = clean.split(/[\\/]/);
  try {
    return decodeURIComponent(parts[parts.length - 1]).toLowerCase();
  } catch {
    return parts[parts.length - 1].toLowerCase();
  }
}

export async function rememberImageName(fileName: string, cacheKey: string): Promise<void> {
  const index = (await get<Record<string, string>>(NAME_INDEX_KEY)) ?? {};
  index[baseName(fileName)] = cacheKey;
  await set(NAME_INDEX_KEY, index);
}

/**
 * Finds a cache key for a filename reference (e.g. "photo.png" or "img/photo.png").
 * Checks the filename index first, then legacy "image:<name>-<size>" keys.
 */
export async function findCacheKeyByName(fileRef: string): Promise<string | null> {
  const name = baseName(fileRef);
  if (!name) return null;
  const index = (await get<Record<string, string>>(NAME_INDEX_KEY)) ?? {};
  if (index[name]) return index[name];

  const legacyPrefix = `image:${name}-`;
  const legacy = (await listCachedImages()).filter((k) => {
    const lower = k.toLowerCase();
    return lower.startsWith(legacyPrefix) && /^\d+$/.test(k.slice(legacyPrefix.length));
  });
  return legacy.length > 0 ? legacy[legacy.length - 1] : null;
}
