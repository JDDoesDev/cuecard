/**
 * Google Fonts API client with localStorage caching
 *
 * Fetches font list from Google Fonts API and caches results for 7 days.
 */

export interface GoogleFont {
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
  files: Record<string, string>;
}

const CACHE_KEY = 'cuecard-google-fonts-list';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Fetch Google Fonts list from API or localStorage cache
 *
 * Returns empty array if API key not configured.
 */
export async function fetchGoogleFonts(): Promise<GoogleFont[]> {
  const apiKey = import.meta.env.VITE_GOOGLE_FONTS_API_KEY;

  if (!apiKey) {
    console.warn('VITE_GOOGLE_FONTS_API_KEY not set - Google Fonts browser disabled');
    return [];
  }

  // Check localStorage cache first
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, fonts } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age < CACHE_DURATION) {
        console.log('Using cached Google Fonts list');
        return fonts as GoogleFont[];
      }
    }
  } catch (error) {
    console.error('Failed to read Google Fonts cache:', error);
  }

  // Cache miss or expired - fetch from API
  try {
    const response = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`
    );

    if (!response.ok) {
      throw new Error(`Google Fonts API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const fonts: GoogleFont[] = data.items || [];

    // Cache the result
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          fonts,
        })
      );
      console.log(`Cached ${fonts.length} fonts from Google Fonts API`);
    } catch (error) {
      console.error('Failed to cache Google Fonts list:', error);
    }

    return fonts;
  } catch (error) {
    console.error('Failed to fetch Google Fonts:', error);
    return [];
  }
}

/**
 * Search fonts by family name (case-insensitive)
 */
export function searchFonts(fonts: GoogleFont[], query: string): GoogleFont[] {
  if (!query.trim()) {
    return fonts;
  }

  const lowerQuery = query.toLowerCase();
  return fonts.filter((font) => font.family.toLowerCase().includes(lowerQuery));
}

/**
 * Filter fonts by category
 */
export function filterByCategory(fonts: GoogleFont[], category: string): GoogleFont[] {
  if (category === 'all') {
    return fonts;
  }

  return fonts.filter((font) => font.category === category);
}
