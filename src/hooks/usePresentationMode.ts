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
/**
 * Open (or re-focus) the audience window. Reuses the named window, so calling
 * it again from presenter view re-opens a closed audience window.
 * Must be called from a user gesture to avoid popup blockers.
 */
export function openAudienceWindow(): OpenDualScreenResult {
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
  audienceWindow.focus?.();
  return { success: true };
}

export function openDualScreen(): OpenDualScreenResult {
  const result = openAudienceWindow();
  if (!result.success) return result;

  // Convert current tab to presenter mode
  window.location.search = '?mode=presenter';

  return { success: true };
}
