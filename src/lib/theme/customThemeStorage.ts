// ============================================================================
// Custom Theme Storage
// ============================================================================

import { BUILT_IN_THEMES } from './builtInThemes';
import { isThemeVariable, isSafeThemeValue } from './themeManager';

const STORAGE_KEY = 'fldc-custom-themes';
/** Fired on window when custom themes are saved/deleted in this document. */
export const CUSTOM_THEMES_CHANGED_EVENT = 'fldc-custom-themes-changed';
export const CUSTOM_THEMES_STORAGE_KEY = STORAGE_KEY;

export interface CustomTheme {
  name: string;
  version: 1;
  /** Built-in theme id this theme extends */
  base: string;
  /** Only known theme --variables with validated values */
  overrides: Record<string, string>;
}

const BUILT_IN_IDS = new Set(BUILT_IN_THEMES.map((t) => t.id));

function notifyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CUSTOM_THEMES_CHANGED_EVENT));
  }
}

/**
 * Validate and normalise an untrusted theme object. Unknown variables and
 * unsafe values are rejected (throws) so imported themes cannot inject CSS.
 */
export function validateCustomTheme(parsed: unknown): CustomTheme {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid theme format: expected an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.name !== 'string' ||
    typeof obj.version !== 'number' ||
    typeof obj.overrides !== 'object' ||
    obj.overrides === null ||
    Array.isArray(obj.overrides)
  ) {
    throw new Error('Invalid theme format: missing name, version, or overrides');
  }
  const name = obj.name.trim();
  if (!name || name.length > 64) {
    throw new Error('Invalid theme name');
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported theme version: ${obj.version}`);
  }
  const base = typeof obj.base === 'string' && BUILT_IN_IDS.has(obj.base) ? obj.base : 'default';

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj.overrides as Record<string, unknown>)) {
    if (!isThemeVariable(key)) {
      throw new Error(`Invalid theme variable: ${key}`);
    }
    if (!isSafeThemeValue(value)) {
      throw new Error(`Invalid value for ${key}`);
    }
    overrides[key] = value.trim();
  }

  return { name, version: 1, base, overrides };
}

/**
 * Save a custom theme to localStorage.
 */
export function saveCustomTheme(theme: CustomTheme): void {
  const valid = validateCustomTheme(theme);
  const themes = getCustomThemes();
  themes[valid.name] = valid;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  notifyChanged();
}

/**
 * Get all custom themes from localStorage (invalid entries are dropped).
 */
export function getCustomThemes(): Record<string, CustomTheme> {
  let json: string | null = null;
  try {
    json = localStorage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const result: Record<string, CustomTheme> = {};
    for (const value of Object.values(raw ?? {})) {
      try {
        const theme = validateCustomTheme(value);
        result[theme.name] = theme;
      } catch {
        // skip invalid stored theme
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Delete a custom theme from localStorage.
 */
export function deleteCustomTheme(name: string): void {
  const themes = getCustomThemes();
  delete themes[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  notifyChanged();
}

/**
 * Export a theme as a JSON string with 2-space indent.
 */
export function exportTheme(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * Import a theme from a JSON string.
 * Validates structure, variable names (known theme vars only) and values
 * (no url(), expression(), braces, semicolons, etc.).
 */
export function importTheme(json: string): CustomTheme {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid theme file: not valid JSON');
  }
  return validateCustomTheme(parsed);
}
