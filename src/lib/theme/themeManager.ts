// ============================================================================
// Theme Manager
// ============================================================================

const STORAGE_KEY = 'fldc-preferred-theme';

/**
 * Persist the selected presentation theme to localStorage.
 * The theme is applied via data-theme on Slide containers (not on <html>).
 * The editor UI always uses the 'default' theme on <html>.
 */
export function setTheme(themeName: string): void {
  localStorage.setItem(STORAGE_KEY, themeName);
}

/**
 * Get the current theme from localStorage, or 'default' if not set.
 */
export function getTheme(): string {
  return localStorage.getItem(STORAGE_KEY) || 'default';
}

/**
 * Initialize theme on page load.
 * Always sets 'default' on <html> for the editor UI chrome.
 * Returns the stored presentation theme for context tracking.
 */
export function initializeTheme(): string {
  // Editor UI always uses the default theme
  document.documentElement.setAttribute('data-theme', 'default');
  // Return the persisted presentation theme
  return getTheme();
}

/**
 * Apply custom CSS variable overrides for live preview.
 * Sets data-theme to 'custom' and applies inline styles.
 */
export function applyCustomTheme(overrides: Record<string, string>): void {
  document.documentElement.setAttribute('data-theme', 'custom');
  Object.entries(overrides).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}

/**
 * Remove all inline style properties set by applyCustomTheme.
 */
export function clearCustomOverrides(): void {
  const style = document.documentElement.style;
  // Remove all CSS custom properties (variables start with --)
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style[i];
    if (prop.startsWith('--')) {
      style.removeProperty(prop);
    }
  }
}

/**
 * Get computed CSS variable values from the currently active theme.
 * Used by theme customizer to populate initial values.
 */
export function getComputedThemeVariables(): Record<string, string> {
  const computedStyle = getComputedStyle(document.documentElement);
  const variables = [
    '--color-bg-primary',
    '--color-bg-secondary',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-accent',
    '--color-accent-hover',
    '--color-code-bg',
    '--color-border',
    '--font-heading',
    '--font-body',
    '--font-code',
  ];

  const result: Record<string, string> = {};
  variables.forEach((varName) => {
    result[varName] = computedStyle.getPropertyValue(varName).trim();
  });

  return result;
}
