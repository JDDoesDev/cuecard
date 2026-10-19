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
    'cuecard-audience',
    'width=1200,height=800,popup'
  );

  // Check if popup was blocked
  if (!audienceWindow || audienceWindow.closed || typeof audienceWindow.closed === 'undefined') {
    return { success: false, error: 'popup-blocked' };
  }
  audienceWindow.focus?.();
  return { success: true };
}

/** Presenter URL parameter: 1-based slide to start presenting from. */
const START_SLIDE_PARAM = 'slide';

/**
 * @param startSlideIndex - slide to start from (the slide selected in the
 *   editor); the presenter reads it with readStartSlideIndex().
 */
export function openDualScreen(startSlideIndex = 0): OpenDualScreenResult {
  const result = openAudienceWindow();
  if (!result.success) return result;

  // Convert current tab to presenter mode (currentSlideIndex isn't persisted
  // across the reload, so the start slide goes in the URL)
  const params = new URLSearchParams({ mode: 'presenter' });
  if (startSlideIndex > 0) params.set(START_SLIDE_PARAM, String(startSlideIndex + 1));
  window.location.search = `?${params}`;

  return { success: true };
}

/** The 0-based start slide from the presenter URL, or null. */
export function readStartSlideIndex(): number | null {
  const raw = new URLSearchParams(window.location.search).get(START_SLIDE_PARAM);
  if (raw === null) return null;
  const slide = Number(raw);
  return Number.isInteger(slide) && slide >= 1 ? slide - 1 : null;
}

/** Drop the start slide from the URL so a later reload doesn't jump back to it. */
export function clearStartSlideParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(START_SLIDE_PARAM)) return;
  url.searchParams.delete(START_SLIDE_PARAM);
  window.history.replaceState(window.history.state, '', url);
}
