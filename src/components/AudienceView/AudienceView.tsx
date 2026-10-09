import { useCallback, useEffect, useRef, useState } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { usePresentationSync } from '@/hooks/usePresentationSync';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { Slide } from '@/components/Slide/Slide';
import { SYNC_STORAGE_KEY } from '@/types/sync';
import type { SyncMessage } from '@/types/sync';
import styles from './AudienceView.module.css';

// ============================================================================
// AudienceView Component
// ============================================================================

function closeAudienceWindow() {
  window.close();
  // Fallback if window.close() is blocked (not opened via window.open)
  window.location.search = '';
}

interface AudienceViewProps {
  aspectRatio?: '16:9' | '4:3' | '16:10';
}

/**
 * Audience view that listens for navigation from presenter.
 * Press F for fullscreen, Escape to exit.
 */
export function AudienceView({ aspectRatio = '16:9' }: AudienceViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { presentation, currentSlideIndex, setCurrentSlide } = usePresentationStore();
  const [fragmentIndex, setFragmentIndex] = useState(0);

  // Handle navigate with fragment
  const handleNavigate = useCallback((slideIndex: number, fragIndex?: number) => {
    setCurrentSlide(slideIndex);
    setFragmentIndex(fragIndex ?? 0);
  }, [setCurrentSlide]);

  // Listen for navigation and end messages from presenter
  usePresentationSync({
    role: 'audience',
    onNavigate: handleNavigate,
    onEnd: closeAudienceWindow,
  });

  const currentSlide = presentation?.slides[currentSlideIndex];
  const totalSlides = presentation?.slides.length || 0;

  // Restore sync state after presentation loads (sync hook fires too early — before setPresentation)
  const hasRestored = useRef(false);
  useEffect(() => {
    if (!presentation || hasRestored.current) return;
    hasRestored.current = true;

    const lastMessage = localStorage.getItem(SYNC_STORAGE_KEY);
    if (!lastMessage) return;
    try {
      const message = JSON.parse(lastMessage) as SyncMessage;
      if (message.type === 'navigate' || message.type === 'resync') {
        setCurrentSlide(message.slideIndex);
        setFragmentIndex(message.fragmentIndex ?? 0);
      }
    } catch {
      // ignore
    }
  }, [presentation, setCurrentSlide]);

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
  }, []);

  // Allow local keyboard navigation in audience view
  const nextSlide = () => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlide(currentSlideIndex + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlide(currentSlideIndex - 1);
    }
  };

  useKeyboardNav({
    onNext: nextSlide,
    onPrev: prevSlide,
    onFullscreen: toggleFullscreen,
    onEscape: handleEscape,
  });

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
