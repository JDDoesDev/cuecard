import { describe, it, expect, beforeEach } from 'vitest';
import {
  presentationStore,
  beginHistoryBatch,
  endHistoryBatch,
  coalesceHistory,
  resetHistoryCoalescing,
} from '../presentationStore';
import { createPresentation } from '@/types/presentation';
import type { Slide, SlideElement } from '@/types/slide';

function textEl(content: string, id = crypto.randomUUID()): SlideElement {
  return { id, type: 'text', position: { x: 10, y: 10, width: 30, height: 10 }, content };
}

function makeSlide(label: string, elements: SlideElement[] = [textEl(label)]): Slide {
  return { id: crypto.randomUUID(), layout: 'freestyle', transition: 'none', elements };
}

function setup(slideCount: number): Slide[] {
  const slides = Array.from({ length: slideCount }, (_, i) => makeSlide(`Slide ${i + 1}`));
  const presentation = { ...createPresentation(), slides };
  presentationStore.getState().setPresentation(presentation);
  presentationStore.temporal.getState().clear();
  resetHistoryCoalescing();
  return slides;
}

const state = () => presentationStore.getState();
const temporal = () => presentationStore.temporal.getState();
const ids = () => state().presentation!.slides.map((s) => s.id);

describe('currentSlideIndex bookkeeping', () => {
  beforeEach(() => setup(0));

  it('follows the moved slide when reordering the current slide', () => {
    const slides = setup(4);
    state().setCurrentSlide(0);
    state().reorderSlides(0, 2);
    expect(state().currentSlideIndex).toBe(2);
    expect(ids()[state().currentSlideIndex]).toBe(slides[0].id);
  });

  it('keeps the same slide in view when another slide moves across it', () => {
    const slides = setup(4);
    state().setCurrentSlide(2);
    state().reorderSlides(0, 3); // moves an earlier slide past the current one
    expect(ids()[state().currentSlideIndex]).toBe(slides[2].id);

    state().reorderSlides(3, 0); // and back in front of it
    expect(ids()[state().currentSlideIndex]).toBe(slides[2].id);
  });

  it('keeps the same slide in view when deleting an earlier slide', () => {
    const slides = setup(3);
    state().setCurrentSlide(2);
    state().deleteSlide(0);
    expect(ids()[state().currentSlideIndex]).toBe(slides[2].id);
  });

  it('refuses to delete the last remaining slide', () => {
    setup(1);
    state().deleteSlide(0);
    expect(state().presentation!.slides).toHaveLength(1);
  });

  it('clamps the index after undoing "add slide at end"', () => {
    setup(2);
    state().addSlide(makeSlide('New'));
    state().setCurrentSlide(2);
    temporal().undo();
    expect(state().presentation!.slides).toHaveLength(2);
    expect(state().currentSlideIndex).toBe(1);
  });

  it('shifts the index when duplicating an earlier slide', () => {
    const slides = setup(3);
    state().setCurrentSlide(2);
    state().duplicateSlide(0);
    expect(ids()[state().currentSlideIndex]).toBe(slides[2].id);
  });
});

describe('setPresentation history', () => {
  it('clears undo history when a different deck is loaded', () => {
    setup(1);
    state().addSlide(makeSlide('x'));
    expect(temporal().pastStates.length).toBe(1);

    state().setPresentation({ ...createPresentation(), slides: [makeSlide('other')] });
    expect(temporal().pastStates.length).toBe(0);
  });
});

describe('batch element actions', () => {
  it('deleteElements removes several elements in one undo step', () => {
    const a = textEl('a');
    const b = textEl('b');
    const c = textEl('c');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [a, b, c])] });
    temporal().clear();

    state().deleteElements(0, [a.id, c.id]);
    expect(state().presentation!.slides[0].elements.map((e) => e.id)).toEqual([b.id]);
    expect(temporal().pastStates.length).toBe(1);

    temporal().undo();
    expect(state().presentation!.slides[0].elements).toHaveLength(3);
  });

  it('addElements and updateElements are single undo steps', () => {
    setup(1);
    const els = [textEl('1'), textEl('2'), textEl('3')];
    state().addElements(0, els);
    expect(temporal().pastStates.length).toBe(1);

    state().updateElements(
      0,
      els.map((el) => ({ id: el.id, updates: { position: { x: 50, y: 50, width: 10, height: 10 } } }))
    );
    expect(temporal().pastStates.length).toBe(2);
    expect(state().presentation!.slides[0].elements.slice(1).every((e) => e.position.x === 50)).toBe(true);
  });

  it('reorderElements moves a multi-selection as one step', () => {
    const els = [textEl('a'), textEl('b'), textEl('c'), textEl('d')];
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', els)] });
    temporal().clear();

    state().reorderElements(0, [els[0].id, els[1].id], 'front');
    expect(state().presentation!.slides[0].elements.map((e) => e.id)).toEqual(
      [els[2].id, els[3].id, els[0].id, els[1].id]
    );
    expect(temporal().pastStates.length).toBe(1);
  });

  it('does not record history for no-op changes (e.g. slide navigation)', () => {
    setup(3);
    state().setCurrentSlide(2);
    state().setCurrentSlide(1);
    expect(temporal().pastStates.length).toBe(0);
  });
});

