/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { migrateLegacyTextContent, textContentToLines, linesToTextContent } from '../legacyTextContent';

describe('migrateLegacyTextContent', () => {
  it('turns legacy newline-separated plain text into markdown paragraphs', () => {
    expect(migrateLegacyTextContent('Line 1\nLine 2')).toBe('Line 1\n\nLine 2');
  });

  it('wraps legacy inline-HTML lines in paragraphs', () => {
    expect(migrateLegacyTextContent('<strong>a</strong>\nb')).toBe('<p><strong>a</strong></p><p>b</p>');
  });

  it('leaves rich HTML (leading block tag) and single lines unchanged', () => {
    expect(migrateLegacyTextContent('<p>A</p><p>B</p>')).toBe('<p>A</p><p>B</p>');
    expect(migrateLegacyTextContent('Just one line')).toBe('Just one line');
    expect(migrateLegacyTextContent('')).toBe('');
  });

  it('keeps raw block HTML that did not start with a block tag as HTML', () => {
    expect(migrateLegacyTextContent('Intro <ul><li>x</li></ul>')).toBe('<div>Intro <ul><li>x</li></ul></div>');
  });

  it('is idempotent for its own output', () => {
    const once = migrateLegacyTextContent('<em>a</em>\nb');
    expect(migrateLegacyTextContent(once)).toBe(once);
  });
});

describe('text <-> lines', () => {
  it('splits rich text into paragraphs', () => {
    expect(textContentToLines('<p>A</p><p><b>B</b></p>')).toEqual(['A', '<b>B</b>']);
  });

  it('builds rich text from lines (so lines stay separate paragraphs)', () => {
    expect(linesToTextContent(['A', 'B'])).toBe('<p>A</p><p>B</p>');
    expect(linesToTextContent([''])).toBe('');
  });
});
