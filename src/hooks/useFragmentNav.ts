import { useState, useCallback, useEffect } from 'react';
import type { Slide } from '@/types/slide';
import { computeTotalFragments } from '@/lib/fragments';

/**
 * Fragment-aware navigation hook.
 * Steps through fragment reveals within a slide before advancing to the next slide.
 */
export function useFragmentNav(
  slides: Slide[],
  slideIndex: number,
  setCurrentSlide: (index: number) => void,
) {
  const [visibleFragment, setVisibleFragment] = useState(0);

  const currentSlide = slides[slideIndex];
  const totalFragments = currentSlide ? computeTotalFragments(currentSlide) : 0;

  // Reset fragment when slide changes externally
  useEffect(() => {
    setVisibleFragment(0);
  }, [slideIndex]);

  const next = useCallback(() => {
    if (visibleFragment < totalFragments) {
      setVisibleFragment((f) => f + 1);
    } else if (slideIndex < slides.length - 1) {
      setCurrentSlide(slideIndex + 1);
      setVisibleFragment(0);
    }
  }, [visibleFragment, totalFragments, slideIndex, slides.length, setCurrentSlide]);

  const prev = useCallback(() => {
    if (visibleFragment > 0) {
      setVisibleFragment((f) => f - 1);
    } else if (slideIndex > 0) {
      const prevSlide = slides[slideIndex - 1];
      const prevTotal = prevSlide ? computeTotalFragments(prevSlide) : 0;
      setCurrentSlide(slideIndex - 1);
      setVisibleFragment(prevTotal);
    }
  }, [visibleFragment, slideIndex, slides, setCurrentSlide]);

  const setFragment = useCallback((f: number) => {
    setVisibleFragment(f);
  }, []);

  return { visibleFragment, next, prev, totalFragments, setFragment };
}
