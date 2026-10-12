import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { Presentation, Slide, type AspectRatio } from '@/types/presentation';
import type { SlideElement, LayoutPreset } from '@/types/slide';
import { createPresetElements } from '@/lib/presets/layoutPresets';
import {
  persistConfig,
  setupStorageSync,
  setStorageStatusHandler,
  resolveStorageConflict as resolveAutosaveConflict,
} from '@/lib/storage/autosave';

// ============================================================================
// State Interface
// ============================================================================

export type ElementReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface ElementUpdate {
  id: string;
  updates: Partial<SlideElement>;
}

export interface CachedUrlUpdate {
  slideIndex: number;
  elementId: string;
  cachedUrl: string;
}

export interface PresentationState {
  presentation: Presentation | null;
  currentSlideIndex: number;

  /** Autosave failure message (e.g. storage quota exceeded). Not persisted, not undoable. */
  saveError: string | null;
  /** Informational storage notice (e.g. deck open in another editor tab). */
  storageNotice: string | null;
  /** Another editor tab saved over the deck while this tab had unsaved edits. */
  storageConflict: boolean;

  // Slide-level actions
  setPresentation: (presentation: Presentation) => void;
  updateSlide: (index: number, slide: Slide) => void;
  setSlideNotes: (slideId: string, notes: string) => void;
  addSlide: (slide: Slide, afterIndex?: number) => void;
  deleteSlide: (index: number) => void;
  duplicateSlide: (index: number) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  setCurrentSlide: (index: number) => void;

  // Element-level actions
  updateElement: (slideIndex: number, elementId: string, updates: Partial<SlideElement>) => void;
  addElement: (slideIndex: number, element: SlideElement) => void;
  deleteElement: (slideIndex: number, elementId: string) => void;
  resetToPreset: (slideIndex: number, layout: LayoutPreset) => void;
  reorderElement: (slideIndex: number, elementId: string, direction: ElementReorderDirection) => void;

  // Batch element actions (one undo entry each)
  updateElements: (slideIndex: number, updates: ElementUpdate[]) => void;
  addElements: (slideIndex: number, elements: SlideElement[]) => void;
  deleteElements: (slideIndex: number, elementIds: string[]) => void;
  reorderElements: (slideIndex: number, elementIds: string[], direction: ElementReorderDirection) => void;

  /** Update image cachedUrl values without creating undo history. */
  restoreCachedUrls: (updates: CachedUrlUpdate[]) => void;

  // Presentation-level actions
  setFonts: (fontHeading?: string, fontBody?: string) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;

  // Storage actions
  setSaveError: (message: string | null) => void;
  setStorageNotice: (message: string | null) => void;
  setStorageConflict: (conflict: boolean) => void;
  /** 'mine' keeps this tab's deck (overwrites storage); 'theirs' loads the other tab's. */
  resolveStorageConflict: (choice: 'mine' | 'theirs') => void;
  clearSavedData: () => void;
}

const HISTORY_LIMIT = 50;

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function touch(state: { presentation: Presentation | null }) {
  if (state.presentation) state.presentation.updatedAt = new Date().toISOString();
}

// ============================================================================
// Store
// ============================================================================

