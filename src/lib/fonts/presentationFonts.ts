import type { Presentation } from '@/types/presentation';
import { BUILT_IN_FONTS } from './availableFonts';
import { loadCachedFont, loadFontFromGoogleCss, isSafeFontFamily } from './fontLoader';

// ============================================================================
// Presentation font loading
// ============================================================================
// Google Fonts picked in the FontBrowser are only injected into the document
// that loaded them. Any window rendering the deck (editor after reload,
// presenter, audience) must re-load the non-built-in fonts the deck uses.

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica', 'helvetica neue', 'arial',
  'courier new', 'times new roman', 'georgia', 'ui-sans-serif', 'ui-serif', 'ui-monospace',
]);

const builtIn = new Set(BUILT_IN_FONTS.map((f) => f.toLowerCase()));

/** Split a CSS font stack into family names. */
function familiesFromStack(stack: string): string[] {
  return stack
    .split(',')
    .map((p) => p.trim().replace(/&quot;|&#39;/g, '').replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

/**
 * Collect all non-built-in font families referenced by a presentation:
 * presentation fontHeading/fontBody, element fontFamily, inline
 * `font-family:` styles in rich-text content, plus any extra CSS font stacks
 * (e.g. custom theme --font-* overrides).
 */
export function collectPresentationFonts(
  presentation: Presentation | null | undefined,
  extraStacks: string[] = [],
): string[] {
  const stacks: string[] = [...extraStacks];
  if (presentation) {
    if (presentation.fontHeading) stacks.push(presentation.fontHeading);
    if (presentation.fontBody) stacks.push(presentation.fontBody);
    for (const slide of presentation.slides) {
      for (const el of slide.elements) {
        const ff = (el as { fontFamily?: unknown }).fontFamily;
        if (typeof ff === 'string' && ff) stacks.push(ff);
        const texts: string[] = [];
        if ('content' in el && typeof el.content === 'string') texts.push(el.content);
        if ('items' in el && Array.isArray(el.items)) texts.push(...el.items.filter((i): i is string => typeof i === 'string'));
        for (const text of texts) {
          // Stored HTML quotes family names as &quot; (whose ';' is not a declaration end)
          for (const m of text.matchAll(/font-family:\s*((?:&quot;|&#39;|[^;"<>])+)/gi)) stacks.push(m[1]);
        }
      }
    }
  }

  const result = new Set<string>();
  for (const stack of stacks) {
    for (const family of familiesFromStack(stack)) {
      const lower = family.toLowerCase();
      if (GENERIC.has(lower) || builtIn.has(lower) || !isSafeFontFamily(family)) continue;
      result.add(family);
    }
  }
  return [...result].sort();
}

const requested = new Set<string>();

/**
 * Ensure the given font families are available in this document: first from
 * the IndexedDB cache populated by loadGoogleFont, otherwise via the Google
 * Fonts CSS2 endpoint over HTTPS. Each family is requested at most once.
 */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  await Promise.all(
    families.map(async (family) => {
      if (requested.has(family)) return;
      requested.add(family);
      try {
        const cached = await loadCachedFont(family);
        if (!cached) loadFontFromGoogleCss(family);
      } catch (err) {
        console.error(`Failed to load font ${family}:`, err);
        loadFontFromGoogleCss(family);
      }
    }),
  );
}

/** Convenience: scan a presentation and load every non-built-in font it uses. */
export function ensurePresentationFontsLoaded(
  presentation: Presentation | null | undefined,
  extraStacks: string[] = [],
): Promise<void> {
  return ensureFontsLoaded(collectPresentationFonts(presentation, extraStacks));
}
