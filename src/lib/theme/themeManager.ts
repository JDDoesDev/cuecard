// ============================================================================
// Theme Manager
// ============================================================================
//
// Model:
// - The editor UI chrome always uses data-theme="default" on <html>.
// - Slides use data-theme="<themeId>" on their slide container
//   ([data-slide-container]); theme CSS files define variables under
//   [data-theme='<id>'].
// - A custom theme is { base: built-in theme id, overrides: {--var: value} }.
//   Its id is `custom-<slug>`. We inject a <style> with a rule
//   [data-theme='custom-<slug>'] { <base theme vars resolved from a probe>; <overrides> }
//   so every slide container (Slide, editor canvas, thumbnails, presenter,
//   audience) picks it up via its data-theme attribute.
// - Customizer live preview injects overrides for the active theme id, scoped
//   to slide containers only, so the editor UI is not restyled.

import type { CustomTheme } from './customThemeStorage';

const STORAGE_KEY = 'cuecard-preferred-theme';
const CUSTOM_STYLE_ID = 'cuecard-custom-themes';
const PREVIEW_STYLE_ID = 'cuecard-theme-preview';
/** Dispatched on window whenever injected theme CSS (custom themes / preview) changes. */
export const THEME_STYLES_CHANGED_EVENT = 'cuecard-theme-styles-changed';

function notifyStylesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_STYLES_CHANGED_EVENT));
}

/**
 * Theme variables a custom theme may override / that are copied from the
 * base theme. Size/spacing scale vars are intentionally excluded: slide
 * containers redefine them with container-query units.
 */
export const THEME_VARIABLES = [
  '--color-bg-primary',
  '--color-bg-secondary',
  '--color-bg-tertiary',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-light',
  '--color-code-bg',
  '--color-code-text',
  '--color-border',
  '--color-border-light',
  '--font-heading',
  '--font-body',
  '--font-code',
  '--slide-bg',
  '--heading-glow',
  '--heading-glow-padding',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--shadow-xl',
] as const;

const THEME_VARIABLE_SET = new Set<string>(THEME_VARIABLES);

export function isThemeVariable(name: string): boolean {
  return THEME_VARIABLE_SET.has(name);
}

/**
 * Validate a CSS value for a theme variable. Rejects anything that could
 * escape the declaration or load/execute remote content.
 */
export function isSafeThemeValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 300) return false;
  if (/[;{}<>\\@!]/.test(value)) return false;
  if (/url\s*\(|expression\s*\(|image-set\s*\(|javascript:|-moz-binding|behavior\s*:|\/\*/i.test(value)) return false;
  return true;
}

// ----------------------------------------------------------------------------
// Persisted selection
// ----------------------------------------------------------------------------

/** Persist the selected presentation theme (fallback when no deck is loaded). */
export function setTheme(themeName: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeName);
  } catch {
    // ignore storage failures
  }
}

/** Get the persisted theme, or 'default' if not set. */
export function getTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'default';
  } catch {
    return 'default';
  }
}

/**
 * Initialize theme on page load.
 * Always sets 'default' on <html> for the editor UI chrome.
 * Returns the stored presentation theme for context tracking.
 */
export function initializeTheme(): string {
  document.documentElement.setAttribute('data-theme', 'default');
  return getTheme();
}

// ----------------------------------------------------------------------------
// Custom theme ids
// ----------------------------------------------------------------------------

export function customThemeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `custom-${slug || 'theme'}`;
}

export function isCustomThemeId(id: string): boolean {
  return id.startsWith('custom-');
}

/** Only ids made of safe characters are ever interpolated into selectors. */
function isSafeThemeId(id: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(id);
}

// ----------------------------------------------------------------------------
// Reading actual theme values
// ----------------------------------------------------------------------------

/**
 * Read the actual values of THEME_VARIABLES for a given theme id by rendering
 * a hidden probe element with that data-theme. Works for built-in themes and
 * installed custom themes (unlike reading <html>, which is always 'default').
 */