export const presentationStore = createStore<PresentationState>()(
  persist(
    temporal(
      immer((set, get) => ({
      presentation: null,
      currentSlideIndex: 0,
      saveError: null,
      storageNotice: null,
      storageConflict: false,

      setPresentation: (presentation) => {
        const previousId = get().presentation?.id;
        set((state) => {
          state.presentation = presentation;
          state.currentSlideIndex = 0;
        });
        // Opening/importing a different deck must not be undoable into the old one
        if (previousId !== presentation.id) {
          presentationStore.temporal.getState().clear();
        }
      },

      updateSlide: (index, slide) =>
        set((state) => {
          if (!state.presentation) return;
          if (index < 0 || index >= state.presentation.slides.length) return;

          state.presentation.slides[index] = slide;
          touch(state);
        }),

      setSlideNotes: (slideId, notes) =>
        set((state) => {
          if (!state.presentation) return;
          const slide = state.presentation.slides.find((s) => s.id === slideId);
          if (!slide || (slide.notes ?? '') === notes) return;
          slide.notes = notes;
          touch(state);
        }),

      addSlide: (slide, afterIndex) =>
        set((state) => {
          if (!state.presentation) return;
          const { slides } = state.presentation;

          const insertIndex =
            afterIndex !== undefined
              ? Math.max(0, Math.min(afterIndex + 1, slides.length))
              : slides.length;

          slides.splice(insertIndex, 0, slide);
          // Keep the same slide in view when inserting before it
          if (slides.length > 1 && insertIndex <= state.currentSlideIndex) {
            state.currentSlideIndex += 1;
          }
          state.currentSlideIndex = clampIndex(state.currentSlideIndex, slides.length);
          touch(state);
        }),

      deleteSlide: (index) =>
        set((state) => {
          if (!state.presentation) return;
          const { slides } = state.presentation;
          if (index < 0 || index >= slides.length) return;
          // Never delete the last remaining slide
          if (slides.length <= 1) return;

          slides.splice(index, 1);
          if (index < state.currentSlideIndex) {
            state.currentSlideIndex -= 1;
          }
          state.currentSlideIndex = clampIndex(state.currentSlideIndex, slides.length);
          touch(state);
        }),

      duplicateSlide: (index) =>
        set((state) => {
          if (!state.presentation) return;
          if (index < 0 || index >= state.presentation.slides.length) return;

          const original = state.presentation.slides[index];
          const duplicate = {
            ...original,
            id: crypto.randomUUID(),
            elements: original.elements.map((el) => ({
              ...el,
              id: crypto.randomUUID(),
            })),
          };

          state.presentation.slides.splice(index + 1, 0, duplicate);
          if (index + 1 <= state.currentSlideIndex) {
            state.currentSlideIndex += 1;
          }
          touch(state);
        }),

      reorderSlides: (fromIndex, toIndex) =>
        set((state) => {
          if (!state.presentation) return;
          const { slides } = state.presentation;
          if (fromIndex < 0 || fromIndex >= slides.length) return;
          if (toIndex < 0 || toIndex >= slides.length) return;
          if (fromIndex === toIndex) return;

          const [removed] = slides.splice(fromIndex, 1);
          slides.splice(toIndex, 0, removed);

          // Keep the viewed slide in view
          const current = state.currentSlideIndex;
          if (current === fromIndex) {
            state.currentSlideIndex = toIndex;
          } else if (fromIndex < current && toIndex >= current) {
            state.currentSlideIndex = current - 1;
          } else if (fromIndex > current && toIndex <= current) {
            state.currentSlideIndex = current + 1;
          }
          touch(state);
        }),

      setCurrentSlide: (index) =>
        set((state) => {
          if (!state.presentation) return;
          state.currentSlideIndex = clampIndex(index, state.presentation.slides.length);
        }),

      // Element-level actions

      updateElement: (slideIndex, elementId, updates) =>
        get().updateElements(slideIndex, [{ id: elementId, updates }]),

      addElement: (slideIndex, element) => get().addElements(slideIndex, [element]),

      deleteElement: (slideIndex, elementId) => get().deleteElements(slideIndex, [elementId]),

      updateElements: (slideIndex, updates) =>
        set((state) => {
          if (!state.presentation) return;
          const slide = state.presentation.slides[slideIndex];
          if (!slide) return;

          let changed = false;
          for (const { id, updates: patch } of updates) {
            const element = slide.elements.find((el) => el.id === id);
            if (!element) continue;
            Object.assign(element, patch);
            changed = true;
          }
          if (changed) touch(state);
        }),

      addElements: (slideIndex, elements) =>
        set((state) => {
          if (!state.presentation) return;
          const slide = state.presentation.slides[slideIndex];
          if (!slide || elements.length === 0) return;

          slide.elements.push(...elements);
          touch(state);
        }),

      deleteElements: (slideIndex, elementIds) =>
        set((state) => {
          if (!state.presentation) return;
          const slide = state.presentation.slides[slideIndex];
          if (!slide) return;

          const ids = new Set(elementIds);
          const remaining = slide.elements.filter((el) => !ids.has(el.id));
          if (remaining.length === slide.elements.length) return;
          slide.elements = remaining;
          touch(state);
        }),

      resetToPreset: (slideIndex, layout) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          const slide = state.presentation.slides[slideIndex];
          const presetElements = createPresetElements(layout);
          slide.layout = layout;

          // Match existing elements to preset slots by type (in order) and move
          // them to the slot position. Content is NEVER deleted: elements that
          // don't fit a slot keep their current position (so switching to
          // freestyle/blank keeps everything exactly where it was).
          const usedIndices = new Set<number>();
          const placed: SlideElement[] = presetElements.map((preset) => {
            const matchIdx = slide.elements.findIndex(
              (el, i) => el.type === preset.type && !usedIndices.has(i)
            );
            if (matchIdx !== -1) {
              usedIndices.add(matchIdx);
              return { ...slide.elements[matchIdx], position: { ...preset.position } } as SlideElement;
            }
            // No matching existing element — add an empty slot
            return preset;
          });
          const unmatched = slide.elements.filter((_, i) => !usedIndices.has(i));

          slide.elements = [...placed, ...unmatched];
          touch(state);
        }),

      reorderElement: (slideIndex, elementId, direction) =>
        get().reorderElements(slideIndex, [elementId], direction),

      reorderElements: (slideIndex, elementIds, direction) =>
        set((state) => {
          if (!state.presentation) return;
          const slide = state.presentation.slides[slideIndex];
          if (!slide) return;

          const ids = new Set(elementIds);
          const before = slide.elements.map((el) => el.id).join('|');
          const els = slide.elements;

          switch (direction) {
            case 'front': {
              const moving = els.filter((el) => ids.has(el.id));
              slide.elements = [...els.filter((el) => !ids.has(el.id)), ...moving];
              break;
            }
            case 'back': {
              const moving = els.filter((el) => ids.has(el.id));
              slide.elements = [...moving, ...els.filter((el) => !ids.has(el.id))];
              break;
            }
            case 'forward': {
              // Walk from the top so adjacent selected elements don't swap with each other
              for (let i = els.length - 2; i >= 0; i--) {
                if (ids.has(els[i].id) && !ids.has(els[i + 1].id)) {
                  const [el] = els.splice(i, 1);
                  els.splice(i + 1, 0, el);
                }
              }
              break;
            }
            case 'backward': {
              for (let i = 1; i < els.length; i++) {
                if (ids.has(els[i].id) && !ids.has(els[i - 1].id)) {
                  const [el] = els.splice(i, 1);
                  els.splice(i - 1, 0, el);
                }
              }
              break;
            }
          }

          if (slide.elements.map((el) => el.id).join('|') !== before) touch(state);
        }),

      restoreCachedUrls: (updates) => {
        if (updates.length === 0) return;
        const temporalApi = presentationStore.temporal.getState();
        const wasTracking = temporalApi.isTracking;
        temporalApi.pause();
        try {
          set((state) => {
            if (!state.presentation) return;
            for (const { slideIndex, elementId, cachedUrl } of updates) {
              const element = state.presentation.slides[slideIndex]?.elements.find(
                (el) => el.id === elementId
              );
              if (element && element.type === 'image') {
                element.cachedUrl = cachedUrl;
              }
            }
          });
        } finally {
          if (wasTracking) presentationStore.temporal.getState().resume();
        }
      },

      // Presentation-level actions
      setFonts: (fontHeading, fontBody) =>
        set((state) => {
          if (!state.presentation) return;
          state.presentation.fontHeading = fontHeading;
          state.presentation.fontBody = fontBody;
          touch(state);
        }),

      setAspectRatio: (aspectRatio) =>
        set((state) => {
          if (!state.presentation) return;
          state.presentation.aspectRatio = aspectRatio;
          touch(state);
        }),

      // Storage actions
      setSaveError: (message) =>
        set((state) => {
          state.saveError = message;
        }),

      setStorageNotice: (message) =>
        set((state) => {
          state.storageNotice = message;
        }),

      setStorageConflict: (conflict) =>
        set((state) => {
          state.storageConflict = conflict;
        }),

      resolveStorageConflict: (choice) => {
        resolveAutosaveConflict(choice);
      },

      clearSavedData: () => {
        presentationStore.persist.clearStorage();
      },
      })),
      {
        limit: HISTORY_LIMIT,
        partialize: (state) => ({ presentation: state.presentation }),
        // Immer gives structural sharing: an unchanged presentation keeps its reference
        equality: (pastState, currentState) => pastState.presentation === currentState.presentation,
      }
    ),
    persistConfig
  )
);

