// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { computeCodeScale, fitCodeToBox, CODE_SCALE_VAR, MIN_CODE_SCALE } from '../fitCode';

describe('computeCodeScale', () => {
  it('keeps the base size when the code already fits', () => {
    expect(computeCodeScale({ width: 500, height: 300 }, { width: 400, height: 200 })).toBe(1);
  });

  it('shrinks by the tighter of the two axes, never growing', () => {
    expect(computeCodeScale({ width: 500, height: 300 }, { width: 1000, height: 400 })).toBeCloseTo(0.495, 3);
    expect(computeCodeScale({ width: 500, height: 300 }, { width: 600, height: 600 })).toBeCloseTo(0.495, 3);
  });

  it('ignores unmeasurable sizes', () => {
    expect(computeCodeScale({ width: 0, height: 0 }, { width: 0, height: 0 })).toBe(1);
    expect(computeCodeScale({ width: -10, height: 300 }, { width: 100, height: 100 })).toBe(1);
  });
});

/** Fake a box whose <pre> overflows at scale 1 by `overflow`x and scales linearly. */
function fakeBox(overflow: number, hidden = false): HTMLElement {
  const box = document.createElement('div');
  const pre = document.createElement('pre');
  box.appendChild(pre);
  const scale = () => parseFloat(box.style.getPropertyValue(CODE_SCALE_VAR) || '1');
  Object.defineProperty(box, 'clientWidth', { get: () => (hidden ? 0 : 400) });
  Object.defineProperty(box, 'clientHeight', { get: () => (hidden ? 0 : 300) });
  Object.defineProperty(pre, 'clientWidth', { get: () => 400 });
  Object.defineProperty(pre, 'clientHeight', { get: () => 300 });
  Object.defineProperty(pre, 'scrollWidth', { get: () => Math.max(400, 400 * overflow * scale()) });
  Object.defineProperty(pre, 'scrollHeight', { get: () => 300 });
  return box;
}

describe('fitCodeToBox', () => {
  it('sets a scale that makes overflowing code fit', () => {
    const box = fakeBox(2);
    fitCodeToBox(box);
    const scale = parseFloat(box.style.getPropertyValue(CODE_SCALE_VAR));
    expect(scale).toBeLessThan(0.5);
    expect(scale).toBeGreaterThan(0.48);
  });

  it('never shrinks below the minimum scale', () => {
    const box = fakeBox(100000);
    fitCodeToBox(box);
    expect(box.style.getPropertyValue(CODE_SCALE_VAR)).toBe(String(MIN_CODE_SCALE));
  });

  it('resets to 1 once the box is big enough again', () => {
    const box = fakeBox(0.8);
    box.style.setProperty(CODE_SCALE_VAR, '0.3');
    fitCodeToBox(box);
    expect(box.style.getPropertyValue(CODE_SCALE_VAR)).toBe('1');
  });

  it('leaves the scale alone while the box is hidden', () => {
    const box = fakeBox(2, true);
    box.style.setProperty(CODE_SCALE_VAR, '0.7');
    fitCodeToBox(box);
    expect(box.style.getPropertyValue(CODE_SCALE_VAR)).toBe('0.7');
  });
});
