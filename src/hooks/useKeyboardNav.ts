import { useEffect, useRef } from 'react';

// ============================================================================
// Keyboard Navigation Hook (UX-01)
// ============================================================================

interface KeyboardNavHandlers {
  onNext: () => void;
  onPrev: () => void;
  onFullscreen: () => void;
  onEscape: () => void;
  /** Element to attach click-to-advance listener to. If omitted, no click handler. */
  clickTarget?: React.RefObject<HTMLElement | null>;
}

/**
 * Document-level keyboard navigation hook.
 * Handles arrow keys, space, F for fullscreen, and Escape.
 * Ignores events from input fields and contenteditable elements.
 */
export function useKeyboardNav(handlers: KeyboardNavHandlers) {
  // Use refs to avoid re-registering listener on every render
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip keyboard handling when user is typing in input fields
      const target = event.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      const { onNext, onPrev, onFullscreen, onEscape } = handlersRef.current;

      // Next slide triggers
      if (
        event.key === 'ArrowRight' ||
        event.key === ' ' ||
        event.key === 'ArrowDown'
      ) {
        event.preventDefault();
        onNext();
      }
      // Previous slide triggers
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        onPrev();
      }
      // Fullscreen toggle
      else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        onFullscreen();
      }
      // Escape
      else if (event.key === 'Escape') {
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - stable via ref pattern

  // Click-to-advance: left click = next, right click (context menu) = prev
  useEffect(() => {
    const el = handlers.clickTarget?.current;
    if (!el) return;

    const handleClick = (event: MouseEvent) => {
      // Ignore clicks on buttons/links/inputs so UI controls still work
      const target = event.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;
      handlersRef.current.onNext();
    };

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;
      event.preventDefault();
      handlersRef.current.onPrev();
    };

    el.addEventListener('click', handleClick);
    el.addEventListener('contextmenu', handleContextMenu);
    return () => {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handlers.clickTarget]);
}
