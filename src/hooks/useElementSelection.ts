import { useState, useCallback, useEffect } from 'react';

/**
 * Selection state management hook.
 * Manages a Set of selected element IDs for multi-select operations.
 */
export function useElementSelection(slideIndex: number) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when slideIndex changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [slideIndex]);

  const select = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey) {
        // Toggle: add if not present, remove if present
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        // Replace selection with just this id
        next.clear();
        next.add(id);
      }
      return next;
    });
  }, []);

  /** Replace the selection with `ids`, or add them to it when `additive`. */
  const selectAll = useCallback((ids: string[], additive = false) => {
    setSelectedIds((prev) => (additive ? new Set([...prev, ...ids]) : new Set(ids)));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id);
    },
    [selectedIds]
  );

  return {
    selectedIds,
    select,
    selectAll,
    deselectAll,
    isSelected,
  };
}
