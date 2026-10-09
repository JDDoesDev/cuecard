import { describe, it, expect } from 'vitest';
import { stepFragment, resolveVisibleFragment } from '../useFragmentNav';
import type { Slide } from '@/types/slide';

function slide(fragments: number[]): Slide {
  return {
    id: crypto.randomUUID(),
    layout: 'freestyle',
    elements: fragments.map((f) => ({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 0, y: 0, width: 10, height: 10 },
      content: 'x',
      fragment: f,
    })),
  } as unknown as Slide;
}

const slides = [slide([1, 2]), slide([]), slide([1, 2, 3])];

describe('stepFragment', () => {
  it('steps through fragments before advancing', () => {
    expect(stepFragment(slides, { slideIndex: 0, fragment: 0 }, 1)).toEqual({ slideIndex: 0, fragment: 1 });
    expect(stepFragment(slides, { slideIndex: 0, fragment: 2 }, 1)).toEqual({ slideIndex: 1, fragment: 0 });
  });

  it('going back into the previous slide shows all its fragments', () => {
    expect(stepFragment(slides, { slideIndex: 2, fragment: 0 }, -1)).toEqual({ slideIndex: 1, fragment: 0 });
    expect(stepFragment(slides, { slideIndex: 1, fragment: 0 }, -1)).toEqual({ slideIndex: 0, fragment: 2 });
  });

  it('returns null at the boundaries (used to disable nav buttons)', () => {
    expect(stepFragment(slides, { slideIndex: 0, fragment: 0 }, -1)).toBeNull();
    expect(stepFragment(slides, { slideIndex: 2, fragment: 3 }, 1)).toBeNull();
    // last slide with remaining fragments is not at the end yet
    expect(stepFragment(slides, { slideIndex: 2, fragment: 1 }, 1)).toEqual({ slideIndex: 2, fragment: 2 });
  });
});

describe('resolveVisibleFragment', () => {
  it('keeps the fragment targeted for the current slide (prev into previous slide)', () => {
    // prev() stored {0, 2} and then the slide index changed to 0
    expect(resolveVisibleFragment({ slideIndex: 0, fragment: 2 }, 0, 2)).toBe(2);
  });

  it('resets to 0 when the slide changed externally', () => {
    expect(resolveVisibleFragment({ slideIndex: 0, fragment: 2 }, 2, 3)).toBe(0);
  });

  it('clamps to the slide total', () => {
    expect(resolveVisibleFragment({ slideIndex: 1, fragment: 5 }, 1, 0)).toBe(0);
  });
});
