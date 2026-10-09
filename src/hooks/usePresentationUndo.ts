import { useSyncExternalStore, useRef, useCallback } from 'react';
import { presentationStore, resetHistoryCoalescing } from '@/store/presentationStore';

// After undo/redo, the next edit must start a fresh history entry rather than
// merge into a typing burst. (Slide index clamping happens in the store.)
function undo() {
  resetHistoryCoalescing();
  presentationStore.temporal.getState().undo();
}

function redo() {
  resetHistoryCoalescing();
  presentationStore.temporal.getState().redo();
}

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
      undo,
      redo,
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
