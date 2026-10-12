import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  initializeTheme,
  clearCustomOverrides,
  setTheme as persistTheme,
  installCustomThemes,
  customThemeId,
} from '../../lib/theme/themeManager';
import {
  getCustomThemes,
  CUSTOM_THEMES_CHANGED_EVENT,
  CUSTOM_THEMES_STORAGE_KEY,
  type CustomTheme,
} from '../../lib/theme/customThemeStorage';
import { BUILT_IN_THEMES } from '../../lib/theme/builtInThemes';
import { useUiTheme, type UiThemePreference } from '../../lib/theme/uiTheme';
import { collectPresentationFonts, ensureFontsLoaded } from '../../lib/fonts/presentationFonts';
import { usePresentation } from '../../hooks/usePresentationStore';
import { presentationStore } from '../../store/presentationStore';

// Import all theme CSS files
import '../../styles/themes/default.css';
import '../../styles/themes/dark.css';
import '../../styles/themes/light.css';
import '../../styles/themes/corporate.css';
import '../../styles/themes/nature.css';
import '../../styles/themes/minimal.css';
import '../../styles/themes/aurora.css';
import '../../styles/themes/sunset.css';
import '../../styles/themes/midnight.css';
import '../../styles/themes/ember.css';
import '../../styles/themes/ocean.css';
import '../../styles/themes/split-teal.css';
import '../../styles/themes/split-rose.css';
import '../../styles/themes/split-charcoal.css';
import '../../styles/themes/split-sage.css';
import '../../styles/themes/neon-vice.css';
import '../../styles/themes/synthwave.css';
import '../../styles/themes/cyber-grid.css';

// ============================================================================
// Types
// ============================================================================

/** A built-in theme id or a custom theme id (`custom-<slug>`). */
export type Theme = string;

interface ThemeContextValue {
  /** Theme id applied to slide containers (data-theme). Always resolvable. */
  theme: Theme;
  /** Select a theme: applies it and stores it in presentation.theme. */
  setTheme: (theme: Theme) => void;
  /** Custom themes keyed by name. */
  customThemes: Record<string, CustomTheme>;
  /** Editor chrome light/dark preference (never affects slides). */
  uiTheme: UiThemePreference;
  setUiTheme: (preference: UiThemePreference) => void;
}

const THEME_MIGRATION_KEY = 'cuecard-theme-in-deck-migrated';
const BUILT_IN_IDS = new Set(BUILT_IN_THEMES.map((t) => t.id));

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

/** Write a theme id into the loaded presentation (no-op if unchanged). */
function writePresentationTheme(theme: string, recordHistory: boolean) {
  const current = presentationStore.getState().presentation;
  if (!current || current.theme === theme) return;
  const temporal = (presentationStore as unknown as {
    temporal?: { getState: () => { pause: () => void; resume: () => void; isTracking: boolean } };
  }).temporal;
  // Only resume if we paused: a drag/resize batch may already have paused tracking
  const pausedHere = !recordHistory && temporal?.getState().isTracking === true;
  if (pausedHere) temporal?.getState().pause();
  try {
    presentationStore.setState((state) => {
      if (state.presentation) {
        state.presentation.theme = theme;
        state.presentation.updatedAt = new Date().toISOString();
      }
    });
  } finally {
    if (pausedHere) temporal?.getState().resume();
  }
}

/**
 * Theme source of truth is `presentation.theme` (part of the deck, from
 * frontmatter / file / autosave). When no deck is loaded, the last selected
 * theme from localStorage is used. Custom themes are installed as CSS rules
 * keyed by their id so every slide container renders them.
 */
export function ThemeProvider({ children, defaultTheme = 'default' }: ThemeProviderProps) {
  const [localTheme, setLocalTheme] = useState<Theme>(defaultTheme);
  const [customThemes, setCustomThemes] = useState<Record<string, CustomTheme>>(() => getCustomThemes());
  const presentation = usePresentation();
  const [uiTheme, setUiTheme] = useUiTheme();

  // Editor UI always gets 'default' on <html>; restore persisted selection
  useEffect(() => {
    const storedTheme = initializeTheme();
    if (storedTheme) setLocalTheme(storedTheme);
  }, []);

  // Install custom theme CSS; refresh when themes change here or in another window
  useEffect(() => {
    installCustomThemes(Object.values(customThemes));
  }, [customThemes]);

  useEffect(() => {
    const refresh = () => setCustomThemes(getCustomThemes());
    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_THEMES_STORAGE_KEY) refresh();
    };
    window.addEventListener(CUSTOM_THEMES_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CUSTOM_THEMES_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // One-time migration (per browser, guarded by a localStorage marker): decks
  // saved before the theme lived in the deck carry 'default' while the user's
  // chosen theme was only in localStorage. Adopt it once; afterwards a deck
  // that deliberately uses 'default' is never overwritten.
  const migrated = useRef(false);
  useEffect(() => {
    if (!presentation || migrated.current) return;
    migrated.current = true;
    try {
      if (localStorage.getItem(THEME_MIGRATION_KEY)) return;
      localStorage.setItem(THEME_MIGRATION_KEY, '1');
    } catch {
      return;
    }
    const stored = initializeTheme();
    if ((!presentation.theme || presentation.theme === 'default') && stored && stored !== 'default') {
      writePresentationTheme(stored, false);
    }
  }, [presentation]);

  const customIds = useMemo(
    () => new Set(Object.values(customThemes).map((t) => customThemeId(t.name))),
    [customThemes],
  );

  const requested = presentation?.theme || localTheme;
  const theme = BUILT_IN_IDS.has(requested) || customIds.has(requested) ? requested : 'default';

  // Load any non-built-in fonts the deck (or active custom theme) uses, so
  // they survive reloads and appear in presenter/audience windows.
  // The effect is keyed on a font signature string, so edits that don't
  // change fonts don't trigger loading work.
  const fontSignature = useMemo(() => {
    const active = Object.values(customThemes).find((t) => customThemeId(t.name) === theme);
    const stacks = active
      ? ['--font-heading', '--font-body', '--font-code'].map((k) => active.overrides[k] ?? '').filter(Boolean)
      : [];
    return collectPresentationFonts(presentation, stacks).join('\n');
  }, [presentation, customThemes, theme]);
  useEffect(() => {
    if (fontSignature) void ensureFontsLoaded(fontSignature.split('\n'));
  }, [fontSignature]);

  const setTheme = useCallback((newTheme: Theme) => {
    setLocalTheme(newTheme);
    persistTheme(newTheme);
    clearCustomOverrides();
    writePresentationTheme(newTheme, true);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, customThemes, uiTheme, setUiTheme }),
    [theme, setTheme, customThemes, uiTheme, setUiTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
