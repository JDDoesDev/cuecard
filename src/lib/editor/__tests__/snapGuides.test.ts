import { describe, it, expect } from 'vitest';
import { computeSnap, type SnapRect } from '../snapGuides';

describe('computeSnap', () => {
  const size = { width: 20, height: 10 };
  const threshold = 1.5;

  it('returns proposed position unchanged with no siblings and no canvas snap', () => {
    // x=25, right=45, center=35 — all far from canvas targets (0, 50, 100)
    // y=25, bottom=35, center=30 — all far from canvas targets
    const result = computeSnap({ x: 25, y: 25 }, size, [], threshold);
    expect(result.snappedPosition).toEqual({ x: 25, y: 25 });
    expect(result.activeGuides).toEqual([]);
  });

  it('snaps to canvas center (50%) on x axis', () => {
    // Center of element = x + width/2 = 39.5 + 10 = 49.5, within 1.5 of 50
    const result = computeSnap({ x: 39.5, y: 30 }, size, [], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(40, 5); // 50 - 20/2 = 40
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 50 });
  });

  it('snaps to canvas center (50%) on y axis', () => {
    // Center of element = y + height/2 = 44.5 + 5 = 49.5, within 1.5 of 50
    const result = computeSnap({ x: 30, y: 44.5 }, size, [], threshold);
    expect(result.snappedPosition.y).toBeCloseTo(45, 5); // 50 - 10/2 = 45
    expect(result.activeGuides).toContainEqual({ axis: 'y', position: 50 });
  });

  it('snaps left edge to sibling right edge', () => {
    const sibling: SnapRect = { x: 5, y: 20, width: 20, height: 10 };
    // Sibling right = 25. Proposed left = 26 → within 1.5 of 25
    const result = computeSnap({ x: 26, y: 30 }, size, [sibling], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(25, 5);
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 25 });
  });

  it('snaps center-to-center alignment', () => {
    const sibling: SnapRect = { x: 5, y: 5, width: 20, height: 10 };
    // Sibling centerX = 15. Drag centerX = x + 10. We want x + 10 = 15 → x = 5
    // Propose x = 5.5 → left=5.5, right=25.5, centerX=15.5
    // Targets: 0(dist 5.5), 5(left edge, dist 0.5), 15(center, dist 0.5), 25(right, dist 0.5)
    // left edge 5.5 vs target 5: dist 0.5, offset=0 → snapped 5
    // Actually left edge also snaps to sibling left. Let's pick values where center is clearly closest.
    // Sibling: x=14, width=2 → left=14, right=16, center=15
    const sib: SnapRect = { x: 14, y: 5, width: 2, height: 2 };
    // Drag center = x + 10. Propose x=5.3 → center=15.3 (dist 0.3 to 15)
    // left=5.3 (no target near), right=25.3 (no target near)
    const result = computeSnap({ x: 5.3, y: 25 }, size, [sib], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(5, 5); // center snaps to 15 → x = 15 - 10 = 5
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 15 });
  });

  it('snaps X and Y independently', () => {
    const sibling: SnapRect = { x: 10, y: 10, width: 20, height: 10 };
    // Sibling right = 30, sibling bottom = 20
    // Propose left = 30.5 (snaps to 30 on x), top = 20.5 (snaps to 20 on y)
    const result = computeSnap({ x: 30.5, y: 20.5 }, size, [sibling], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(30, 5);
    expect(result.snappedPosition.y).toBeCloseTo(20, 5);
    expect(result.activeGuides).toHaveLength(2);
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 30 });
    expect(result.activeGuides).toContainEqual({ axis: 'y', position: 20 });
  });

  it('does not snap when all targets are beyond threshold', () => {
    const sibling: SnapRect = { x: 10, y: 10, width: 10, height: 10 };
    // Sibling edges: x=10, right=20, center=15 / y=10, bottom=20, center=15
    // Canvas: 0, 50, 100
    // Proposed left=35, right=55, centerX=45 — none within 1.5 of any target
    // Proposed top=35, bottom=45, centerY=40 — none within 1.5
    const result = computeSnap({ x: 35, y: 35 }, size, [sibling], threshold);
    expect(result.snappedPosition).toEqual({ x: 35, y: 35 });
    expect(result.activeGuides).toEqual([]);
  });

  it('clamps to bounds after snap', () => {
    // Snap right edge (x + 20) to canvas right (100) → x = 80
    // But if width were 120, x would be negative; test normal case
    const result = computeSnap({ x: 79.5, y: 89.5 }, size, [], threshold);
    // Right edge = 99.5, within 1.5 of 100 → snap x = 80
    // Bottom edge = 99.5, within 1.5 of 100 → snap y = 90
    expect(result.snappedPosition.x).toBeCloseTo(80, 5);
    expect(result.snappedPosition.y).toBeCloseTo(90, 5);
  });

  it('snaps to canvas left edge (0%)', () => {
    // Left edge = 1.0, within 1.5 of 0 → snap x = 0
    const result = computeSnap({ x: 1, y: 30 }, size, [], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(0, 5);
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 0 });
  });

  it('picks the closest snap when multiple are within threshold', () => {
    // Use a narrow element (width=10) to avoid right edge hitting canvas center
    const narrowSize = { width: 10, height: 10 };
    const sib1: SnapRect = { x: 5, y: 5, width: 10, height: 5 };
    const sib2: SnapRect = { x: 16, y: 5, width: 10, height: 5 };
    // sib1 right = 15, sib2 left = 16
    // Proposed left = 15.3 → right=25.3, center=20.3
    // left edge: dist to 15 = 0.3, dist to 16 = 0.7
    // Other edges (25.3, 20.3) not near any target
    const result = computeSnap({ x: 15.3, y: 25 }, narrowSize, [sib1, sib2], threshold);
    expect(result.snappedPosition.x).toBeCloseTo(15, 5);
    expect(result.activeGuides).toContainEqual({ axis: 'x', position: 15 });
  });
});
