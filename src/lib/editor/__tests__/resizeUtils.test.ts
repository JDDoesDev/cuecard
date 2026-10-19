import { describe, it, expect } from 'vitest';
import { calculateResize, clampToSlide, MIN_ELEMENT_SIZE, MIN_ON_SLIDE } from '../resizeUtils';
import { computeResizeSnap, computeSnap } from '../snapGuides';

const box = { x: 40, y: 40, width: 20, height: 20 };

describe('calculateResize', () => {
  it('e resize changes width only', () => {
    expect(calculateResize('e', 10, 0, box)).toEqual({ x: 40, y: 40, width: 30, height: 20 });
  });

  it('lets the right edge go past the slide', () => {
    const r = calculateResize('e', 80, 0, box);
    expect(r).toEqual({ x: 40, y: 40, width: 100, height: 20 });
  });

  it('lets left/top edges go past the slide without moving the opposite edge', () => {
    const r = calculateResize('nw', -80, -80, box);
    expect(r).toEqual({ x: -40, y: -40, width: 100, height: 100 });
  });

  it('keeps MIN_ON_SLIDE of the element on the slide', () => {
    const offRight = { x: 90, y: 40, width: 30, height: 20 };
    expect(calculateResize('w', 20, 0, offRight).x).toBe(100 - MIN_ON_SLIDE);
    const offLeft = { x: -20, y: 40, width: 30, height: 20 };
    const r = calculateResize('e', -20, 0, offLeft);
    expect(r.x + r.width).toBe(MIN_ON_SLIDE);
  });

  it('w drag past the minimum width does not make the element walk', () => {
    const r = calculateResize('w', 50, 0, box);
    expect(r.width).toBe(MIN_ELEMENT_SIZE);
    expect(r.x + r.width).toBe(60); // right edge anchored
  });

  it('n drag past the minimum height keeps the bottom edge anchored', () => {
    const r = calculateResize('n', 0, 50, box);
    expect(r.height).toBe(MIN_ELEMENT_SIZE);
    expect(r.y + r.height).toBe(60);
  });
});

describe('computeResizeSnap', () => {
  it('e resize snaps the right edge by changing width, not x', () => {
    const { snappedRect } = computeResizeSnap('e', { x: 40, y: 40, width: 9.2, height: 20 }, []);
    expect(snappedRect.x).toBe(40);
    expect(snappedRect.x + snappedRect.width).toBe(50);
  });

  it('w resize snaps the left edge and keeps the right edge', () => {
    const { snappedRect } = computeResizeSnap('w', { x: 50.8, y: 10, width: 20, height: 20 }, []);
    expect(snappedRect.x).toBe(50);
    expect(snappedRect.x + snappedRect.width).toBeCloseTo(70.8);
  });

  it('s resize snaps the bottom edge to a sibling top', () => {
    const sibling = { x: 0, y: 70, width: 10, height: 10 };
    const { snappedRect, activeGuides } = computeResizeSnap('s', { x: 20, y: 20, width: 20, height: 49 }, [sibling]);
    expect(snappedRect.y).toBe(20);
    expect(snappedRect.y + snappedRect.height).toBe(70);
    expect(activeGuides).toEqual([{ axis: 'y', position: 70 }]);
  });

  it('does not snap below the minimum size', () => {
    const { snappedRect } = computeResizeSnap('e', { x: 49, y: 0, width: 5.5, height: 10 }, [], 1.5, 5);
    // nearest target 50 would leave width 1 -> no snap
    expect(snappedRect.width).toBe(5.5);
  });
});

describe('computeSnap bounds', () => {
  it('lets the element hang off the slide but keeps MIN_ON_SLIDE on it', () => {
    const { snappedPosition } = computeSnap({ x: -30, y: 99 }, { width: 40, height: 10 }, [], 0);
    expect(snappedPosition).toEqual({ x: -30, y: 100 - MIN_ON_SLIDE });
  });
});

describe('clampToSlide', () => {
  it('allows overhang up to all but MIN_ON_SLIDE', () => {
    expect(clampToSlide(-50, 40)).toBe(MIN_ON_SLIDE - 40);
    expect(clampToSlide(120, 40)).toBe(100 - MIN_ON_SLIDE);
    expect(clampToSlide(-10, 40)).toBe(-10);
  });
});
