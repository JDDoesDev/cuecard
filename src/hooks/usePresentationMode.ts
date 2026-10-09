import { useMemo } from 'react';

// ============================================================================
// usePresentationMode Hook
// ============================================================================

export type PresentationMode = 'presenter' | 'audience' | 'edit';

export interface PresentationModeResult {
  isPresenter: boolean;
  isAudience: boolean;
  mode: PresentationMode;
}

export function usePresentationMode(): PresentationModeResult {
  const mode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');

    if (modeParam === 'presenter') return 'presenter';
    if (modeParam === 'audience') return 'audience';
    return 'edit';
  }, []);

  return {
    isPresenter: mode === 'presenter',
    isAudience: mode === 'audience',
    mode,
  };
}

// ============================================================================
// openPresenterWindow - Standalone Function
// ============================================================================

export interface OpenDualScreenResult {
  success: boolean;
  error?: 'popup-blocked';
}

/**
 * Opens audience view in a new window (to drag to external monitor) and
 * converts the current tab to presenter view (notes, timer, controls).
 * IMPORTANT: Must be called directly in a click handler to avoid popup blockers.
 */
export function openDualScreen(): OpenDualScreenResult {
  const audienceUrl = `${window.location.origin}${window.location.pathname}?mode=audience`;

  // Open audience window (speaker drags this to second monitor)
  const audienceWindow = window.open(
    audienceUrl,
    'fldc-audience',
    'width=1200,height=800,popup'
  );

  // Check if popup was blocked
  if (!audienceWindow || audienceWindow.closed || typeof audienceWindow.closed === 'undefined') {
    return { success: false, error: 'popup-blocked' };
  }

  // Convert current tab to presenter mode
  window.location.search = '?mode=presenter';

  return { success: true };
}
