import { describe, it, expect } from 'vitest';
import { pxToCqw, cqwToPx, scaleInlineFontSizes } from '../fontSizeExtension';

describe('fontSizeExtension unit conversion', () => {
  it('converts px to cqw against the 1000px reference width', () => {
    expect(pxToCqw('24px')).toBe('2.4cqw');
    expect(pxToCqw('12px')).toBe('1.2cqw');
    expect(pxToCqw('72px')).toBe('7.2cqw');
  });

  it('converts cqw back to px', () => {
    expect(cqwToPx('2.4cqw')).toBe('24px');
    expect(cqwToPx('7.2cqw')).toBe('72px');
  });

  it('round-trips every toolbar size', () => {
    for (const px of [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72]) {
      expect(cqwToPx(pxToCqw(`${px}px`))).toBe(`${px}px`);
    }
  });

  it('leaves non-px / non-cqw values untouched', () => {
    expect(pxToCqw('1.5em')).toBe('1.5em');
    expect(cqwToPx('24px')).toBe('24px');
  });

  it('rewrites legacy inline px font sizes in stored HTML', () => {
    const html = '<p>Hi <span style="font-size: 24px">big</span> and <span style="font-size:12px; color: red">small</span></p>';
    expect(scaleInlineFontSizes(html)).toBe(
      '<p>Hi <span style="font-size: 2.4cqw">big</span> and <span style="font-size: 1.2cqw; color: red">small</span></p>'
    );
  });

  it('does not alter HTML without px font sizes', () => {
    const html = '<p style="font-size: 2cqw">x</p>';
    expect(scaleInlineFontSizes(html)).toBe(html);
  });
});