// ============================================================================
// History batching / coalescing
// ============================================================================

let batchOpen = false;
let batchStart: Presentation | null = null;

/**
 * Start a history batch: all store changes until endHistoryBatch() produce a
 * single undo entry. Used for drag/resize gestures. Not nestable: starting a
 * new gesture first commits a stale batch whose end event was lost.
 */
export function beginHistoryBatch(): void {
  if (batchOpen) endHistoryBatch();
  batchOpen = true;
  batchStart = presentationStore.getState().presentation;
  presentationStore.temporal.getState().pause();
}

/** End the history batch, committing one undo entry if anything changed. */
export function endHistoryBatch(): void {
  if (!batchOpen) return;
  batchOpen = false;

  const temporalStore = presentationStore.temporal;
  temporalStore.getState().resume();
  const start = batchStart;
  batchStart = null;
  if (start === presentationStore.getState().presentation) return;

  temporalStore.setState((s) => ({
    pastStates: [...s.pastStates, { presentation: start }].slice(-HISTORY_LIMIT),
    futureStates: [],
  }));
}

/** Abandon an open batch without recording it (e.g. the deck was replaced from another tab). */
export function discardHistoryBatch(): void {
  if (!batchOpen) return;
  batchOpen = false;
  batchStart = null;
  presentationStore.temporal.getState().resume();
}