export function getThemeVariables(themeId: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof document === 'undefined' || !isSafeThemeId(themeId)) return result;
  const probe = document.createElement('div');
  probe.setAttribute('data-theme', themeId);
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  try {
    const computed = getComputedStyle(probe);
    for (const name of THEME_VARIABLES) {
      const value = computed.getPropertyValue(name).trim();
      if (value) result[name] = value;
    }
  } finally {
    probe.remove();
  }
  return result;
}

/** @deprecated Reads the editor chrome theme; use getThemeVariables(themeId). */
export function getComputedThemeVariables(themeId = 'default'): Record<string, string> {
  return getThemeVariables(themeId);
}

// ----------------------------------------------------------------------------
// Injected stylesheets
// ----------------------------------------------------------------------------

function getStyleElement(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  } else if (el !== document.head.lastElementChild && id === PREVIEW_STYLE_ID) {
    document.head.appendChild(el); // keep preview last so it wins ties
  }
  return el;
}

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .filter(([k, v]) => isThemeVariable(k) && isSafeThemeValue(v))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

/**
 * Overrides to actually apply. If the background color is overridden but the
 * slide background is not, the background color must also replace a base
 * theme's gradient --slide-bg, otherwise the change would be invisible.
 */
export function effectiveOverrides(overrides: Record<string, string>): Record<string, string> {
  const result = { ...overrides };
  if (result['--color-bg-primary'] && !result['--slide-bg']) {
    result['--slide-bg'] = result['--color-bg-primary'];
  }
  return result;
}

/** Build the CSS for a set of custom themes. Base values come from probes. */
export function buildCustomThemesCss(
  themes: CustomTheme[],
  readBase: (baseId: string) => Record<string, string> = getThemeVariables,
): string {
  const rules: string[] = [];
  for (const theme of themes) {
    const id = customThemeId(theme.name);
    const base = isSafeThemeId(theme.base) && !isCustomThemeId(theme.base) ? theme.base : 'default';
    const vars = { ...readBase(base), ...effectiveOverrides(theme.overrides) };
    rules.push(`[data-theme='${id}'] {\n${declarations(vars)}\n}`);
  }
  return rules.join('\n\n');
}

/** Install (or refresh) the stylesheet defining all custom themes. */
export function installCustomThemes(themes: CustomTheme[]): void {
  if (typeof document === 'undefined') return;
  // Clear first so probes for base themes are not affected by stale rules
  const el = getStyleElement(CUSTOM_STYLE_ID);
  el.textContent = '';
  el.textContent = buildCustomThemesCss(themes);
  notifyStylesChanged();
}

/**
 * Live-preview overrides on slides using `themeId` (scoped to slide
 * containers so the editor UI is untouched). Pass null to clear.
 */
export function applyCustomTheme(overrides: Record<string, string> | null, themeId?: string): void {
  if (typeof document === 'undefined') return;
  if (!overrides || !themeId || !isSafeThemeId(themeId)) {
    clearCustomOverrides();
    return;
  }
  const el = getStyleElement(PREVIEW_STYLE_ID);
  el.textContent = `[data-slide-container][data-theme='${themeId}'] {\n${declarations(effectiveOverrides(overrides))}\n}`;
  notifyStylesChanged();
}

/** Remove live-preview overrides. */
export function clearCustomOverrides(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(PREVIEW_STYLE_ID);
  if (!el) return;
  el.remove();
  notifyStylesChanged();
}

/** CSS text for a custom theme id, e.g. for embedding in exported HTML. */
export function getCustomThemeCss(themeId: string): string {
  if (typeof document === 'undefined' || !isCustomThemeId(themeId)) return '';
  const sheet = document.getElementById(CUSTOM_STYLE_ID)?.textContent ?? '';
  const start = sheet.indexOf(`[data-theme='${themeId}']`);
  if (start < 0) return '';
  const end = sheet.indexOf('}', start);
  return sheet.slice(start, end + 1);
}
