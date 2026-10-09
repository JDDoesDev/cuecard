import { describe, it, expect } from 'vitest';
import { computeTotalFragments, isElementVisible, getVisibleItemCount } from '../fragments';
import type { Slide, ListElement } from '@/types/slide';

function makeSlide(elements: any[]): Slide {
  return {
    id: 'test-slide',
    layout: 'freestyle',
    transition: 'none',
    elements,
  };
}

describe('computeTotalFragments', () => {
  it('returns 0 when no elements have fragments', () => {
    const slide = makeSlide([
      { id: '1', type: 'text', position: { x: 0, y: 0, width: 50, height: 50 }, content: 'hello' },
      { id: '2', type: 'heading', position: { x: 0, y: 0, width: 50, height: 50 }, content: 'title', level: 1 },
    ]);
    expect(computeTotalFragments(slide)).toBe(0);
  });

  it('returns the highest fragment value', () => {
    const slide = makeSlide([
      { id: '1', type: 'text', position: { x: 0, y: 0, width: 50, height: 50 }, content: 'a', fragment: 1 },
      { id: '2', type: 'text', position: { x: 0, y: 0, width: 50, height: 50 }, content: 'b', fragment: 3 },
      { id: '3', type: 'text', position: { x: 0, y: 0, width: 50, height: 50 }, content: 'c' },
    ]);
    expect(computeTotalFragments(slide)).toBe(3);
  });

  it('accounts for fragmentPerItem on lists', () => {
    const slide = makeSlide([
      {
        id: '1',
        type: 'list',
        position: { x: 0, y: 0, width: 50, height: 50 },
        items: ['a', 'b', 'c', 'd'],
        ordered: false,
        fragment: 1,
        fragmentPerItem: true,
      },
    ]);
    // Last item at fragment 1 + 4 - 1 = 4
    expect(computeTotalFragments(slide)).toBe(4);
  });

  it('handles list with fragmentPerItem but only one item', () => {
    const slide = makeSlide([
      {
        id: '1',
        type: 'list',
        position: { x: 0, y: 0, width: 50, height: 50 },
        items: ['only'],
        ordered: false,
        fragment: 2,
        fragmentPerItem: true,
      },
    ]);
    // 2 + 1 - 1 = 2
    expect(computeTotalFragments(slide)).toBe(2);
  });
});

describe('isElementVisible', () => {
  it('returns true for elements without fragment', () => {
    const el = { id: '1', type: 'text' as const, position: { x: 0, y: 0, width: 50, height: 50 }, content: 'hi' };
    expect(isElementVisible(el, 0)).toBe(true);
    expect(isElementVisible(el, 5)).toBe(true);
  });

  it('returns false when visibleFragment is below the element fragment', () => {
    const el = { id: '1', type: 'text' as const, position: { x: 0, y: 0, width: 50, height: 50 }, content: 'hi', fragment: 2 };
    expect(isElementVisible(el, 0)).toBe(false);
    expect(isElementVisible(el, 1)).toBe(false);
  });

  it('returns true when visibleFragment equals or exceeds the element fragment', () => {
    const el = { id: '1', type: 'text' as const, position: { x: 0, y: 0, width: 50, height: 50 }, content: 'hi', fragment: 2 };
    expect(isElementVisible(el, 2)).toBe(true);
    expect(isElementVisible(el, 3)).toBe(true);
  });
});

describe('getVisibleItemCount', () => {
  const baseList: ListElement = {
    id: '1',
    type: 'list',
    position: { x: 0, y: 0, width: 50, height: 50 },
    items: ['a', 'b', 'c'],
    ordered: false,
  };

  it('returns all items when fragmentPerItem is not set', () => {
    expect(getVisibleItemCount(baseList, 0)).toBe(3);
  });

  it('returns all items when fragment is not set', () => {
    const list = { ...baseList, fragmentPerItem: true };
    expect(getVisibleItemCount(list, 0)).toBe(3);
  });

  it('returns correct count based on visibleFragment', () => {
    const list: ListElement = { ...baseList, fragment: 1, fragmentPerItem: true };
    expect(getVisibleItemCount(list, 0)).toBe(0); // fragment 1 not reached yet
    expect(getVisibleItemCount(list, 1)).toBe(1); // first item
    expect(getVisibleItemCount(list, 2)).toBe(2); // second item
    expect(getVisibleItemCount(list, 3)).toBe(3); // all items
    expect(getVisibleItemCount(list, 10)).toBe(3); // capped at items length
  });
});
