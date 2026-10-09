import type { ElementPosition } from '@/types/slide';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Minimum element width/height in percent. */
export const MIN_ELEMENT_SIZE = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calculate new element position based on resize direction and delta.
 * All values are in percentage coordinates (0-100).
 *
 * Only the edges being dragged move; the opposite edges stay anchored. Moving
 * edges are clamped to the slide (0–100) and to a minimum size, so dragging a
 * w/n handle past the minimum doesn't make the element "walk", and the element
 * can never be resized beyond the slide bounds.
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

  if (movesW) left = Math.max(0, Math.min(left + deltaXPercent, right - MIN_ELEMENT_SIZE));
  if (movesE) right = Math.min(100, Math.max(right + deltaXPercent, left + MIN_ELEMENT_SIZE));
  if (movesN) top = Math.max(0, Math.min(top + deltaYPercent, bottom - MIN_ELEMENT_SIZE));
  if (movesS) bottom = Math.min(100, Math.max(bottom + deltaYPercent, top + MIN_ELEMENT_SIZE));

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
