/**
 * Pure snap computation for alignment guides.
 *
 * All values are in percentage coordinates (0–100).
 */

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapLine {
  axis: 'x' | 'y';
  /** Position in percent (0–100) */
  position: number;
}

export interface SnapResult {
  snappedPosition: { x: number; y: number };
  activeGuides: SnapLine[];
}

const DEFAULT_THRESHOLD = 1.5; // percent

/**
 * Compute snap for a dragged element against siblings and canvas guides.
 *
 * For each axis independently, the dragged element's leading edge, trailing edge,
 * and center are tested against every target. The closest match within threshold
 * wins (at most one guide per axis).
 */
export function computeSnap(
  proposed: { x: number; y: number },
  size: { width: number; height: number },
  siblings: SnapRect[],
  threshold: number = DEFAULT_THRESHOLD,
): SnapResult {
  // Build target lists for each axis
  // Canvas edges + center are always targets
  const xTargets: number[] = [0, 50, 100];
  const yTargets: number[] = [0, 50, 100];

  for (const sib of siblings) {
    const left = sib.x;
    const right = sib.x + sib.width;
    const centerX = sib.x + sib.width / 2;
    xTargets.push(left, right, centerX);

    const top = sib.y;
    const bottom = sib.y + sib.height;
    const centerY = sib.y + sib.height / 2;
    yTargets.push(top, bottom, centerY);
  }

  // Dragged element edges + center
  const dragLeft = proposed.x;
  const dragRight = proposed.x + size.width;
  const dragCenterX = proposed.x + size.width / 2;

  const dragTop = proposed.y;
  const dragBottom = proposed.y + size.height;
  const dragCenterY = proposed.y + size.height / 2;

  const dragEdgesX = [
    { edge: dragLeft, offset: 0 },          // snap left edge → adjust x by 0
    { edge: dragRight, offset: size.width }, // snap right edge → adjust x = target - width
    { edge: dragCenterX, offset: size.width / 2 }, // snap center → adjust x = target - width/2
  ];

  const dragEdgesY = [
    { edge: dragTop, offset: 0 },
    { edge: dragBottom, offset: size.height },
    { edge: dragCenterY, offset: size.height / 2 },
  ];

  // Find best snap per axis
  let bestX: { snappedX: number; guide: number } | null = null;
  let bestXDist = Infinity;

  for (const { edge, offset } of dragEdgesX) {
    for (const target of xTargets) {
      const dist = Math.abs(edge - target);
      if (dist <= threshold && dist < bestXDist) {
        bestXDist = dist;
        bestX = { snappedX: target - offset, guide: target };
      }
    }
  }

  let bestY: { snappedY: number; guide: number } | null = null;
  let bestYDist = Infinity;

  for (const { edge, offset } of dragEdgesY) {
    for (const target of yTargets) {
      const dist = Math.abs(edge - target);
      if (dist <= threshold && dist < bestYDist) {
        bestYDist = dist;
        bestY = { snappedY: target - offset, guide: target };
      }
    }
  }

  // Apply snap + bounds clamping
  // Note: Y uses lenient clamp (0–100) because stored height may not match
  // rendered height (auto-sized content). The drag component handles precise
  // bottom-edge clamping using the actual rendered height.
  let x = bestX ? bestX.snappedX : proposed.x;
  let y = bestY ? bestY.snappedY : proposed.y;

  x = Math.max(0, Math.min(100 - size.width, x));
  y = Math.max(0, Math.min(100, y));

  const activeGuides: SnapLine[] = [];
  if (bestX) activeGuides.push({ axis: 'x', position: bestX.guide });
  if (bestY) activeGuides.push({ axis: 'y', position: bestY.guide });

  return { snappedPosition: { x, y }, activeGuides };
}
