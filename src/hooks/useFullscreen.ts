import { useState, useEffect, useCallback, RefObject } from 'react';

// ============================================================================
// Fullscreen Hook (UX-05)
// ============================================================================

interface UseFullscreenReturn {
  isFullscreen: boolean;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

/**
 * Fullscreen API hook with state synchronization.
 * Tracks fullscreen state via fullscreenchange event.
 */
export function useFullscreen(
  elementRef: RefObject<HTMLElement | null>
): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state with fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      if (elementRef.current && !document.fullscreenElement) {
        await elementRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }, [elementRef]);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
