/**
 * Auto-save configuration for Zustand persist middleware
 *
 * Persists presentation data to localStorage with version tracking for future migrations.
 * Also writes to the filesystem when a file handle is active.
 * Excludes currentSlideIndex and undo history to minimize storage size.
 */

import type { PresentationState } from '@/store/presentationStore';
import { writeToCurrentFile, getFileHandle } from './fileStorage';

export const AUTOSAVE_KEY = 'fldc-presentation';

/**
 * Debounced file-system write triggered alongside localStorage auto-save.
 */
let fsWriteTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFileWrite(presentation: any) {
  if (!getFileHandle()) return;
  if (fsWriteTimer) clearTimeout(fsWriteTimer);
  fsWriteTimer = setTimeout(() => {
    writeToCurrentFile(presentation).catch((err) =>
      console.warn('Auto-save to file failed:', err)
    );
  }, 2000);
}

/**
 * Persist configuration for Zustand persist middleware
 */
export const persistConfig = {
  name: AUTOSAVE_KEY,
  version: 1,

  // Only persist the presentation data, not currentSlideIndex or temporal history
  partialize: (state: PresentationState) => ({ presentation: state.presentation }),

  // Log rehydration for debugging
  onRehydrationStorage: () => {
    return (state: any, error: any) => {
      if (error) {
        console.error('Failed to rehydrate presentation from localStorage:', error);
      } else if (state?.presentation) {
        console.log('Presentation rehydrated from auto-save:', state.presentation.title);
      }
    };
  },
};

/**
 * Subscribe to store changes and auto-save to filesystem.
 * Call this once after store creation.
 */
export function setupFileAutoSave(store: {
  getState: () => PresentationState;
  subscribe: (listener: (state: PresentationState) => void) => () => void;
}) {
  return store.subscribe((state) => {
    if (state.presentation) {
      scheduleFileWrite(state.presentation);
    }
  });
}
