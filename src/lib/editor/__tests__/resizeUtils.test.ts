import { describe, it, expect } from 'vitest';
import { calculateResize, MIN_ELEMENT_SIZE } from '../resizeUtils';
import { computeResizeSnap, computeSnap } from '../snapGuides';

const box = { x: 40, y: 40, width: 20, height: 20 };

describe('calculateResize', () => {
  it('e resize changes width only', () => {
    expect(calculateResize('e', 10, 0, box)).toEqual({ x: 40, y: 40, width: 30, height: 20 });
  });

  it('clamps the right edge to the slide', () => {
    const r = calculateResize('e', 80, 0, box);
    expect(r.x + r.width).toBe(100);
  });

  it('clamps the bottom edge to the slide', () => {
    const r = calculateResize('se', 0, 90, box);
    expect(r.y + r.height).toBe(100);
  });

  it('clamps left/top edges at 0 without moving the opposite edge', () => {
    const r = calculateResize('nw', -80, -80, box);
    expect(r).toEqual({ x: 0, y: 0, width: 60, height: 60 });
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
  it('keeps the bottom edge on the slide', () => {
    const { snappedPosition } = computeSnap({ x: 10, y: 95 }, { width: 10, height: 10 }, []);
    expect(snappedPosition.y).toBe(90);
  });
});
