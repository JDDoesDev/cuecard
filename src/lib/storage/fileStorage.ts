/**
 * File persistence for presentations (`.cuecard.json`).
 *
 * Both directions use the browser's ordinary file routes, not the File System
 * Access API: Chrome's pickers refuse some folders as "containing system
 * files" (e.g. \\wsl.localhost paths on Windows). Open uses a file input;
 * Save downloads the file, and Chrome asks where to save it when "Ask where to
 * save each file" is on. Decks aren't linked to files, so every Save writes a
 * new download; work in progress is kept by the localStorage autosave.
 */

import type { Presentation } from '@/types/presentation';
import { PresentationSchema } from '@/types/presentation';
import { migratePresentation } from '@/lib/migration/migrateSlide';
import {
  blobToDataUri,
  dataUriToBlob,
  getCachedImageBlob,
  importCachedImageBlob,
} from '@/lib/media/imageCaching';
import { collectImageCacheKeys, resolveImageReferences } from '@/lib/media/imageRestore';

// ============================================================================
// Save
// ============================================================================

/** Save the deck as a `.cuecard.json` download. Returns the file name. */
export async function saveToFile(presentation: Presentation): Promise<string> {
  const json = await serializePresentationFile(presentation);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFileName(presentation.title) + '.cuecard.json';
  a.click();
  // Revoke after the click has been handled so the download can start
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return a.download;
}

// ============================================================================
// Open
// ============================================================================

/** Open a presentation file through the browser's ordinary file input. */
export function openFromFile(): Promise<{
  success: boolean;
  presentation?: Presentation;
  fileName?: string;
}> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.cuecard.json';
    // Keep the input in the document while the picker is open so the browser
    // can't drop it (and its change event) before a file is chosen
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = () => input.remove();
    input.onchange = async () => {
      done();
      const file = input.files?.[0];
      if (!file) {
        resolve({ success: false });
        return;
      }
      try {
        const presentation = await parsePresentationFile(await file.text());
        resolve({ success: true, presentation, fileName: file.name });
      } catch (e) {
        reject(e);
      }
    };
    // Handle cancel (no file selected)
    input.addEventListener('cancel', () => {
      done();
      resolve({ success: false });
    });
    input.click();
  });
}

// ============================================================================
// Serialization (with embedded image assets)
// ============================================================================

/**
 * On-disk format: the Presentation JSON plus an optional top-level
 * `assets: { [cacheKey]: dataURI }` map holding uploaded image blobs, so a
 * file opened on another machine (or after clearing site data) still has its
 * images. Files without `assets` (older saves) remain valid.
 */
export interface PresentationFile extends Presentation {
  assets?: Record<string, string>;
}

/** User-facing error for files that can't be opened. */
export class PresentationFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresentationFileError';
  }
}

// Content-addressed keys are immutable, so data URIs can be memoized
// (avoids re-encoding every image on each save). Bounded to the keys of the
// last built file.
const dataUriCache = new Map<string, string>();

/** Builds the file JSON with image blobs embedded as data URIs. */
export async function buildPresentationFile(presentation: Presentation): Promise<PresentationFile> {
  const clone: Presentation = structuredClone(presentation);
  // Session blob URLs are meaningless outside this document; never persist them.
  for (const slide of clone.slides) {
    for (const el of slide.elements) {
      if (el.type === 'image' && (!el.cachedUrl || el.cachedUrl.startsWith('blob:'))) delete el.cachedUrl;
    }
  }

  const assets: Record<string, string> = {};
  const keys = collectImageCacheKeys(clone);
  for (const key of dataUriCache.keys()) {
    if (!keys.has(key)) dataUriCache.delete(key);
  }
  for (const key of keys) {
    let dataUri = dataUriCache.get(key);
    if (!dataUri) {
      const blob = await getCachedImageBlob(key).catch(() => undefined);
      if (!blob) continue;
      dataUri = await blobToDataUri(blob);
      dataUriCache.set(key, dataUri);
    }
    assets[key] = dataUri;
  }

  return Object.keys(assets).length > 0 ? { ...clone, assets } : clone;
}

export async function serializePresentationFile(presentation: Presentation): Promise<string> {
  return JSON.stringify(await buildPresentationFile(presentation), null, 2);
}

/**
 * Parses file text into a Presentation: validates, runs legacy migration (if
 * available), imports embedded assets into IndexedDB and links image
 * references. Throws PresentationFileError with a friendly message on failure.
 */
export async function parsePresentationFile(text: string): Promise<Presentation> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PresentationFileError('This file is not valid JSON. Make sure you picked a .cuecard.json presentation file.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PresentationFileError('This file does not contain a presentation.');
  }

  const { assets, ...rest } = data as PresentationFile;
  let candidate: unknown;
  try {
    candidate = migratePresentation(rest);
  } catch (e) {
    throw new PresentationFileError(formatValidationError(e));
  }

  const result = PresentationSchema.safeParse(candidate);
  if (!result.success) {
    throw new PresentationFileError(formatValidationError(result.error));
  }
  const presentation = result.data as Presentation;

  if (assets && typeof assets === 'object') {
    for (const [key, dataUri] of Object.entries(assets)) {
      // Only image cache entries (never e.g. the 'image-names' index)
      if (!/^image:/.test(key) || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) continue;
      try {
        const stored = await importCachedImageBlob(key, dataUriToBlob(dataUri));
        // Memoize only if the file's blob is what IndexedDB now holds
        if (stored) dataUriCache.set(key, dataUri);
      } catch (e) {
        console.warn('Skipping unreadable embedded image', key, e);
      }
    }
  }

  await resolveImageReferences(presentation);
  return presentation;
}

/**
 * Converts a validation error (zod or otherwise) into a short, readable message.
 */
export function formatValidationError(error: unknown): string {
  if (error instanceof PresentationFileError) return error.message;
  const issues = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> })?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const describe = (path: PropertyKey[]) => {
      const parts: string[] = [];
      for (let i = 0; i < path.length; i++) {
        const seg = path[i];
        const next = path[i + 1];
        if (seg === 'slides' && typeof next === 'number') { parts.push(`slide ${next + 1}`); i++; }
        else if (seg === 'elements' && typeof next === 'number') { parts.push(`element ${next + 1}`); i++; }
        else parts.push(String(seg));
      }
      return parts.length ? parts.join(' > ') : 'file';
    };
    const lines = issues.slice(0, 3).map((issue) => `${describe(issue.path)}: ${issue.message}`);
    const more = issues.length > 3 ? ` (and ${issues.length - 3} more problem${issues.length - 3 === 1 ? '' : 's'})` : '';
    return `The presentation has invalid content — ${lines.join('; ')}${more}.`;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The file could not be read.';
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'presentation';
}
