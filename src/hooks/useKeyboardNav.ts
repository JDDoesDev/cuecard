import { useEffect, useRef } from 'react';

// ============================================================================
// Keyboard Navigation Hook (UX-01)
// ============================================================================

interface KeyboardNavHandlers {
  /** Omit for passive views (e.g. audience) that must not navigate locally. */
  onNext?: () => void;
  onPrev?: () => void;
  onFullscreen: () => void;
  onEscape: () => void;
  /** Element to attach click-to-advance listener to. If omitted, no click handler. */
  clickTarget?: React.RefObject<HTMLElement | null>;
}

/** Elements whose clicks belong to the element itself, not to slide navigation. */
export const INTERACTIVE_SELECTOR = [
  'button', 'a', 'input', 'textarea', 'select', 'label', 'option',
  'video', 'audio', 'iframe', 'summary', 'details',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="slider"]',
].join(', ');

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(TYPING_SELECTOR) !== null;
}

/**
 * Document-level keyboard navigation hook.
 * Handles arrow keys, space, F for fullscreen, and Escape.
 * Ignores events from form fields / contenteditable and modified key presses
 * (Ctrl/Meta/Alt) so browser shortcuts like Ctrl+F keep working.
 */
export function useKeyboardNav(handlers: KeyboardNavHandlers) {
  // Use refs to avoid re-registering listener on every render
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const target = event.target instanceof Element ? event.target : null;
      // Space on a focused button/link activates it; don't also navigate.
      if (event.key === ' ' && target?.closest('button, a, [role="button"]')) return;

      const { onNext, onPrev, onFullscreen, onEscape } = handlersRef.current;

      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'PageDown') {
        if (!onNext) return;
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        if (!onPrev) return;
        event.preventDefault();
        onPrev();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        onFullscreen();
      } else if (event.key === 'Escape') {
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - stable via ref pattern

  // Click-to-advance (left click only). Right click keeps the native context menu.
  // The target element may appear after mount (e.g. the deck loads later and
  // the component swaps its empty state for the real container), so re-check
  // the ref after every commit and (re)attach when the element changes.
  const attachedRef = useRef<{ el: HTMLElement; handler: (e: MouseEvent) => void } | null>(null);

  useEffect(() => {
    const el = handlers.clickTarget?.current ?? null;
    if (attachedRef.current?.el === el) return;
    if (attachedRef.current) {
      attachedRef.current.el.removeEventListener('click', attachedRef.current.handler);
      attachedRef.current = null;
    }
    if (!el) return;

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      // Don't advance when the user just selected text
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed) return;
      handlersRef.current.onNext?.();
    };

    el.addEventListener('click', handleClick);
    attachedRef.current = { el, handler: handleClick };
  });

  useEffect(() => () => {
    if (attachedRef.current) {
      attachedRef.current.el.removeEventListener('click', attachedRef.current.handler);
      attachedRef.current = null;
    }
  }, []);
}
