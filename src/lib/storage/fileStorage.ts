/**
 * File System persistence for presentations.
 *
 * Uses the File System Access API when available (Chromium browsers)
 * with fallback to download/upload for other browsers.
 */

import type { Presentation } from '@/types/presentation';
import { PresentationSchema } from '@/types/presentation';

// ============================================================================
// File Handle State
// ============================================================================

let currentFileHandle: FileSystemFileHandle | null = null;

export function getFileHandle(): FileSystemFileHandle | null {
  return currentFileHandle;
}

export function setFileHandle(handle: FileSystemFileHandle | null) {
  currentFileHandle = handle;
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
      description: 'FLDC Presentation',
      accept: { 'application/json': ['.fldc.json', '.json'] },
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
  const json = JSON.stringify(presentation, null, 2);

  // Try writing to existing file handle first
  if (!forceNewFile && currentFileHandle) {
    try {
      const writable = await currentFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return { success: true, fileName: currentFileHandle.name };
    } catch {
      // Permission revoked or file moved — fall through to picker
      currentFileHandle = null;
    }
  }

  // File System Access API
  if (hasFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: sanitizeFileName(presentation.title) + '.fldc.json',
        ...FILE_OPTIONS,
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      currentFileHandle = handle;
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
  a.download = sanitizeFileName(presentation.title) + '.fldc.json';
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

  try {
    const json = JSON.stringify(presentation, null, 2);
    const writable = await currentFileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return true;
  } catch {
    // Handle was revoked or file removed
    currentFileHandle = null;
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
      const text = await file.text();
      const data = JSON.parse(text);
      const presentation = PresentationSchema.parse(data);
      currentFileHandle = handle;
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
    input.accept = '.json,.fldc.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ success: false });
        return;
      }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const presentation = PresentationSchema.parse(data);
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
// Helpers
// ============================================================================

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'presentation';
}
