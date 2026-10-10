/**
 * Inline (per-selection) font family helpers. Rich text stores the family as a
 * Tiptap textStyle mark: `<span style="font-family: &quot;Playfair Display&quot;, serif;">`.
 * The quoted name plus a generic fallback keeps text readable while a Google
 * Font is still loading; presentationFonts.ts collects these names for loading.
 */

const SERIF = new Set(['playfair display', 'merriweather', 'pt serif', 'libre baskerville', 'georgia', 'times new roman']);
const MONO = new Set(['fira code', 'jetbrains mono', 'source code pro', 'courier new']);

/**
 * CSS font stack for a family name: `"Name", <generic>` (double quotes, the
 * form browsers serialize, so stored HTML is stable across edit sessions).
 */
export function fontFamilyCss(name: string): string {
  const clean = name.replace(/['"\\;{}<>]/g, '').trim();
  const lower = clean.toLowerCase();
  const generic = MONO.has(lower) ? 'monospace' : SERIF.has(lower) ? 'serif' : 'sans-serif';
  return `"${clean}", ${generic}`;
}

/** Canonical form of a stored/pasted font-family value (null when empty). */
export function normalizeFontFamilyCss(css: string | null | undefined): string | null {
  const name = fontFamilyName(css);
  return name ? fontFamilyCss(name) : null;
}

/** First family name of a CSS font stack, unquoted ('' when none). */
export function fontFamilyName(css: string | null | undefined): string {
  if (!css) return '';
  const first = css.replace(/&quot;|&#39;/g, '"').split(',')[0] ?? '';
  return first.trim().replace(/^['"]|['"]$/g, '').trim();
}
