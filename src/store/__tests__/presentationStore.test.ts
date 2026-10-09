import { describe, it, expect, beforeEach } from 'vitest';
import { usePresentationStore, selectCurrentSlide, selectSlideCount } from '../presentationStore';
import { createPresentation } from '@/types/presentation';
import type { Slide, SlideElement } from '@/types/slide';

// Helper to create a slide in the new format
function createTitleSlide(title: string, subtitle?: string): Slide {
  const elements: SlideElement[] = [
    {
      id: crypto.randomUUID(),
      type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: title,
      level: 1,
    },
  ];
  if (subtitle) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 15, y: 55, width: 70, height: 10 },
      content: subtitle,
    });
  }
  return {
    id: crypto.randomUUID(),
    layout: 'title',
    transition: 'none',
    elements,
  };
}

describe('presentationStore', () => {
  beforeEach(() => {
    const state = usePresentationStore.getState();
    usePresentationStore.setState({
      presentation: null,
      currentSlideIndex: 0,
      setPresentation: state.setPresentation,
      updateSlide: state.updateSlide,
      addSlide: state.addSlide,
      deleteSlide: state.deleteSlide,
      duplicateSlide: state.duplicateSlide,
      reorderSlides: state.reorderSlides,
      setCurrentSlide: state.setCurrentSlide,
      updateElement: state.updateElement,
      addElement: state.addElement,
      deleteElement: state.deleteElement,
      resetToPreset: state.resetToPreset,
      reorderElement: state.reorderElement,
    });
  });

  describe('setPresentation', () => {
    it('sets presentation correctly', () => {
      const presentation = createPresentation();
      const { setPresentation } = usePresentationStore.getState();

      setPresentation(presentation);

      const state = usePresentationStore.getState();
      expect(state.presentation).toBe(presentation);
      expect(state.currentSlideIndex).toBe(0);
    });
  });

  describe('addSlide', () => {
    it('appends slide to empty presentation', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide } = usePresentationStore.getState();

      setPresentation(presentation);

      const slide = createTitleSlide('Test Slide');
      addSlide(slide);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides).toHaveLength(1);
      expect(state.presentation?.slides[0]).toBe(slide);
    });

    it('inserts slide at specific position', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide } = usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');
      const slide3 = createTitleSlide('Slide 3');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide3);
      addSlide(slide2, 0);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides).toHaveLength(3);
      expect(state.presentation?.slides[0].id).toBe(slide1.id);
      expect(state.presentation?.slides[1].id).toBe(slide2.id);
      expect(state.presentation?.slides[2].id).toBe(slide3.id);
    });
  });

  describe('deleteSlide', () => {
    it('removes slide and adjusts currentSlideIndex', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, deleteSlide, setCurrentSlide } =
        usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide2);
      setCurrentSlide(1);

      deleteSlide(1);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides).toHaveLength(1);
      expect(state.currentSlideIndex).toBe(0);
    });

    it('handles deleting when currentSlideIndex is out of bounds', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, deleteSlide, setCurrentSlide } =
        usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide2);
      setCurrentSlide(1);

      deleteSlide(0);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides).toHaveLength(1);
      expect(state.currentSlideIndex).toBe(0);
    });
  });

  describe('duplicateSlide', () => {
    it('creates copy with new ID and new element IDs', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, duplicateSlide } = usePresentationStore.getState();

      const originalSlide = createTitleSlide('Original', 'Subtitle');
      setPresentation(presentation);
      addSlide(originalSlide);
      duplicateSlide(0);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides).toHaveLength(2);

      const duplicate = state.presentation?.slides[1];
      expect(duplicate?.id).not.toBe(originalSlide.id);
      expect(duplicate?.layout).toBe('title');
      // Element IDs should also be new
      expect(duplicate?.elements[0].id).not.toBe(originalSlide.elements[0].id);
      // But content should be preserved
      if (duplicate?.elements[0].type === 'heading') {
        expect(duplicate.elements[0].content).toBe('Original');
      }
    });
  });

  describe('reorderSlides', () => {
    it('moves slide correctly', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderSlides } = usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');
      const slide3 = createTitleSlide('Slide 3');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide2);
      addSlide(slide3);

      reorderSlides(0, 2);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides[0].id).toBe(slide2.id);
      expect(state.presentation?.slides[1].id).toBe(slide3.id);
      expect(state.presentation?.slides[2].id).toBe(slide1.id);
    });
  });

  describe('updateSlide', () => {
    it('replaces slide at index', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, updateSlide } = usePresentationStore.getState();

      const originalSlide = createTitleSlide('Original');
      const updatedSlide: Slide = {
        ...originalSlide,
        transition: 'fade',
        elements: [
          {
            id: originalSlide.elements[0].id,
            type: 'heading',
            position: { x: 10, y: 30, width: 80, height: 20 },
            content: 'Updated',
            level: 1,
          },
        ],
      };

      setPresentation(presentation);
      addSlide(originalSlide);
      updateSlide(0, updatedSlide);

      const state = usePresentationStore.getState();
      const slide = state.presentation?.slides[0];
      expect(slide?.transition).toBe('fade');
      if (slide?.elements[0].type === 'heading') {
        expect(slide.elements[0].content).toBe('Updated');
      }
    });
  });

  describe('setCurrentSlide', () => {
    it('clamps to valid range', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, setCurrentSlide } = usePresentationStore.getState();

      setPresentation(presentation);
      addSlide(createTitleSlide('Only Slide'));

      setCurrentSlide(10);

      const state = usePresentationStore.getState();
      expect(state.currentSlideIndex).toBe(0);
    });

    it('handles negative indices', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, setCurrentSlide } = usePresentationStore.getState();

      setPresentation(presentation);
      addSlide(createTitleSlide('Only Slide'));

      setCurrentSlide(-5);

      const state = usePresentationStore.getState();
      expect(state.currentSlideIndex).toBe(0);
    });
  });

  describe('Element-level actions', () => {
    it('updateElement updates specific element by ID', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, updateElement } = usePresentationStore.getState();

      const slide = createTitleSlide('Title', 'Subtitle');
      setPresentation(presentation);
      addSlide(slide);

      const headingId = slide.elements[0].id;
      updateElement(0, headingId, { content: 'New Title' } as any);

      const state = usePresentationStore.getState();
      const el = state.presentation?.slides[0].elements[0];
      if (el?.type === 'heading') {
        expect(el.content).toBe('New Title');
      }
    });

    it('addElement appends element to slide', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, addElement } = usePresentationStore.getState();

      const slide = createTitleSlide('Title');
      setPresentation(presentation);
      addSlide(slide);

      const newElement: SlideElement = {
        id: crypto.randomUUID(),
        type: 'text',
        position: { x: 10, y: 70, width: 80, height: 20 },
        content: 'New text',
      };

      addElement(0, newElement);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides[0].elements).toHaveLength(2);
      expect(state.presentation?.slides[0].elements[1].type).toBe('text');
    });

    it('deleteElement removes element by ID', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, deleteElement } = usePresentationStore.getState();

      const slide = createTitleSlide('Title', 'Subtitle');
      setPresentation(presentation);
      addSlide(slide);

      const subtitleId = slide.elements[1].id;
      deleteElement(0, subtitleId);

      const state = usePresentationStore.getState();
      expect(state.presentation?.slides[0].elements).toHaveLength(1);
      expect(state.presentation?.slides[0].elements[0].type).toBe('heading');
    });

    it('resetToPreset replaces elements with preset defaults', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, resetToPreset } = usePresentationStore.getState();

      const slide = createTitleSlide('Title');
      setPresentation(presentation);
      addSlide(slide);

      resetToPreset(0, 'code-block');

      const state = usePresentationStore.getState();
      const updated = state.presentation?.slides[0];
      expect(updated?.layout).toBe('code-block');
      expect(updated?.elements.length).toBeGreaterThan(0);
      expect(updated?.elements.some((el) => el.type === 'code')).toBe(true);
    });
  });

  describe('Selectors', () => {
    it('selectCurrentSlide returns current slide', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, setCurrentSlide } = usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide2);
      setCurrentSlide(1);

      const state = usePresentationStore.getState();
      const currentSlide = selectCurrentSlide(state);

      expect(currentSlide?.id).toBe(slide2.id);
    });

    it('selectSlideCount returns slide count', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide } = usePresentationStore.getState();

      setPresentation(presentation);

      const state1 = usePresentationStore.getState();
      expect(selectSlideCount(state1)).toBe(0);

      addSlide(createTitleSlide('Slide 1'));

      const state2 = usePresentationStore.getState();
      expect(selectSlideCount(state2)).toBe(1);
    });
  });

  describe('Undo/Redo', () => {
    it('undo reverts slide update', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, updateSlide } = usePresentationStore.getState();

      const originalSlide = createTitleSlide('Original');
      setPresentation(presentation);
      addSlide(originalSlide);

      const updatedSlide: Slide = {
        ...originalSlide,
        transition: 'fade',
        elements: [
          { ...originalSlide.elements[0], ...(originalSlide.elements[0].type === 'heading' ? { content: 'Updated' } : {}) } as SlideElement,
        ],
      };

      updateSlide(0, updatedSlide);

      // Verify update worked
      const afterUpdate = usePresentationStore.getState();
      if (afterUpdate.presentation?.slides[0].elements[0].type === 'heading') {
        expect(afterUpdate.presentation.slides[0].elements[0].content).toBe('Updated');
      }

      // Undo
      usePresentationStore.temporal.getState().undo();

      // Verify reverted
      const afterUndo = usePresentationStore.getState();
      if (afterUndo.presentation?.slides[0].elements[0].type === 'heading') {
        expect(afterUndo.presentation.slides[0].elements[0].content).toBe('Original');
      }
    });

    it('redo re-applies undone action', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, updateSlide } = usePresentationStore.getState();

      const originalSlide = createTitleSlide('Original');
      setPresentation(presentation);
      addSlide(originalSlide);

      const updatedSlide: Slide = {
        ...originalSlide,
        elements: [
          { ...originalSlide.elements[0], ...(originalSlide.elements[0].type === 'heading' ? { content: 'Updated' } : {}) } as SlideElement,
        ],
      };

      updateSlide(0, updatedSlide);
      usePresentationStore.temporal.getState().undo();
      usePresentationStore.temporal.getState().redo();

      const afterRedo = usePresentationStore.getState();
      if (afterRedo.presentation?.slides[0].elements[0].type === 'heading') {
        expect(afterRedo.presentation.slides[0].elements[0].content).toBe('Updated');
      }
    });

    it('undo after reorderSlides reverts order', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderSlides } = usePresentationStore.getState();

      const slide1 = createTitleSlide('Slide 1');
      const slide2 = createTitleSlide('Slide 2');
      const slide3 = createTitleSlide('Slide 3');

      setPresentation(presentation);
      addSlide(slide1);
      addSlide(slide2);
      addSlide(slide3);

      reorderSlides(0, 2);

      const afterReorder = usePresentationStore.getState();
      expect(afterReorder.presentation?.slides[0].id).toBe(slide2.id);

      usePresentationStore.temporal.getState().undo();

      const afterUndo = usePresentationStore.getState();
      expect(afterUndo.presentation?.slides[0].id).toBe(slide1.id);
      expect(afterUndo.presentation?.slides[1].id).toBe(slide2.id);
      expect(afterUndo.presentation?.slides[2].id).toBe(slide3.id);
    });

    it('canUndo is false with no history', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide } = usePresentationStore.getState();

      setPresentation(presentation);
      usePresentationStore.temporal.getState().clear();

      const afterClear = usePresentationStore.temporal.getState();
      expect(afterClear.pastStates.length).toBe(0);

      addSlide(createTitleSlide('Test'));

      const afterAdd = usePresentationStore.temporal.getState();
      expect(afterAdd.pastStates.length).toBeGreaterThan(0);
    });
  });

  describe('reorderElement', () => {
    it('moves element forward one position', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };
      const el3: SlideElement = {
        id: 'el3',
        type: 'text',
        position: { x: 0, y: 50, width: 50, height: 20 },
        content: 'Third',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2, el3],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el1', 'forward');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el2', 'el1', 'el3']);
    });

    it('moves element backward one position', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };
      const el3: SlideElement = {
        id: 'el3',
        type: 'text',
        position: { x: 0, y: 50, width: 50, height: 20 },
        content: 'Third',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2, el3],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el3', 'backward');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el1', 'el3', 'el2']);
    });

    it('moves element to front (end of array)', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };
      const el3: SlideElement = {
        id: 'el3',
        type: 'text',
        position: { x: 0, y: 50, width: 50, height: 20 },
        content: 'Third',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2, el3],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el1', 'front');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el2', 'el3', 'el1']);
    });

    it('moves element to back (start of array)', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };
      const el3: SlideElement = {
        id: 'el3',
        type: 'text',
        position: { x: 0, y: 50, width: 50, height: 20 },
        content: 'Third',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2, el3],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el3', 'back');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el3', 'el1', 'el2']);
    });

    it('first element backward stays in place', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el1', 'backward');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el1', 'el2']);
    });

    it('last element forward stays in place', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'el2', 'forward');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el1', 'el2']);
    });

    it('invalid elementId does nothing', () => {
      const presentation = createPresentation();
      const { setPresentation, addSlide, reorderElement } = usePresentationStore.getState();

      const el1: SlideElement = {
        id: 'el1',
        type: 'text',
        position: { x: 0, y: 0, width: 50, height: 20 },
        content: 'First',
      };
      const el2: SlideElement = {
        id: 'el2',
        type: 'text',
        position: { x: 0, y: 25, width: 50, height: 20 },
        content: 'Second',
      };

      const slide: Slide = {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'none',
        elements: [el1, el2],
      };

      setPresentation(presentation);
      addSlide(slide);

      reorderElement(0, 'nonexistent', 'forward');

      const state = usePresentationStore.getState();
      const elements = state.presentation?.slides[0].elements;
      expect(elements?.map((e) => e.id)).toEqual(['el1', 'el2']);
    });
  });
});
