import { useSyncExternalStore, useCallback } from 'react';
import { presentationStore, type PresentationState } from '@/store/presentationStore';
import type { Slide } from '@/types/presentation';

// ============================================================================
// Main Hook - Uses React's native useSyncExternalStore
// Bypasses zustand's React integration to avoid pnpm multi-instance issues
// ============================================================================

export function usePresentationStore(): PresentationState {
  return useSyncExternalStore(
    presentationStore.subscribe,
    presentationStore.getState,
    presentationStore.getState
  );
}

// ============================================================================
// Convenience Selectors
// ============================================================================

export function useCurrentSlide(): Slide | undefined {
  const selector = useCallback(
    () => {
      const state = presentationStore.getState();
      if (!state.presentation) return undefined;
      return state.presentation.slides[state.currentSlideIndex];
    },
    []
  );

  return useSyncExternalStore(
    presentationStore.subscribe,
    selector,
    selector
  );
}

export function useSlideCount(): number {
  const selector = useCallback(
    () => presentationStore.getState().presentation?.slides.length ?? 0,
    []
  );

  return useSyncExternalStore(
    presentationStore.subscribe,
    selector,
    selector
  );
}

export function usePresentation() {
  const selector = useCallback(
    () => presentationStore.getState().presentation,
    []
  );

  return useSyncExternalStore(
    presentationStore.subscribe,
    selector,
    selector
  );
}
