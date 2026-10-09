// ============================================================================
// Custom Theme Storage
// ============================================================================

const STORAGE_KEY = 'fldc-custom-themes';

export interface CustomTheme {
  name: string;
  version: 1;
  base: string;
  overrides: Record<string, string>;
}

/**
 * Save a custom theme to localStorage.
 */
export function saveCustomTheme(theme: CustomTheme): void {
  const themes = getCustomThemes();
  themes[theme.name] = theme;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
}

/**
 * Get all custom themes from localStorage.
 */
export function getCustomThemes(): Record<string, CustomTheme> {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return {};
  try {
    return JSON.parse(json);
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
}

/**
 * Export a theme as a JSON string with 2-space indent.
 */
export function exportTheme(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * Import a theme from a JSON string.
 * Validates that it has required fields.
 */
export function importTheme(json: string): CustomTheme {
  const parsed = JSON.parse(json);

  // Validate required fields
  if (
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'number' ||
    typeof parsed.overrides !== 'object' ||
    parsed.overrides === null
  ) {
    throw new Error('Invalid theme format: missing name, version, or overrides');
  }

  return parsed as CustomTheme;
}
