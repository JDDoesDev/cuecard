import { useSyncExternalStore, useRef, useCallback } from 'react';
import { presentationStore } from '@/store/presentationStore';

// ============================================================================
// Undo/Redo Hook - Uses React's native useSyncExternalStore
// ============================================================================

export interface UsePresentationUndoResult {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function usePresentationUndo(): UsePresentationUndoResult {
  const temporalStore = presentationStore.temporal;
  const cachedRef = useRef<UsePresentationUndoResult | null>(null);

  const getSnapshot = useCallback(() => {
    const state = temporalStore.getState();
    const canUndo = state.pastStates.length > 0;
    const canRedo = state.futureStates.length > 0;

    // Return cached object if values haven't changed to prevent infinite loop
    if (
      cachedRef.current &&
      cachedRef.current.canUndo === canUndo &&
      cachedRef.current.canRedo === canRedo
    ) {
      return cachedRef.current;
    }

    cachedRef.current = {
      undo: state.undo,
      redo: state.redo,
      canUndo,
      canRedo,
    };
    return cachedRef.current;
  }, [temporalStore]);

  return useSyncExternalStore(
    temporalStore.subscribe,
    getSnapshot,
    getSnapshot
  );
}
