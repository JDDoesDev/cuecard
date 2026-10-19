import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { applyCodeSpotlight, sameSpotlight, spotlightAtPointer } from '@/lib/code/codeSpotlight';
import type { CodeSpotlight } from '@/types/sync';

/**
 * Code line spotlight while presenting: the code line under the mouse inside
 * `rootRef` is highlighted (see codeSpotlight.ts). It clears when the mouse
 * leaves the code block or the root, and when the slide changes. Spread the
 * returned handlers on the root; `spotlight` is for syncing other windows.
 */
export function useCodeSpotlight(rootRef: React.RefObject<HTMLElement | null>, slideIndex: number) {
  const [spotlight, setSpotlight] = useState<CodeSpotlight | null>(null);

  useEffect(() => setSpotlight(null), [slideIndex]);

  useLayoutEffect(() => {
    applyCodeSpotlight(rootRef.current, spotlight);
  }, [rootRef, spotlight, slideIndex]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    setSpotlight((current) => {
      const next = spotlightAtPointer(target, current);
      return sameSpotlight(next, current) ? current : next;
    });
  }, []);

  const onMouseLeave = useCallback(() => setSpotlight(null), []);

  return { spotlight, handlers: { onMouseMove, onMouseLeave } };
}