describe('resetToPreset is non-destructive', () => {
  it('switching to freestyle keeps every element and position', () => {
    const els = [textEl('a'), textEl('b')];
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', els)] });
    const before = structuredClone(state().presentation!.slides[0].elements);

    state().resetToPreset(0, 'freestyle');
    const slide = state().presentation!.slides[0];
    expect(slide.layout).toBe('freestyle');
    expect(slide.elements).toEqual(before);

    state().resetToPreset(0, 'blank');
    expect(state().presentation!.slides[0].elements).toEqual(before);
  });

  it('keeps elements that do not match a preset slot', () => {
    const heading: SlideElement = {
      id: 'h', type: 'heading', position: { x: 1, y: 1, width: 10, height: 10 }, content: 'T', level: 1,
    };
    const img: SlideElement = {
      id: 'img', type: 'image', position: { x: 60, y: 60, width: 20, height: 20 }, url: 'a.png',
    };
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [heading, img])] });

    state().resetToPreset(0, 'title');
    const els = state().presentation!.slides[0].elements;
    // Heading moved into the preset slot, image kept where it was
    expect(els.find((e) => e.id === 'h')!.position).toEqual({ x: 15, y: 30, width: 70, height: 20 });
    expect(els.find((e) => e.id === 'img')!.position).toEqual(img.position);
  });
});

describe('undo coalescing', () => {
  it('a drag (begin/end batch with many updates) is one undo step', () => {
    const el = textEl('drag');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [el])] });
    temporal().clear();

    beginHistoryBatch();
    for (let i = 1; i <= 20; i++) {
      state().updateElement(0, el.id, { position: { x: i, y: i, width: 30, height: 10 } });
    }
    endHistoryBatch();

    expect(temporal().pastStates.length).toBe(1);
    temporal().undo();
    expect(state().presentation!.slides[0].elements[0].position.x).toBe(10);
  });

  it('a click without movement records nothing', () => {
    setup(1);
    beginHistoryBatch();
    endHistoryBatch();
    expect(temporal().pastStates.length).toBe(0);
  });

  it('a typing burst becomes one undo step', () => {
    const el = textEl('');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [el])] });
    temporal().clear();
    resetHistoryCoalescing();

    for (const content of ['h', 'he', 'hel', 'hell', 'hello']) {
      coalesceHistory(`content:${el.id}`, () => state().updateElement(0, el.id, { content }));
    }
    expect(temporal().pastStates.length).toBe(1);

    temporal().undo();
    expect((state().presentation!.slides[0].elements[0] as { content: string }).content).toBe('');
  });

  it('another action in between starts a new entry', () => {
    const el = textEl('');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [el])] });
    temporal().clear();
    resetHistoryCoalescing();

    coalesceHistory('k', () => state().updateElement(0, el.id, { content: 'a' }));
    state().addSlide(makeSlide('other'));
    coalesceHistory('k', () => state().updateElement(0, el.id, { content: 'ab' }));
    expect(temporal().pastStates.length).toBe(3);
  });
});

describe('restoreCachedUrls', () => {
  it('updates cachedUrl without creating undo history', () => {
    const img: SlideElement = {
      id: 'img', type: 'image', position: { x: 0, y: 0, width: 50, height: 50 }, url: 'idb://x',
    };
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [img])] });
    temporal().clear();

    state().restoreCachedUrls([{ slideIndex: 0, elementId: 'img', cachedUrl: 'blob:abc' }]);

    const restored = state().presentation!.slides[0].elements[0];
    expect(restored.type === 'image' && restored.cachedUrl).toBe('blob:abc');
    expect(temporal().pastStates.length).toBe(0);
    expect(temporal().isTracking).toBe(true);

    // Normal edits are still tracked afterwards
    state().updateElement(0, 'img', { alt: 'x' });
    expect(temporal().pastStates.length).toBe(1);
  });
});

describe('history batch robustness', () => {
  it('a new gesture closes a stale batch whose end was lost', async () => {
    const { discardHistoryBatch, isHistoryBatchOpen } = await import('../presentationStore');
    const el = textEl('x');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [el])] });
    temporal().clear();

    beginHistoryBatch();
    state().updateElement(0, el.id, { position: { x: 1, y: 1, width: 10, height: 10 } });
    // mouseup lost; next gesture starts
    beginHistoryBatch();
    state().updateElement(0, el.id, { position: { x: 2, y: 2, width: 10, height: 10 } });
    endHistoryBatch();

    expect(isHistoryBatchOpen()).toBe(false);
    expect(temporal().isTracking).toBe(true);
    expect(temporal().pastStates.length).toBe(2);

    // A discarded batch records nothing and resumes tracking
    beginHistoryBatch();
    state().updateElement(0, el.id, { position: { x: 3, y: 3, width: 10, height: 10 } });
    discardHistoryBatch();
    expect(temporal().pastStates.length).toBe(2);
    expect(temporal().isTracking).toBe(true);
  });

  it('coalescing at full history does not evict the oldest entry', () => {
    const el = textEl('');
    setup(0);
    state().setPresentation({ ...createPresentation(), slides: [makeSlide('s', [el])] });
    temporal().clear();
    resetHistoryCoalescing();

    for (let i = 0; i < 49; i++) state().updateElement(0, el.id, { content: `pre${i}` });
    coalesceHistory('k', () => state().updateElement(0, el.id, { content: 'a' }));
    expect(temporal().pastStates.length).toBe(50);
    const oldest = temporal().pastStates[0];

    coalesceHistory('k', () => state().updateElement(0, el.id, { content: 'ab' }));
    coalesceHistory('k', () => state().updateElement(0, el.id, { content: 'abc' }));
    expect(temporal().pastStates.length).toBe(50);
    expect(temporal().pastStates[0]).toBe(oldest);
  });
});
