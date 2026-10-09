import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { Presentation, Slide } from '@/types/presentation';
import type { SlideElement, LayoutPreset } from '@/types/slide';
import { createPresetElements } from '@/lib/presets/layoutPresets';
import { persistConfig, AUTOSAVE_KEY, setupFileAutoSave } from '@/lib/storage/autosave';

// ============================================================================
// State Interface
// ============================================================================

export interface PresentationState {
  presentation: Presentation | null;
  currentSlideIndex: number;

  // Slide-level actions
  setPresentation: (presentation: Presentation) => void;
  updateSlide: (index: number, slide: Slide) => void;
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
  reorderElement: (slideIndex: number, elementId: string, direction: 'forward' | 'backward' | 'front' | 'back') => void;

  // Presentation-level actions
  setFonts: (fontHeading?: string, fontBody?: string) => void;

  // Storage actions
  clearSavedData: () => void;
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

      setPresentation: (presentation) =>
        set((state) => {
          state.presentation = presentation;
          state.currentSlideIndex = 0;
        }),

      updateSlide: (index, slide) =>
        set((state) => {
          if (!state.presentation) return;
          if (index < 0 || index >= state.presentation.slides.length) return;

          state.presentation.slides[index] = slide;
          state.presentation.updatedAt = new Date().toISOString();
        }),

      addSlide: (slide, afterIndex) =>
        set((state) => {
          if (!state.presentation) return;

          const insertIndex =
            afterIndex !== undefined ? afterIndex + 1 : state.presentation.slides.length;

          state.presentation.slides.splice(insertIndex, 0, slide);
          state.presentation.updatedAt = new Date().toISOString();
        }),

      deleteSlide: (index) =>
        set((state) => {
          if (!state.presentation) return;
          if (index < 0 || index >= state.presentation.slides.length) return;

          state.presentation.slides.splice(index, 1);
          state.presentation.updatedAt = new Date().toISOString();

          // Adjust currentSlideIndex if needed
          if (state.currentSlideIndex >= state.presentation.slides.length) {
            state.currentSlideIndex = Math.max(0, state.presentation.slides.length - 1);
          }
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
          state.presentation.updatedAt = new Date().toISOString();
        }),

      reorderSlides: (fromIndex, toIndex) =>
        set((state) => {
          if (!state.presentation) return;
          const { slides } = state.presentation;
          if (fromIndex < 0 || fromIndex >= slides.length) return;
          if (toIndex < 0 || toIndex >= slides.length) return;

          const [removed] = slides.splice(fromIndex, 1);
          slides.splice(toIndex, 0, removed);
          state.presentation.updatedAt = new Date().toISOString();
        }),

      setCurrentSlide: (index) =>
        set((state) => {
          if (!state.presentation) return;

          const maxIndex = Math.max(0, state.presentation.slides.length - 1);
          state.currentSlideIndex = Math.max(0, Math.min(index, maxIndex));
        }),

      // Element-level actions

      updateElement: (slideIndex, elementId, updates) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          const slide = state.presentation.slides[slideIndex];
          const elementIndex = slide.elements.findIndex((el) => el.id === elementId);
          if (elementIndex === -1) return;

          Object.assign(slide.elements[elementIndex], updates);
          state.presentation.updatedAt = new Date().toISOString();
        }),

      addElement: (slideIndex, element) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          state.presentation.slides[slideIndex].elements.push(element);
          state.presentation.updatedAt = new Date().toISOString();
        }),

      deleteElement: (slideIndex, elementId) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          const slide = state.presentation.slides[slideIndex];
          const elementIndex = slide.elements.findIndex((el) => el.id === elementId);
          if (elementIndex === -1) return;

          slide.elements.splice(elementIndex, 1);
          state.presentation.updatedAt = new Date().toISOString();
        }),

      resetToPreset: (slideIndex, layout) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          const slide = state.presentation.slides[slideIndex];
          const presetElements = createPresetElements(layout) as any[];
          slide.layout = layout;

          // Match existing elements to preset slots by type (in order),
          // reset their positions while preserving content
          const usedIndices = new Set<number>();
          const newElements: any[] = presetElements.map((preset: any) => {
            const matchIdx = slide.elements.findIndex(
              (el, i) => el.type === preset.type && !usedIndices.has(i)
            );
            if (matchIdx !== -1) {
              usedIndices.add(matchIdx);
              // Keep existing element content, reset position to preset default
              return { ...slide.elements[matchIdx], position: { ...preset.position } };
            }
            // No matching existing element — use blank preset
            return preset;
          });

          slide.elements = newElements;
          state.presentation.updatedAt = new Date().toISOString();
        }),

      reorderElement: (slideIndex, elementId, direction) =>
        set((state) => {
          if (!state.presentation) return;
          if (slideIndex < 0 || slideIndex >= state.presentation.slides.length) return;

          const slide = state.presentation.slides[slideIndex];
          const currentIndex = slide.elements.findIndex((el) => el.id === elementId);
          if (currentIndex === -1) return;

          let newIndex: number;

          switch (direction) {
            case 'forward':
              newIndex = Math.min(currentIndex + 1, slide.elements.length - 1);
              break;
            case 'backward':
              newIndex = Math.max(currentIndex - 1, 0);
              break;
            case 'front':
              newIndex = slide.elements.length - 1;
              break;
            case 'back':
              newIndex = 0;
              break;
          }

          // Only move if the index actually changes
          if (newIndex !== currentIndex) {
            const [element] = slide.elements.splice(currentIndex, 1);
            slide.elements.splice(newIndex, 0, element);
            state.presentation.updatedAt = new Date().toISOString();
          }
        }),

      // Presentation-level actions
      setFonts: (fontHeading, fontBody) =>
        set((state) => {
          if (!state.presentation) return;
          state.presentation.fontHeading = fontHeading;
          state.presentation.fontBody = fontBody;
          state.presentation.updatedAt = new Date().toISOString();
        }),

      // Storage actions
      clearSavedData: () => {
        localStorage.removeItem(AUTOSAVE_KEY);
      },
      })),
      {
        limit: 50,
        partialize: (state) => ({ presentation: state.presentation }),
        equality: (pastState, currentState) =>
          JSON.stringify(pastState) === JSON.stringify(currentState),
      }
    ),
    persistConfig
  )
);

// Auto-save to filesystem when a file handle is active
setupFileAutoSave(presentationStore);

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
