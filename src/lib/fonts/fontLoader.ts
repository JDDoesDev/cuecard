/**
 * Runtime font loading via blob URLs and @font-face injection
 *
 * Downloads font files from Google Fonts, caches them in IndexedDB,
 * and injects @font-face rules into the document.
 */

import { get, set } from 'idb-keyval';
import type { GoogleFont } from './googleFontsAPI';

// Track loaded fonts in memory
const loadedFonts = new Set<string>();

/**
 * Convert variant string to CSS font-weight
 *
 * Examples: '400' -> 400, 'regular' -> 400, '700' -> 700, 'bold' -> 700
 */
function variantToWeight(variant: string): number {
  if (variant === 'regular') return 400;
  if (variant === 'bold') return 700;

  // Extract numeric weight from variants like '300', '700', '300italic'
  const numericMatch = variant.match(/\d+/);
  return numericMatch ? parseInt(numericMatch[0], 10) : 400;
}

/**
 * Convert variant string to CSS font-style
 *
 * Examples: 'italic' -> 'italic', '300italic' -> 'italic', 'regular' -> 'normal'
 */
function variantToStyle(variant: string): string {
  return variant.includes('italic') ? 'italic' : 'normal';
}

/**
 * Load a Google Font and inject @font-face rule
 *
 * Downloads font file, caches in IndexedDB, creates blob URL,
 * and injects @font-face CSS rule into document.
 */
export async function loadGoogleFont(font: GoogleFont, variant: string = 'regular'): Promise<void> {
  const cacheKey = `font:${font.family}:${variant}`;

  // Check if already loaded
  if (loadedFonts.has(cacheKey)) {
    console.log(`Font already loaded: ${font.family} (${variant})`);
    return;
  }

  // Get font URL from files object (force HTTPS - API returns HTTP URLs)
  const fontUrl = font.files[variant]?.replace(/^http:\/\//, 'https://');
  if (!fontUrl) {
    throw new Error(`Variant ${variant} not available for font ${font.family}`);
  }
  if (!fontUrl.startsWith('https://') || !isSafeFontFamily(font.family)) {
    throw new Error(`Refusing to load font ${font.family} from ${fontUrl}`);
  }

  try {
    // Check IndexedDB cache first
    let blob: Blob | undefined = await get(cacheKey);

    if (!blob) {
      // Cache miss - fetch font file
      console.log(`Downloading font: ${font.family} (${variant})`);
      const response = await fetch(fontUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch font: ${response.status} ${response.statusText}`);
      }

      blob = await response.blob();

      // Cache in IndexedDB
      await set(cacheKey, blob);
      console.log(`Cached font in IndexedDB: ${cacheKey}`);
    } else {
      console.log(`Using cached font: ${font.family} (${variant})`);
    }

    // Create blob URL
    const blobUrl = URL.createObjectURL(blob);

    // Inject @font-face rule
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${font.family}';
        src: url('${blobUrl}') format('truetype');
        font-weight: ${variantToWeight(variant)};
        font-style: ${variantToStyle(variant)};
      }
    `;
    document.head.appendChild(style);

    // Mark as loaded
    loadedFonts.add(cacheKey);
    console.log(`Loaded font: ${font.family} (${variant})`);
  } catch (error) {
    console.error(`Failed to load font ${font.family} (${variant}):`, error);
    throw error;
  }
}

/**
 * Check if a font family has been loaded
 */
export function isFontLoaded(family: string): boolean {
  // Check if any variant of this font family is loaded
  for (const key of loadedFonts) {
    if (key.startsWith(`font:${family}:`)) {
      return true;
    }
  }
  return false;
}

/**
 * Get list of loaded font families
 */
export function getLoadedFonts(): string[] {
  const families = new Set<string>();

  for (const key of loadedFonts) {
    // Extract family name from key format: "font:Family Name:variant"
    const match = key.match(/^font:([^:]+):/);
    if (match) {
      families.add(match[1]);
    }
  }

  return Array.from(families);
}

/** Font family names we are willing to inject into CSS / URLs. */
export function isSafeFontFamily(family: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(family);
}

function injectFontFace(family: string, blob: Blob, variant: string) {
  const blobUrl = URL.createObjectURL(blob);
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: '${family}';
      src: url('${blobUrl}');
      font-weight: ${variantToWeight(variant)};
      font-style: ${variantToStyle(variant)};
    }
  `;
  document.head.appendChild(style);
}

const CACHED_VARIANTS = ['regular', '700', 'italic', '700italic'];

/**
 * Load a font previously downloaded by loadGoogleFont from the IndexedDB cache
 * (works offline and in presenter/audience windows). Returns false if nothing
 * is cached for this family.
 */
export async function loadCachedFont(family: string): Promise<boolean> {
  if (!isSafeFontFamily(family)) return false;
  let found = false;
  for (const variant of CACHED_VARIANTS) {
    const cacheKey = `font:${family}:${variant}`;
    if (loadedFonts.has(cacheKey)) {
      found = true;
      continue;
    }
    const blob: Blob | undefined = await get(cacheKey);
    if (!blob) continue;
    injectFontFace(family, blob, variant);
    loadedFonts.add(cacheKey);
    found = true;
  }
  return found;
}

/**
 * Load a font family via the Google Fonts CSS2 endpoint (HTTPS only, no API
 * key needed). The service worker caches fonts.googleapis.com / fonts.gstatic.com
 * responses for offline use.
 */
export function loadFontFromGoogleCss(family: string): void {
  if (!isSafeFontFamily(family) || typeof document === 'undefined') return;
  const cacheKey = `font:${family}:css2`;
  if (loadedFonts.has(cacheKey)) return;
  // The CSS2 API answers 400 when a requested axis/weight does not exist
  // (e.g. Bebas Neue, Lobster have only 400), so try 400+700 first and fall
  // back to the bare family (its default style) on error.
  const familyParam = encodeURIComponent(family).replace(/%20/g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.fldcFont = family;
  link.onerror = () => {
    link.onerror = null;
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
  };
  link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(cacheKey);
}
