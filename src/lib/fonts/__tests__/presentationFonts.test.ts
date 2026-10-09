import { describe, it, expect } from 'vitest';
import { collectPresentationFonts } from '../presentationFonts';
import { BUILT_IN_FONTS } from '../availableFonts';
import { createPresentation } from '@/types/presentation';

describe('collectPresentationFonts', () => {
  it('collects non-built-in fonts from presentation, elements and inline styles', () => {
    const p = createPresentation();
    p.fontHeading = 'Bebas Neue';
    p.fontBody = 'Inter';
    p.slides = [{
      id: 's1',
      layout: 'freestyle',
      elements: [
        { id: 'a', type: 'heading', level: 1, content: 'x', fontFamily: 'Lobster', position: { x: 0, y: 0, width: 1, height: 1 } },
        { id: 'b', type: 'text', content: '<span style="font-family: Pacifico, cursive">hi</span>', position: { x: 0, y: 0, width: 1, height: 1 } },
      ],
    } as never];
    expect(collectPresentationFonts(p, ["'Caveat', sans-serif"])).toEqual(['Bebas Neue', 'Caveat', 'Lobster', 'Pacifico']);
  });

  it('ignores unsafe family names', () => {
    const p = createPresentation();
    p.fontHeading = "x'); } body { background: url(evil)";
    expect(collectPresentationFonts(p)).toEqual([]);
  });

  it('lists all 18 bundled fonts as built-in', () => {
    expect(BUILT_IN_FONTS).toHaveLength(18);
    expect(BUILT_IN_FONTS).toEqual(expect.arrayContaining(['Nunito', 'Oswald', 'PT Serif', 'Libre Baskerville', 'Source Code Pro', 'Work Sans']));
  });
});
