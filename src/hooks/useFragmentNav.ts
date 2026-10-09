import { useState, useCallback } from 'react';
import type { Slide } from '@/types/slide';
import { computeTotalFragments } from '@/lib/fragments';

export interface FragmentPosition {
  slideIndex: number;
  fragment: number;
}

/**
 * Pure navigation step: given the current position, return the position after
 * moving one step forward (+1) or backward (-1), or null if at the boundary.
 * Moving backward into the previous slide lands on its last fragment step so
 * all of its fragments are visible.
 */
export function stepFragment(
  slides: Slide[],
  position: FragmentPosition,
  direction: 1 | -1,
): FragmentPosition | null {
  const { slideIndex, fragment } = position;
  const slide = slides[slideIndex];
  const total = slide ? computeTotalFragments(slide) : 0;

  if (direction === 1) {
    if (fragment < total) return { slideIndex, fragment: fragment + 1 };
    if (slideIndex < slides.length - 1) return { slideIndex: slideIndex + 1, fragment: 0 };
    return null;
  }

  if (fragment > 0) return { slideIndex, fragment: Math.min(fragment, total + 1) - 1 };
  if (slideIndex > 0) {
    const prevSlide = slides[slideIndex - 1];
    return { slideIndex: slideIndex - 1, fragment: prevSlide ? computeTotalFragments(prevSlide) : 0 };
  }
  return null;
}

/**
 * Resolve the visible fragment for the current slide. The stored position is
 * keyed by slide index: if the slide changed externally (e.g. thumbnail click,
 * sync), the stored fragment belongs to another slide and we start at 0.
 */
export function resolveVisibleFragment(
  stored: FragmentPosition,
  slideIndex: number,
  totalFragments: number,
): number {
  if (stored.slideIndex !== slideIndex) return 0;
  return Math.max(0, Math.min(stored.fragment, totalFragments));
}

/**
 * Fragment-aware navigation hook.
 * Steps through fragment reveals within a slide before advancing to the next slide.
 */
export function useFragmentNav(
  slides: Slide[],
  slideIndex: number,
  setCurrentSlide: (index: number) => void,
) {
  const [stored, setStored] = useState<FragmentPosition>({ slideIndex, fragment: 0 });
  const [seenIndex, setSeenIndex] = useState(slideIndex);

  // External slide change (thumbnail click, sync, ...): forget the fragment of
  // the slide we left, unless a prev() already targeted the new slide.
  if (seenIndex !== slideIndex) {
    setSeenIndex(slideIndex);
    if (stored.slideIndex !== slideIndex) setStored({ slideIndex, fragment: 0 });
  }

  const currentSlide = slides[slideIndex];
  const totalFragments = currentSlide ? computeTotalFragments(currentSlide) : 0;
  const visibleFragment = resolveVisibleFragment(stored, slideIndex, totalFragments);
  const position: FragmentPosition = { slideIndex, fragment: visibleFragment };
  const canNext = stepFragment(slides, position, 1) !== null;
  const canPrev = stepFragment(slides, position, -1) !== null;

  const go = useCallback((target: FragmentPosition | null) => {
    if (!target) return;
    setStored(target);
    if (target.slideIndex !== slideIndex) setCurrentSlide(target.slideIndex);
  }, [slideIndex, setCurrentSlide]);

  const next = useCallback(
    () => go(stepFragment(slides, { slideIndex, fragment: visibleFragment }, 1)),
    [go, slides, slideIndex, visibleFragment],
  );
  const prev = useCallback(
    () => go(stepFragment(slides, { slideIndex, fragment: visibleFragment }, -1)),
    [go, slides, slideIndex, visibleFragment],
  );

  const setFragment = useCallback((f: number) => {
    setStored({ slideIndex, fragment: f });
  }, [slideIndex]);

  return {
    visibleFragment,
    next,
    prev,
    totalFragments,
    setFragment,
    canNext,
    canPrev,
  };
}
