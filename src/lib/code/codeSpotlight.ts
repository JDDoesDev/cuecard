import type { CodeSpotlight } from '@/types/sync';

/**
 * Presenter code line spotlight: the code line under the presenter's mouse is
 * highlighted (and grows, see ElementRenderer.module.css) on both screens.
 *
 * The highlight is a DOM attribute on the line rather than React state, so
 * hovering never re-renders slides or re-runs syntax highlighting. Code lines
 * carry `data-line` (ElementRenderer) and slide element wrappers carry
 * `data-element-id` (UniversalSlide).
 */

export const SPOTLIGHT_ATTR = 'data-spotlight';

/**
 * The spotlight for the pointer over `target`. Outside a (revealed) code
 * block it is null; between lines (the block's padding) the current line is kept.
 */
export function spotlightAtPointer(target: EventTarget | null, current: CodeSpotlight | null): CodeSpotlight | null {
  const el = target instanceof Element ? target : null;
  const box = el?.closest<HTMLElement>('[data-element-type="code"][data-element-id]:not([data-hidden])');
  const elementId = box?.dataset.elementId;
  if (!el || !box || !elementId) return null;
  const lineEl = el.closest<HTMLElement>('[data-line]');
  const line = lineEl && box.contains(lineEl) ? Number(lineEl.dataset.line) : NaN;
  if (Number.isInteger(line) && line > 0) return { elementId, line };
  return current?.elementId === elementId ? current : null;
}

export function sameSpotlight(a: CodeSpotlight | null, b: CodeSpotlight | null): boolean {
  return a === b || (!!a && !!b && a.elementId === b.elementId && a.line === b.line);
}

/** Highlight the spotlit line under `root` (clearing any other). */
export function applyCodeSpotlight(root: ParentNode | null | undefined, spotlight: CodeSpotlight | null) {
  if (!root) return;
  root.querySelectorAll(`[${SPOTLIGHT_ATTR}]`).forEach((el) => el.removeAttribute(SPOTLIGHT_ATTR));
  if (!spotlight) return;
  const box = Array.from(root.querySelectorAll<HTMLElement>('[data-element-id]')).find(
    (el) => el.dataset.elementId === spotlight.elementId,
  );
  box?.querySelector(`[data-line="${spotlight.line}"]`)?.setAttribute(SPOTLIGHT_ATTR, '');
}
