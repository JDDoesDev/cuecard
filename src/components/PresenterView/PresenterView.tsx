import { useCallback, useEffect, useRef, useState } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { usePresentationSync } from '@/hooks/usePresentationSync';
import { usePresenterTimer } from '@/hooks/usePresenterTimer';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useFragmentNav } from '@/hooks/useFragmentNav';
import { openAudienceWindow } from '@/hooks/usePresentationMode';
import { Slide } from '@/components/Slide/Slide';
import styles from './PresenterView.module.css';

// ============================================================================
// PresenterView Component
// ============================================================================

interface PresenterViewProps {
  aspectRatio?: '16:9' | '4:3' | '16:10';
}

/** How long a first Escape press "arms" ending the presentation. */
const END_CONFIRM_WINDOW_MS = 3000;

/**
 * Presenter view with current slide, next preview, speaker notes, timer, and controls.
 * Broadcasts navigation to audience view via BroadcastChannel.
 */
export function PresenterView({ aspectRatio = '16:9' }: PresenterViewProps) {
  const { presentation, currentSlideIndex, setCurrentSlide } = usePresentationStore();
  const { formattedTime, reset } = usePresenterTimer();

  const currentSlideRef = useRef<HTMLDivElement>(null);

  // Current slide and next slide
  const slides = presentation?.slides ?? [];
  const currentSlide = slides[currentSlideIndex];
  const nextSlide = slides[currentSlideIndex + 1];
  const totalSlides = slides.length;

  // Fragment-aware navigation
  const { visibleFragment, next, prev, canNext, canPrev } = useFragmentNav(
    slides,
    currentSlideIndex,
    setCurrentSlide,
  );

  // Latest state for answering audience 'request-state' handshakes
  const stateRef = useRef({ slideIndex: currentSlideIndex, fragmentIndex: visibleFragment });
  stateRef.current = { slideIndex: currentSlideIndex, fragmentIndex: visibleFragment };
  const getState = useCallback(() => stateRef.current, []);

  const { broadcastNavigate, broadcastResync, broadcastEnd } = usePresentationSync({
    role: 'presenter',
    presentationId: presentation?.id,
    getState,
  });

  // Broadcast only when slide or fragment actually changes (broadcastNavigate is
  // stable, so timer re-renders do not re-broadcast). Also re-broadcasts once
  // the presentation id becomes known (presenter mounted before hydration),
  // since audiences reject messages without a matching id.
  const presentationId = presentation?.id;
  useEffect(() => {
    if (!presentationId) return;
    broadcastNavigate(currentSlideIndex, visibleFragment);
  }, [currentSlideIndex, visibleFragment, broadcastNavigate, presentationId]);

  const handleResync = () => {
    broadcastResync(currentSlideIndex, visibleFragment);
  };

  const [popupBlocked, setPopupBlocked] = useState(false);
  const handleOpenAudience = () => {
    setPopupBlocked(!openAudienceWindow().success);
  };

  const endPresentation = useCallback(() => {
    broadcastEnd();
    window.location.search = '';
  }, [broadcastEnd]);

  const handleEndClick = () => {
    if (window.confirm('End the presentation and close the audience window?')) {
      endPresentation();
    }
  };

  // Escape must be pressed twice within END_CONFIRM_WINDOW_MS to end the show
  const [endArmed, setEndArmed] = useState(false);
  useEffect(() => {
    if (!endArmed) return;
    const id = window.setTimeout(() => setEndArmed(false), END_CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [endArmed]);

  const handleEscape = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (endArmed) {
      endPresentation();
    } else {
      setEndArmed(true);
    }
  };

  // Keyboard + click navigation
  useKeyboardNav({
    onNext: next,
    onPrev: prev,
    onFullscreen: () => {},
    onEscape: handleEscape,
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
        {endArmed && (
          <div className={styles.confirmBanner} role="alert">
            Press Escape again to end the presentation
          </div>
        )}
        {popupBlocked && (
          <div className={styles.confirmBanner} role="alert">
            Popup blocked — allow popups to open the audience window
          </div>
        )}
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
        <button className={styles.controlButton} onClick={handleOpenAudience} title="Open or re-open the audience window">
          Audience Window
        </button>
        <button className={styles.endButton} onClick={handleEndClick} title="End presentation (Escape twice)">
          End
        </button>
        <div className={styles.slideCounter}>
          {currentSlideIndex + 1} / {totalSlides}
        </div>
        <button
          className={styles.controlButton}
          onClick={prev}
          disabled={!canPrev}
          title="Previous step"
        >
          ◀ Prev
        </button>
        <button
          className={styles.controlButton}
          onClick={next}
          disabled={!canNext}
          title="Next step"
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}
