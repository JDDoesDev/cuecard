import type { ElementPosition } from '@/types/slide';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Minimum element width/height in percent. */
export const MIN_ELEMENT_SIZE = 5;

/**
 * How much of an element (percent of the slide) must stay on the slide.
 * Elements may hang off the edges (the overhang is cropped when presenting),
 * but never so far that they can't be grabbed again.
 */
export const MIN_ON_SLIDE = 5;

/**
 * Clamp an element's start (x or y) so at least MIN_ON_SLIDE of it stays on
 * the slide. Smaller elements (e.g. a horizontal line's zero height) must stay
 * fully on it, anywhere from edge to edge.
 */
export function clampToSlide(start: number, size: number): number {
  const onSlide = Math.min(MIN_ON_SLIDE, Math.max(0, size));
  return Math.max(onSlide - size, Math.min(100 - onSlide, start));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calculate new element position based on resize direction and delta.
 * All values are in percentage coordinates (0-100).
 *
 * Only the edges being dragged move; the opposite edges stay anchored. Moving
 * edges are clamped to a minimum size, so dragging a w/n handle past the
 * minimum doesn't make the element "walk". Edges may go past the slide (to
 * crop an image, say), but at least MIN_ON_SLIDE of the element stays on it.
 */
export function calculateResize(
  direction: ResizeDirection,
  deltaXPercent: number,
  deltaYPercent: number,
  original: ElementPosition
): ElementPosition {
  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;

  const movesW = direction.includes('w');
  const movesE = direction.includes('e');
  const movesN = direction.includes('n');
  const movesS = direction.includes('s');

  if (movesW) left = Math.min(left + deltaXPercent, right - MIN_ELEMENT_SIZE, 100 - MIN_ON_SLIDE);
  if (movesE) right = Math.max(right + deltaXPercent, left + MIN_ELEMENT_SIZE, MIN_ON_SLIDE);
  if (movesN) top = Math.min(top + deltaYPercent, bottom - MIN_ELEMENT_SIZE, 100 - MIN_ON_SLIDE);
  if (movesS) bottom = Math.max(bottom + deltaYPercent, top + MIN_ELEMENT_SIZE, MIN_ON_SLIDE);

  // Round to 2 decimal places to prevent floating point drift
  return {
    x: round2(left),
    y: round2(top),
    width: round2(right - left),
    height: round2(bottom - top),
  };
}

/**
 * Test if an element position intersects with a rectangle.
 * Both are in percentage coordinates.
 */
export function intersectsRect(
  elementPos: ElementPosition,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  // Standard AABB intersection test
  return (
    elementPos.x < rect.x + rect.width &&
    elementPos.x + elementPos.width > rect.x &&
    elementPos.y < rect.y + rect.height &&
    elementPos.y + elementPos.height > rect.y
  );
}
