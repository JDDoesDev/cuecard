// ============================================================================
// UI Theme (light / dark / system)
// ============================================================================
//
// Controls only the editor chrome. It is applied as data-ui-theme on <html>;
// dark colors are defined under :root[data-ui-theme='dark'] (src/styles/uiDark.css).
// Slide containers carry their own data-theme, which redefines every color
// variable, so slides render the same regardless of this setting.
// index.html applies the stored preference before React mounts (no flash) —
// keep its inline script in sync with the storage key and values here.

import { useCallback, useEffect, useState } from 'react';

export type UiThemePreference = 'light' | 'dark' | 'system';
export type ResolvedUiTheme = 'light' | 'dark';

export const UI_THEME_STORAGE_KEY = 'cuecard-ui-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is UiThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getUiThemePreference(): UiThemePreference {
  try {
    const stored = localStorage.getItem(UI_THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export function resolveUiTheme(preference: UiThemePreference): ResolvedUiTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

export function applyUiTheme(preference: UiThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-theme', resolveUiTheme(preference));
}

/**
 * Current UI theme preference and a setter. Applies it to <html>, follows OS
 * changes while on 'system', and syncs with other windows (presenter/audience).
 */
export function useUiTheme(): [UiThemePreference, (preference: UiThemePreference) => void] {
  const [preference, setPreferenceState] = useState<UiThemePreference>(getUiThemePreference);

  useEffect(() => {
    applyUiTheme(preference);
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyUiTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === UI_THEME_STORAGE_KEY) setPreferenceState(getUiThemePreference());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next: UiThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  return [preference, setPreference];
}
