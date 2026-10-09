// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFragmentNav } from '../useFragmentNav';
import type { Slide } from '@/types/slide';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

type Api = ReturnType<typeof useFragmentNav> & { slideIndex: number; setSlide: (i: number) => void };

function render(slides: Slide[]) {
  const api = {} as { current: Api };
  function Harness() {
    const [slideIndex, setSlide] = useState(0);
    const nav = useFragmentNav(slides, slideIndex, setSlide);
    api.current = { ...nav, slideIndex, setSlide };
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  return { api, root };
}

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('useFragmentNav (hook)', () => {
  const slides = [slide([1, 2]), slide([1])];

  it('prev() into the previous slide shows all its fragments', () => {
    const r = render(slides);
    root = r.root;
    const { api } = r;
    act(() => api.current.next());
    act(() => api.current.next());
    act(() => api.current.next()); // -> slide 1, fragment 0
    expect(api.current.slideIndex).toBe(1);
    expect(api.current.visibleFragment).toBe(0);
    act(() => api.current.prev()); // -> slide 0, all fragments
    expect(api.current.slideIndex).toBe(0);
    expect(api.current.visibleFragment).toBe(2);
  });

  it('resets fragments on external slide change and reports canNext/canPrev', () => {
    const r = render(slides);
    root = r.root;
    const { api } = r;
    expect(api.current.canPrev).toBe(false);
    act(() => api.current.next());
    expect(api.current.visibleFragment).toBe(1);
    act(() => api.current.setSlide(1));
    expect(api.current.visibleFragment).toBe(0);
    expect(api.current.canNext).toBe(true); // a fragment remains on the last slide
    act(() => api.current.next());
    expect(api.current.canNext).toBe(false);
    act(() => api.current.setSlide(0));
    expect(api.current.visibleFragment).toBe(0);
  });
});