export function isHistoryBatchOpen(): boolean {
  return batchOpen;
}

/** Run `fn` so that all store changes it makes form one undo entry. */
export function runInHistoryBatch(fn: () => void): void {
  beginHistoryBatch();
  try {
    fn();
  } finally {
    endHistoryBatch();
  }
}

const COALESCE_IDLE_MS = 1000;
let coalesceKey: string | null = null;
let coalesceTime = 0;
let coalesceTop: unknown = undefined;

/**
 * Run a store update, merging it into the previous undo entry when it is part
 * of the same burst (same key, within the idle window, and no other history
 * entry was recorded in between). Used for typing in inputs/editors and
 * arrow-key nudges so a burst becomes one undo step.
 */
export function coalesceHistory(key: string, fn: () => void, idleMs = COALESCE_IDLE_MS): void {
  const temporalStore = presentationStore.temporal;
  const topBefore = temporalStore.getState().pastStates.at(-1);
  const now = Date.now();
  const continuing =
    !batchOpen &&
    coalesceKey === key &&
    now - coalesceTime <= idleMs &&
    topBefore !== undefined &&
    topBefore === coalesceTop;

  if (continuing) {
    // The burst's first entry already restores the pre-burst state: apply this
    // update untracked (recording then popping would evict the oldest entry
    // when history is full).
    temporalStore.getState().pause();
    try {
      fn();
    } finally {
      temporalStore.getState().resume();
    }
  } else {
    fn();
  }

  coalesceKey = key;
  coalesceTime = now;
  coalesceTop = temporalStore.getState().pastStates.at(-1);
}

/** End any in-progress coalescing burst (e.g. on blur). */
export function resetHistoryCoalescing(): void {
  coalesceKey = null;
  coalesceTop = undefined;
}

// ============================================================================
// Invariants & persistence wiring
// ============================================================================

// Keep currentSlideIndex in range whenever slides change (undo/redo, rehydrate, etc.).
// The presentation reference is unchanged, so this never creates undo history.
presentationStore.subscribe((state) => {
  const count = state.presentation?.slides.length ?? 0;
  const clamped = clampIndex(state.currentSlideIndex, count);
  if (clamped !== state.currentSlideIndex) {
    presentationStore.setState({ currentSlideIndex: clamped });
  }
});

// Safety net for lost gesture ends (alt-tab mid-drag, context menu, pointer
// capture loss): close an open drag/resize batch so history isn't paused forever.
if (typeof window !== 'undefined') {
  let pointerDown = false;
  window.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const release = () => {
    pointerDown = false;
    endHistoryBatch();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    window.addEventListener(type, release, true);
  }
  // Window blur only (element blur events also reach a capturing window listener)
  window.addEventListener('blur', (e) => {
    if (e.target === window) release();
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') release();
  });
  // Any store change while no pointer is down can't be part of a gesture
  presentationStore.subscribe(() => {
    if (batchOpen && !pointerDown) endHistoryBatch();
  });
}

// Initial hydration must not be undoable
presentationStore.temporal.getState().clear();

setStorageStatusHandler((patch) => {
  const state = presentationStore.getState();
  if (patch.saveError !== undefined && patch.saveError !== state.saveError) {
    state.setSaveError(patch.saveError);
  }
  if (patch.storageNotice !== undefined && patch.storageNotice !== state.storageNotice) {
    state.setStorageNotice(patch.storageNotice);
  }
  if (patch.storageConflict !== undefined && patch.storageConflict !== state.storageConflict) {
    state.setStorageConflict(patch.storageConflict);
  }
});

// Cross-window sync: presenter/audience live-update; detect other editor tabs
setupStorageSync(presentationStore, {
  // A drag in progress must not commit (or later undo into) the pre-sync deck
  beforeExternalRehydrate: () => {
    discardHistoryBatch();
    resetHistoryCoalescing();
  },
});

// ============================================================================
// Selectors
// ============================================================================

// Legacy alias for test compatibility (.getState, .setState, .temporal)
export const usePresentationStore = presentationStore;

export function selectCurrentSlide(state: PresentationState): Slide | undefined {
  if (!state.presentation) return undefined;
  return state.presentation.slides[state.currentSlideIndex];
}

export function selectSlideCount(state: PresentationState): number {
  return state.presentation?.slides.length ?? 0;
}
