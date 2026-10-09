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

  // Apply snap + bounds clamping (same bounds the drag handler uses)
  let x = bestX ? bestX.snappedX : proposed.x;
  let y = bestY ? bestY.snappedY : proposed.y;

  x = Math.max(0, Math.min(100 - size.width, x));
  y = Math.max(0, Math.min(100 - size.height, y));

  const activeGuides: SnapLine[] = [];
  if (bestX) activeGuides.push({ axis: 'x', position: bestX.guide });
  if (bestY) activeGuides.push({ axis: 'y', position: bestY.guide });

  return { snappedPosition: { x, y }, activeGuides };
}

/** Which edges a resize handle moves. */
export type ResizeHandleDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizeSnapResult {
  snappedRect: SnapRect;
  activeGuides: SnapLine[];
}

/**
 * Snap a resize: only the edges being dragged snap (e.g. an 'e' resize snaps
 * the right edge by changing width; x stays put). Edges that would collapse
 * the element below `minSize` are not snapped.
 */
export function computeResizeSnap(
  direction: ResizeHandleDirection,
  proposed: SnapRect,
  siblings: SnapRect[],
  threshold: number = DEFAULT_THRESHOLD,
  minSize = 5,
): ResizeSnapResult {
  const xTargets: number[] = [0, 50, 100];
  const yTargets: number[] = [0, 50, 100];
  for (const sib of siblings) {
    xTargets.push(sib.x, sib.x + sib.width, sib.x + sib.width / 2);
    yTargets.push(sib.y, sib.y + sib.height, sib.y + sib.height / 2);
  }

  const closest = (value: number, targets: number[]): number | null => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const d = Math.abs(value - t);
      if (d <= threshold && d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    return best;
  };

  let left = proposed.x;
  let right = proposed.x + proposed.width;
  let top = proposed.y;
  let bottom = proposed.y + proposed.height;
  const activeGuides: SnapLine[] = [];

  if (direction.includes('w')) {
    const t = closest(left, xTargets);
    if (t !== null && right - t >= minSize) {
      left = t;
      activeGuides.push({ axis: 'x', position: t });
    }
  } else if (direction.includes('e')) {
    const t = closest(right, xTargets);
    if (t !== null && t - left >= minSize) {
      right = t;
      activeGuides.push({ axis: 'x', position: t });
    }
  }

  if (direction.includes('n')) {
    const t = closest(top, yTargets);
    if (t !== null && bottom - t >= minSize) {
      top = t;
      activeGuides.push({ axis: 'y', position: t });
    }
  } else if (direction.includes('s')) {
    const t = closest(bottom, yTargets);
    if (t !== null && t - top >= minSize) {
      bottom = t;
      activeGuides.push({ axis: 'y', position: t });
    }
  }

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(100, right);
  bottom = Math.min(100, bottom);

  return {
    snappedRect: { x: left, y: top, width: right - left, height: bottom - top },
    activeGuides,
  };
}
