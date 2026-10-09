/**
 * File System persistence for presentations.
 *
 * Uses the File System Access API when available (Chromium browsers)
 * with fallback to download/upload for other browsers.
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
// File Handle State
// ============================================================================

let currentFileHandle: FileSystemFileHandle | null = null;
// Id of the presentation the open file belongs to. Writes for any other deck
// (after Import, New, etc.) must never land in this file.
let currentFilePresentationId: string | null = null;

export function getFileHandle(): FileSystemFileHandle | null {
  return currentFileHandle;
}

export function setFileHandle(handle: FileSystemFileHandle | null, presentationId: string | null = null) {
  if (handle !== currentFileHandle) resetFileCaches();
  currentFileHandle = handle;
  currentFilePresentationId = handle ? presentationId : null;
}

/** True when the open file belongs to this presentation. */
export function isFileForPresentation(presentation: Presentation): boolean {
  return currentFileHandle !== null && currentFilePresentationId === presentation.id;
}

export function getFileName(): string | null {
  return currentFileHandle?.name ?? null;
}

/**
 * Check if the File System Access API is available.
 */
export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

// ============================================================================
// Save
// ============================================================================

const FILE_OPTIONS = {
  types: [
    {
      description: 'Cuecard Presentation',
      accept: { 'application/json': ['.cuecard.json', '.json'] },
    },
  ],
};

/**
 * Save presentation to a file. If a file handle exists, writes to it silently.
 * Otherwise opens a save dialog (File System Access API) or triggers a download.
 */
export async function saveToFile(
  presentation: Presentation,
  forceNewFile = false
): Promise<{ success: boolean; fileName?: string }> {
  const json = await serializePresentationFile(presentation);

  // Try writing to existing file handle first
  if (!forceNewFile && currentFileHandle && isFileForPresentation(presentation)) {
    try {
      const writable = await currentFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      lastWrittenSignature = contentSignature(presentation);
      return { success: true, fileName: currentFileHandle.name };
    } catch {
      // Permission revoked or file moved — fall through to picker
      setFileHandle(null);
    }
  }

  // File System Access API
  if (hasFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: sanitizeFileName(presentation.title) + '.cuecard.json',
        ...FILE_OPTIONS,
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      setFileHandle(handle, presentation.id);
      lastWrittenSignature = contentSignature(presentation);
      return { success: true, fileName: handle.name };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { success: false }; // User cancelled
      throw e;
    }
  }

  // Fallback: download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFileName(presentation.title) + '.cuecard.json';
  a.click();
  URL.revokeObjectURL(url);
  return { success: true, fileName: a.download };
}

/**
 * Write to current file handle silently (for auto-save).
 * Returns false if no handle or write failed.
 */
export async function writeToCurrentFile(presentation: Presentation): Promise<boolean> {
  if (!currentFileHandle) return false;
  if (!isFileForPresentation(presentation)) {
    // A different deck is loaded: detach from the file instead of overwriting it
    setFileHandle(null);
    return false;
  }

  // Skip writes when nothing persistable changed (e.g. only session cachedUrls
  // were regenerated after opening the file).
  const signature = contentSignature(presentation);
  if (signature === lastWrittenSignature) return true;

  try {
    const json = await serializePresentationFile(presentation);
    const writable = await currentFileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    lastWrittenSignature = signature;
    return true;
  } catch {
    // Handle was revoked or file removed
    setFileHandle(null);
    return false;
  }
}

// ============================================================================
// Open
// ============================================================================

/**
 * Open a presentation file. Uses File System Access API or fallback file input.
 */
export async function openFromFile(): Promise<{
  success: boolean;
  presentation?: Presentation;
  fileName?: string;
}> {
  // File System Access API
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker({
        ...FILE_OPTIONS,
        multiple: false,
      });
      const file = await handle.getFile();
      const presentation = await parsePresentationFile(await file.text());
      // Switch the active handle only after a successful parse
      if (handle !== currentFileHandle) dataUriCache.clear();
      currentFileHandle = handle;
      currentFilePresentationId = presentation.id;
      lastWrittenSignature = contentSignature(presentation);
      return { success: true, presentation, fileName: handle.name };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { success: false }; // User cancelled
      throw e;
    }
  }

  // Fallback: file input
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.cuecard.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ success: false });
        return;
      }
      try {
        const presentation = await parsePresentationFile(await file.text());
        // Fallback has no writable handle: drop any stale one so auto-save
        // doesn't write this presentation into the previously opened file.
        setFileHandle(null);
        resolve({ success: true, presentation, fileName: file.name });
      } catch (e) {
        reject(e);
      }
    };
    // Handle cancel (no file selected)
    input.addEventListener('cancel', () => resolve({ success: false }));
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
// (avoids re-encoding every image on each auto-save). Bounded to the keys of
// the last built file and cleared when the active file changes.
const dataUriCache = new Map<string, string>();

/** Signature of the last content written to / read from the active file. */
let lastWrittenSignature: string | null = null;

function resetFileCaches() {
  dataUriCache.clear();
  lastWrittenSignature = null;
}

/** Serialization of persistable content (ignores session-only cachedUrl). */
export function contentSignature(presentation: Presentation): string {
  return JSON.stringify(presentation, (key, value) => (key === 'cachedUrl' ? undefined : value));
}

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
