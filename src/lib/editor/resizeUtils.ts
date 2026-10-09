import type { ElementPosition } from '@/types/slide';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Calculate new element position based on resize direction and delta.
 * All values are in percentage coordinates (0-100).
 */
export function calculateResize(
  direction: ResizeDirection,
  deltaXPercent: number,
  deltaYPercent: number,
  original: ElementPosition
): ElementPosition {
  let { x, y, width, height } = original;

  switch (direction) {
    case 'se': // Southeast: expand right and down
      width += deltaXPercent;
      height += deltaYPercent;
      break;

    case 'nw': // Northwest: expand left and up
      x += deltaXPercent;
      y += deltaYPercent;
      width -= deltaXPercent;
      height -= deltaYPercent;
      break;

    case 'ne': // Northeast: expand right and up
      y += deltaYPercent;
      width += deltaXPercent;
      height -= deltaYPercent;
      break;

    case 'sw': // Southwest: expand left and down
      x += deltaXPercent;
      width -= deltaXPercent;
      height += deltaYPercent;
      break;

    case 'n': // North: expand up
      y += deltaYPercent;
      height -= deltaYPercent;
      break;

    case 's': // South: expand down
      height += deltaYPercent;
      break;

    case 'e': // East: expand right
      width += deltaXPercent;
      break;

    case 'w': // West: expand left
      x += deltaXPercent;
      width -= deltaXPercent;
      break;
  }

  // Clamp minimum width/height to 5% (prevent zero/negative)
  width = Math.max(5, width);
  height = Math.max(5, height);

  // Clamp x/y to be >= 0
  x = Math.max(0, x);
  y = Math.max(0, y);

  // Round to 2 decimal places to prevent floating point drift
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
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
