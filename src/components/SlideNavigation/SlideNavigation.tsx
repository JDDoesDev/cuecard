import { useState, useEffect } from 'react';
import styles from './SlideNavigation.module.css';

// ============================================================================
// Slide Navigation Component (UX-02)
// ============================================================================

interface SlideNavigationProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}

/**
 * Bottom navigation bar with slide counter and controls.
 * Auto-hides after 3 seconds of inactivity, reappears on mouse movement.
 */
export function SlideNavigation({
  current,
  total,
  onPrev,
  onNext,
  onFullscreen,
  isFullscreen,
}: SlideNavigationProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-hide logic: show on mouse move, hide after 3s inactivity
  useEffect(() => {
    let timeoutId: number;

    const handleMouseMove = () => {
      setIsVisible(true);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setIsVisible(false), 3000);
    };

    document.addEventListener('mousemove', handleMouseMove);

    // Initial timeout
    timeoutId = window.setTimeout(() => setIsVisible(false), 3000);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const isFirst = current === 1;
  const isLast = current === total;

  return (
    <div className={styles.navigation} data-visible={isVisible}>
      <button
        className={styles.navButton}
        onClick={onPrev}
        disabled={isFirst}
        aria-label="Previous slide"
      >
        ←
      </button>

      <span className={styles.counter}>
        {current} / {total}
      </span>

      <button
        className={styles.navButton}
        onClick={onNext}
        disabled={isLast}
        aria-label="Next slide"
      >
        →
      </button>

      <button
        className={styles.fullscreenButton}
        onClick={onFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? '⊗' : '⛶'}
      </button>
    </div>
  );
}
