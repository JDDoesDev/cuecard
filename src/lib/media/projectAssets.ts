import type { Presentation } from '@/types/presentation';
import type { ImageElement } from '@/types/slide';
import type { ProjectAssetLink } from '@/store/presentationStore';
import { cacheImageBlob, getCachedImageBlob } from './imageCaching';
import { compressForSlide } from './imageCompression';

/**
 * Project assets: image files under the project's `public/assets/` folder,
 * referenced from slides as `/assets/<name>`. A deck folder holds a single
 * slideshow, so committing the folder (deck JSON + public/assets) moves
 * everything to another machine; the JSON only stores the paths.
 *
 * Writing and listing go through the dev server (`vite/projectAssets.ts`).
 * A static build has no dev server, so images stay in the IndexedDB cache and
 * are embedded in saved deck files instead.
 */

const API = '/__cuecard/assets';

/** True when the dev server that writes to public/assets is running. */
export const projectAssetsEnabled = import.meta.env.DEV;

export interface ProjectAsset {
  /** Path relative to public/assets, e.g. "logo.png" or "team/alex.jpg" */
  name: string;
  /** URL to use as an image element's `url`, e.g. "/assets/logo.png" */
  url: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

/** `name` with the extension that matches the blob's type (compression may change it). */
export function assetFileName(name: string, type: string): string {
  const base = name.split(/[\\/]/).pop() || 'image';
  const ext = EXTENSIONS[type];
  if (!ext) return base;
  const stem = base.replace(/\.[^.]*$/, '') || 'image';
  return `${stem}.${ext}`;
}

export function isProjectAssetUrl(url: string): boolean {
  return url.trim().startsWith('/assets/');
}

/** Writes the image to public/assets and returns its `/assets/...` URL. Throws without the dev server. */
export async function saveProjectAsset(blob: Blob, name: string): Promise<string> {
  const fileName = assetFileName(name, blob.type);
  const res = await fetch(`${API}?name=${encodeURIComponent(fileName)}`, { method: 'POST', body: blob });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error || `Saving ${fileName} failed`);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export interface AddedImage {
  /** Element `url`: `/assets/<name>` for a project file, else the original file name */
  url: string;
  /** Set when the image went to the IndexedDB cache instead */
  cacheKey?: string;
  blobUrl?: string;
}

/**
 * Stores an image the user added: as a file in public/assets when the dev
 * server is running, otherwise in the IndexedDB cache. If writing the file
 * fails the image is cached, and the next Save retries moving it.
 */
export async function addImageFile(file: File, { compress = true } = {}): Promise<AddedImage> {
  const blob = compress ? await compressForSlide(file) : file;
  if (projectAssetsEnabled) {
    try {
      return { url: await saveProjectAsset(blob, file.name) };
    } catch (e) {
      console.warn(`Could not write ${file.name} to public/assets; keeping it in the browser cache.`, e);
    }
  }
  // Content-addressed key (image:<sha256>): distinct files never collide
  const { cacheKey, blobUrl } = await cacheImageBlob(blob, file.name);
  return { url: file.name, cacheKey, blobUrl };
}

/** Images in public/assets (empty without the dev server). */
export async function listProjectAssets(): Promise<ProjectAsset[]> {
  if (!projectAssetsEnabled) return [];
  try {
    const res = await fetch(API);
    if (!res.ok) return [];
    const { files } = (await res.json()) as { files: ProjectAsset[] };
    return files;
  } catch {
    return [];
  }
}

/**
 * Writes every image still held only in IndexedDB (`cacheKey`) to
 * public/assets and returns the links for the store's `linkProjectAssets`.
 * Images whose blob is gone or that can't be written are skipped.
 */
export async function moveCachedImagesToProject(presentation: Presentation): Promise<ProjectAssetLink[]> {
  if (!projectAssetsEnabled) return [];
  const urls = new Map<string, string>();
  const updates: ProjectAssetLink[] = [];
  for (const [slideIndex, slide] of presentation.slides.entries()) {
    for (const el of slide.elements) {
      if (el.type !== 'image' || !el.cacheKey) continue;
      let url = urls.get(el.cacheKey);
      if (!url) {
        const blob = await getCachedImageBlob(el.cacheKey);
        if (!blob) continue;
        try {
          url = await saveProjectAsset(blob, imageFileName(el));
        } catch (e) {
          // Leave this one cached (it's embedded in the saved file); keep moving the rest
          console.warn(`Could not write ${imageFileName(el)} to public/assets`, e);
          continue;
        }
        urls.set(el.cacheKey, url);
      }
      updates.push({ slideIndex, elementId: el.id, url });
    }
  }
  return updates;
}

/** A file name for an uploaded image: its original name, else alt text, else "image". */
function imageFileName(el: ImageElement): string {
  const fromUrl = /^(blob:|data:|https?:)/i.test(el.url.trim()) ? '' : el.url.trim();
  if (fromUrl) return fromUrl;
  const fromAlt = (el.alt ?? '').trim().slice(0, 60);
  return fromAlt || 'image';
}
