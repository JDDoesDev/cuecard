import type { Presentation } from '@/types/presentation';
import type { ImageElement } from '@/types/slide';
import {
  blobToDataUri,
  cacheImageBlob,
  dataUriToBlob,
  findCacheKeyByName,
  getCachedImage,
  getCachedImageBlob,
  getLiveUrls,
  getMissingKeys,
  markImageMissing,
  clearImageMissing,
  releaseUnreferencedUrls,
} from './imageCaching';
import { isProjectAssetUrl } from './projectAssets';

export interface CachedUrlUpdate {
  slideIndex: number;
  elementId: string;
  cachedUrl: string;
}

export interface RestoreTarget {
  slideIndex: number;
  elementId: string;
  cacheKey: string;
}

export function isImageKeyMissing(key: string): boolean {
  return getMissingKeys().has(key);
}

/** Presentation id seen by the last restore run (missing state resets on change). */
let lastRestoredPresentationId: string | null = null;

function forEachImage(
  presentation: Presentation,
  fn: (el: ImageElement, slideIndex: number) => void
) {
  presentation.slides.forEach((slide, si) => {
    for (const el of slide.elements) {
      if (el.type === 'image') fn(el, si);
    }
  });
}

/** All cache keys referenced by image elements. */
export function collectImageCacheKeys(presentation: Presentation): Set<string> {
  const result = new Set<string>();
  forEachImage(presentation, (el) => {
    if (el.cacheKey) result.add(el.cacheKey);
  });
  return result;
}

/**
 * Pure: which image elements need their cachedUrl (re)generated?
 * An element needs restoring when it has a cacheKey and its cachedUrl is not
 * the live blob URL this document holds for that key. Keys already known to be
 * missing whose cachedUrl has been cleared are skipped (avoids update loops).
 */
export function findImagesNeedingRestore(
  presentation: Presentation,
  liveUrls: ReadonlyMap<string, string>,
  missing: ReadonlySet<string> = new Set()
): RestoreTarget[] {
  const targets: RestoreTarget[] = [];
  forEachImage(presentation, (el, slideIndex) => {
    if (!el.cacheKey) return;
    const live = liveUrls.get(el.cacheKey);
    if (live && el.cachedUrl === live) return;
    if (!live && missing.has(el.cacheKey) && !el.cachedUrl) return;
    targets.push({ slideIndex, elementId: el.id, cacheKey: el.cacheKey });
  });
  return targets;
}

/**
 * Computes cachedUrl updates for the given presentation by loading blobs from
 * IndexedDB. Missing blobs produce cachedUrl '' so the renderer can fall back
 * to `url` (remote images) or show a missing-image state.
 * Missing-key state is reset when a different presentation is restored, so a
 * newly opened file gets a fresh lookup for every key.
 */
export async function computeImageRestoreUpdates(
  presentation: Presentation
): Promise<CachedUrlUpdate[]> {
  if (presentation.id !== lastRestoredPresentationId) {
    clearImageMissing();
    lastRestoredPresentationId = presentation.id;
  }
  const targets = findImagesNeedingRestore(presentation, getLiveUrls(), getMissingKeys());
  const updates: CachedUrlUpdate[] = [];
  for (const t of targets) {
    let url: string | null = null;
    try {
      url = await getCachedImage(t.cacheKey);
    } catch (e) {
      console.warn('Failed to read cached image', t.cacheKey, e);
    }
    if (!url) markImageMissing(t.cacheKey);
    updates.push({ slideIndex: t.slideIndex, elementId: t.elementId, cachedUrl: url ?? '' });
  }
  return updates;
}

/**
 * Revokes live URLs not referenced by `presentation` (call with the latest
 * store state after a restore run; pinned/recent URLs are kept).
 */
export function releaseUnreferencedImages(presentation: Presentation | null): void {
  releaseUnreferencedUrls(presentation ? collectImageCacheKeys(presentation) : new Set());
}

/** File names / paths to link to cached blobs. Project assets (`/assets/...`) are served by the dev server. */
function isLocalFileRef(url: string): boolean {
  return !!url && !/^(https?:|data:|blob:|\/\/)/i.test(url) && !isProjectAssetUrl(url);
}

/**
 * Resolves image references in a freshly opened/imported presentation
 * (mutates the given object; call before putting it in the store):
 *  - strips stale blob: cachedUrls (never valid across documents/sessions)
 *  - converts data: URIs in `url` into cached blobs (keeps localStorage small)
 *  - links bare filename references (markdown, legacy files) to cached blobs
 *    via the filename index / legacy "image:<name>-<size>" keys
 */
export async function resolveImageReferences(
  presentation: Presentation,
  extraFiles: Map<string, string> = new Map()
): Promise<void> {
  const images: ImageElement[] = [];
  forEachImage(presentation, (el) => images.push(el));

  for (const el of images) {
    if (el.cachedUrl?.startsWith('blob:')) delete el.cachedUrl;
    if (el.cacheKey) continue;

    try {
      if (el.url.startsWith('data:')) {
        const blob = dataUriToBlob(el.url);
        const { cacheKey } = await cacheImageBlob(blob);
        const ext = (blob.type.split('/')[1] || 'img').replace(/[^a-z0-9]/gi, '');
        el.cacheKey = cacheKey;
        el.url = `embedded-${cacheKey.slice(6, 14)}.${ext}`;
      } else if (isLocalFileRef(el.url)) {
        const name = el.url.split(/[\\/]/).pop()?.toLowerCase() ?? '';
        const key = extraFiles.get(name) ?? (await findCacheKeyByName(el.url));
        if (key) el.cacheKey = key;
      }
    } catch (e) {
      console.warn('Could not resolve image reference', el.url, e);
    }
  }
}

/** Filenames of local image references that could not be linked to a cached blob. */
export function findUnresolvedImageRefs(presentation: Presentation): string[] {
  const names = new Set<string>();
  forEachImage(presentation, (el) => {
    if (!el.cacheKey && isLocalFileRef(el.url)) names.add(el.url);
  });
  return [...names];
}

/**
 * Returns a deep clone of the presentation with cached images inlined as
 * data URIs in `url` (for markdown/HTML export that must travel). Images
 * without a cached blob keep their original url.
 */
export async function embedImagesForExport(presentation: Presentation): Promise<Presentation> {
  const clone: Presentation = structuredClone(presentation);
  const cache = new Map<string, string | null>();
  const images: ImageElement[] = [];
  forEachImage(clone, (el) => images.push(el));
  for (const el of images) {
    if (!el.cacheKey) continue;
    if (!cache.has(el.cacheKey)) {
      const blob = await getCachedImageBlob(el.cacheKey);
      cache.set(el.cacheKey, blob ? await blobToDataUri(blob) : null);
    }
    const dataUri = cache.get(el.cacheKey);
    if (dataUri) el.url = dataUri;
    delete el.cachedUrl;
  }
  return clone;
}
