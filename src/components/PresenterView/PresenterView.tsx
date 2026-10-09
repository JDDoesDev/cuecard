import { useCallback, useEffect, useRef } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { usePresentationSync } from '@/hooks/usePresentationSync';
import { usePresenterTimer } from '@/hooks/usePresenterTimer';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useFragmentNav } from '@/hooks/useFragmentNav';
import { Slide } from '@/components/Slide/Slide';
import styles from './PresenterView.module.css';

// ============================================================================
// PresenterView Component
// ============================================================================

interface PresenterViewProps {
  aspectRatio?: '16:9' | '4:3' | '16:10';
}

/**
 * Presenter view with current slide, next preview, speaker notes, timer, and controls.
 * Broadcasts navigation to audience view via BroadcastChannel.
 */
export function PresenterView({ aspectRatio = '16:9' }: PresenterViewProps) {
  const { presentation, currentSlideIndex, setCurrentSlide } = usePresentationStore();
  const { broadcastNavigate, broadcastResync, broadcastEnd } = usePresentationSync({
    role: 'presenter',
    onNavigate: setCurrentSlide,
  });
  const { formattedTime, reset } = usePresenterTimer();

  const currentSlideRef = useRef<HTMLDivElement>(null);

  // Current slide and next slide
  const slides = presentation?.slides ?? [];
  const currentSlide = slides[currentSlideIndex];
  const nextSlide = slides[currentSlideIndex + 1];
  const totalSlides = slides.length;

  // Fragment-aware navigation
  const { visibleFragment, next: fragmentNext, prev: fragmentPrev } = useFragmentNav(
    slides,
    currentSlideIndex,
    setCurrentSlide,
  );

  // Wrap fragment nav to also broadcast
  const nextSlide_ = useCallback(() => {
    fragmentNext();
  }, [fragmentNext]);

  const prevSlide = useCallback(() => {
    fragmentPrev();
  }, [fragmentPrev]);

  // Broadcast whenever slide or fragment changes
  // We use an effect-like pattern: broadcast after each nav action
  // Since useFragmentNav updates state, we broadcast in the nav wrappers
  // But the state hasn't updated yet when we call next/prev, so we broadcast
  // via an effect instead. For simplicity, let's just broadcast current state.
  // Actually, the simplest correct approach: broadcast after render via the sync effect.

  const handleResync = () => {
    broadcastResync(currentSlideIndex, visibleFragment);
  };

  // Broadcast navigation to audience whenever slide or fragment changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    broadcastNavigate(currentSlideIndex, visibleFragment);
  }, [currentSlideIndex, visibleFragment, broadcastNavigate]);

  const handleEndPresentation = () => {
    broadcastEnd();
    window.location.search = '';
  };

  // Keyboard + click navigation
  useKeyboardNav({
    onNext: nextSlide_,
    onPrev: prevSlide,
    onFullscreen: () => {},
    onEscape: handleEndPresentation,
    clickTarget: currentSlideRef,
  });

  if (!currentSlide) {
    return (
      <div className={styles.presenterGrid}>
        <div className={styles.error}>No presentation loaded</div>
      </div>
    );
  }

  return (
    <div className={styles.presenterGrid}>
      {/* Current Slide (large, top-left) */}
      <div className={styles.currentSlide} ref={currentSlideRef}>
        <div className={styles.sectionLabel}>Current Slide</div>
        <div className={styles.slidePreviewContainer} data-aspect-ratio={aspectRatio}>
          <Slide slide={currentSlide} visibleFragment={visibleFragment} fontHeading={presentation?.fontHeading} fontBody={presentation?.fontBody} />
        </div>
      </div>

      {/* Next Slide Preview (top-right) */}
      <div className={styles.nextPreview}>
        <div className={styles.sectionLabel}>Next Slide</div>
        {nextSlide ? (
          <div className={styles.slidePreviewContainer} data-aspect-ratio={aspectRatio}>
            <Slide slide={nextSlide} fontHeading={presentation?.fontHeading} fontBody={presentation?.fontBody} />
          </div>
        ) : (
          <div className={styles.endMessage}>End of presentation</div>
        )}
      </div>

      {/* Speaker Notes (bottom-left) */}
      <div className={styles.notes}>
        <div className={styles.sectionLabel}>Speaker Notes</div>
        <div className={styles.notesContent}>
          {currentSlide.notes || 'No speaker notes'}
        </div>
      </div>

      {/* Controls Bar (bottom-right) */}
      <div className={styles.controls}>
        <div className={styles.timerDisplay}>
          <span className={styles.timerLabel}>Elapsed:</span>
          <span className={styles.timerValue}>{formattedTime}</span>
        </div>
        <button className={styles.controlButton} onClick={reset} title="Reset timer">
          Reset Timer
        </button>
        <button className={styles.controlButton} onClick={handleResync} title="Resync audience">
          Resync
        </button>
        <button className={styles.endButton} onClick={handleEndPresentation} title="End presentation (Escape)">
          End
        </button>
        <div className={styles.slideCounter}>
          {currentSlideIndex + 1} / {totalSlides}
        </div>
        <button
          className={styles.controlButton}
          onClick={prevSlide}
          disabled={currentSlideIndex === 0}
          title="Previous slide"
        >
          ◀ Prev
        </button>
        <button
          className={styles.controlButton}
          onClick={nextSlide_}
          disabled={currentSlideIndex >= totalSlides - 1}
          title="Next slide"
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}
