import type { ElementPosition, LineElement } from '@/types/slide';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A point in slide percentages (0-100). */
export interface Point {
  x: number;
  y: number;
}

/** The line's two endpoints: [start, end] (start is always the left end). */
export function lineEndpoints(line: Pick<LineElement, 'position' | 'flip'>): [Point, Point] {
  const { x, y, width, height } = line.position;
  return line.flip
    ? [{ x, y: y + height }, { x: x + width, y }]
    : [{ x, y }, { x: x + width, y: y + height }];
}

/** Position box + direction for a line between two points. */
export function lineFromEndpoints(a: Point, b: Point): { position: ElementPosition; flip?: boolean } {
  const position = {
    x: round2(Math.min(a.x, b.x)),
    y: round2(Math.min(a.y, b.y)),
    width: round2(Math.abs(a.x - b.x)),
    height: round2(Math.abs(a.y - b.y)),
  };
  // Rising lines (one end left of and below the other) run bottom-left → top-right
  const flip = (a.x - b.x) * (a.y - b.y) < 0;
  return { position, flip: flip || undefined };
}

/** Within this many pixels of horizontal/vertical, a dragged end snaps straight. */
const STRAIGHT_SNAP_PX = 6;

/**
 * Where a dragged line end lands. `angleSnap` (Shift) locks the line to 45°
 * steps; otherwise a nearly horizontal/vertical line snaps straight unless
 * `free` (Alt). Angles are measured in pixels, since the slide isn't square.
 */
export function snapLineEnd(
  fixed: Point,
  moving: Point,
  slide: { width: number; height: number },
  { angleSnap = false, free = false } = {}
): Point {
  const toPx = (p: Point) => ({ x: (p.x / 100) * slide.width, y: (p.y / 100) * slide.height });
  const f = toPx(fixed);
  const m = toPx(moving);
  let dx = m.x - f.x;
  let dy = m.y - f.y;
  if (angleSnap) {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    dx = Math.cos(angle) * length;
    dy = Math.sin(angle) * length;
  } else if (!free) {
    if (Math.abs(dy) <= STRAIGHT_SNAP_PX && Math.abs(dx) > Math.abs(dy)) dy = 0;
    else if (Math.abs(dx) <= STRAIGHT_SNAP_PX && Math.abs(dy) > Math.abs(dx)) dx = 0;
  }
  return { x: ((f.x + dx) / slide.width) * 100, y: ((f.y + dy) / slide.height) * 100 };
}

/**
 * SVG `<line>` coordinates within the line's box. The SVG is given a 1px
 * minimum size (a zero-size SVG doesn't render), so a flat side stays at 0
 * instead of 100% to keep horizontal/vertical lines exactly straight.
 */
export function lineSvgCoords(line: Pick<LineElement, 'position' | 'flip'>) {
  const far = (size: number) => (size > 0 ? '100%' : '0');
  const bottom = far(line.position.height);
  return {
    x1: '0',
    y1: line.flip ? bottom : '0',
    x2: far(line.position.width),
    y2: line.flip ? '0' : bottom,
  };
}

/** Style for a line's SVG: fills the box, at least 1px, draws outside it. */
export const LINE_SVG_STYLE = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  minWidth: '1px',
  minHeight: '1px',
  overflow: 'visible',
} as const;
