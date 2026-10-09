import { useRef } from 'react';
import { Slide } from '@/components/Slide/Slide';
import { SlideNavigation } from '@/components/SlideNavigation/SlideNavigation';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useFragmentNav } from '@/hooks/useFragmentNav';
import { useFullscreen } from '@/hooks/useFullscreen';
import styles from './Presentation.module.css';

// ============================================================================
// Presentation Container
// ============================================================================

interface PresentationProps {
  aspectRatio?: '16:9' | '4:3' | '16:10';
}

/**
 * Main presentation container with responsive scaling, navigation,
 * fullscreen support, and slide transitions.
 */
export function Presentation({ aspectRatio = '16:9' }: PresentationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store state
  const { presentation, currentSlideIndex, setCurrentSlide } =
    usePresentationStore();

  const slides = presentation?.slides ?? [];
  const slideCount = slides.length;
  const currentSlide = slides[currentSlideIndex];

  // Fragment-aware navigation
  const { visibleFragment, next: nextSlide, prev: prevSlide } = useFragmentNav(
    slides,
    currentSlideIndex,
    setCurrentSlide,
  );

  // Fullscreen hook
  const { isFullscreen, toggleFullscreen, exitFullscreen } =
    useFullscreen(containerRef);

  // Keyboard + click navigation
  useKeyboardNav({
    onNext: nextSlide,
    onPrev: prevSlide,
    onFullscreen: toggleFullscreen,
    onEscape: exitFullscreen,
    clickTarget: containerRef,
  });

  if (!presentation || !currentSlide) {
    return (
      <div className={styles.presentation}>
        <div className={styles.emptyState}>No presentation loaded</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.presentation}
      data-aspect={aspectRatio}
    >
      <div className={styles.slideContainer}>
        <div
          className={styles.slideTransition}
          key={currentSlideIndex}
          data-transition={currentSlide.transition || 'fade'}
        >
          <Slide slide={currentSlide} visibleFragment={visibleFragment} fontHeading={presentation.fontHeading} fontBody={presentation.fontBody} />
        </div>
      </div>

      <SlideNavigation
        current={currentSlideIndex + 1}
        total={slideCount}
        onPrev={prevSlide}
        onNext={nextSlide}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />
    </div>
  );
}
