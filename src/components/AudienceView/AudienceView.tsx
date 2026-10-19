import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { usePresentationSync } from '@/hooks/usePresentationSync';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { Slide } from '@/components/Slide/Slide';
import { applyCodeSpotlight } from '@/lib/code/codeSpotlight';
import type { CodeSpotlight } from '@/types/sync';
import styles from './AudienceView.module.css';

// ============================================================================
// AudienceView Component
// ============================================================================

interface AudienceViewProps {
  aspectRatio?: '16:9' | '4:3' | '16:10';
}

/**
 * Audience view: a passive follower of the presenter window.
 * Slide + fragment state comes exclusively from sync messages (no local
 * navigation, which would immediately be overridden by the presenter).
 * On mount it restores the last known state and asks the presenter for the
 * current one. Press F for fullscreen, Escape to exit.
 */
export function AudienceView({ aspectRatio = '16:9' }: AudienceViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { presentation, currentSlideIndex, setCurrentSlide } = usePresentationStore();
  const [fragmentIndex, setFragmentIndex] = useState(0);
  const [ended, setEnded] = useState(false);

  // window.close() only works for script-opened windows. If it is blocked,
  // show an "ended" screen — never fall back to the editor, which would
  // become a second autosaving editor instance.
  const closeAudienceWindow = useCallback(() => {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) setEnded(true);
    }, 300);
  }, []);

  // Code line the presenter is hovering, for the slide it was sent for
  const [spotlight, setSpotlight] = useState<{ slideIndex: number; spotlight: CodeSpotlight } | null>(null);

  const handleNavigate = useCallback((slideIndex: number, fragIndex?: number) => {
    setCurrentSlide(slideIndex);
    setFragmentIndex(fragIndex ?? 0);
  }, [setCurrentSlide]);

  const handleSpotlight = useCallback((slideIndex: number, next: CodeSpotlight | null) => {
    setSpotlight(next ? { slideIndex, spotlight: next } : null);
  }, []);

  // Listen for navigation and end messages from presenter. The hook re-runs
  // (restore + request-state handshake) once the presentation id is known.
  usePresentationSync({
    role: 'audience',
    presentationId: presentation?.id,
    onNavigate: handleNavigate,
    onSpotlight: handleSpotlight,
    onEnd: closeAudienceWindow,
  });

  const currentSlide = presentation?.slides[currentSlideIndex];

  const shownSpotlight = spotlight?.slideIndex === currentSlideIndex ? spotlight.spotlight : null;
  useLayoutEffect(() => {
    applyCodeSpotlight(containerRef.current, shownSpotlight);
  }, [shownSpotlight, currentSlideIndex, fragmentIndex]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }, []);

  const handleEscape = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      closeAudienceWindow();
    }
  }, [closeAudienceWindow]);

  useKeyboardNav({
    onFullscreen: toggleFullscreen,
    onEscape: handleEscape,
  });

  if (ended) {
    return (
      <div className={styles.audienceView} ref={containerRef}>
        <div className={styles.error}>The presentation has ended. You can close this window.</div>
      </div>
    );
  }

  if (!currentSlide) {
    return (
      <div className={styles.audienceView} ref={containerRef}>
        <div className={styles.error}>No presentation loaded</div>
      </div>
    );
  }

  return (
    <div className={styles.audienceView} ref={containerRef}>
      <div className={styles.slideContainer} data-aspect-ratio={aspectRatio}>
        <Slide slide={currentSlide} visibleFragment={fragmentIndex} fontHeading={presentation?.fontHeading} fontBody={presentation?.fontBody} />
      </div>
      <button className={styles.exitButton} onClick={closeAudienceWindow} title="Exit presentation (Escape)">
        Exit
      </button>
    </div>
  );
}
