/**
 * Searchable Google Fonts catalog with download/load buttons
 *
 * Fetches fonts from Google Fonts API, provides search and category filtering,
 * and allows loading fonts at runtime for use in presentations.
 */

import { useEffect, useState } from 'react';
import { fetchGoogleFonts, searchFonts, filterByCategory, type GoogleFont } from '@/lib/fonts/googleFontsAPI';
import { loadGoogleFont, isFontLoaded } from '@/lib/fonts/fontLoader';
import styles from './FontBrowser.module.css';

type Category = 'all' | 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';

export function FontBrowser() {
  const [allFonts, setAllFonts] = useState<GoogleFont[]>([]);
  const [filteredFonts, setFilteredFonts] = useState<GoogleFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [loadedFontFamilies, setLoadedFontFamilies] = useState<Set<string>>(new Set());
  const [loadingFont, setLoadingFont] = useState<string | null>(null);

  // Fetch fonts on mount
  useEffect(() => {
    async function loadFonts() {
      setLoading(true);
      const fonts = await fetchGoogleFonts();
      setAllFonts(fonts);
      setFilteredFonts(fonts);
      setLoading(false);
    }
    loadFonts();
  }, []);

  // Apply search and category filters
  useEffect(() => {
    let filtered = searchFonts(allFonts, searchQuery);
    filtered = filterByCategory(filtered, category);
    setFilteredFonts(filtered);
  }, [allFonts, searchQuery, category]);

  const handleLoadFont = async (font: GoogleFont) => {
    setLoadingFont(font.family);
    try {
      await loadGoogleFont(font, 'regular');
      setLoadedFontFamilies((prev) => new Set(prev).add(font.family));
    } catch (error) {
      console.error('Failed to load font:', error);
    } finally {
      setLoadingFont(null);
    }
  };

  // Empty state when no API key configured
  if (!loading && allFonts.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Set <code>VITE_GOOGLE_FONTS_API_KEY</code> to browse Google Fonts</p>
        <p className={styles.help}>
          Get your free API key from{' '}
          <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">
            Google Cloud Console
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.browser}>
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search fonts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className={styles.categoryButtons}>
          {(['all', 'serif', 'sans-serif', 'display', 'handwriting', 'monospace'] as Category[]).map((cat) => (
            <button
              key={cat}
              className={styles.categoryButton}
              data-active={category === cat}
              onClick={() => setCategory(cat)}
            >
              {cat === 'all' ? 'All' : cat.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading fonts...</div>
      ) : (
        <div className={styles.fontList}>
          {filteredFonts.slice(0, 100).map((font) => {
            const isLoaded = loadedFontFamilies.has(font.family) || isFontLoaded(font.family);
            const isLoading = loadingFont === font.family;

            return (
              <div key={font.family} className={styles.fontCard}>
                <link
                  href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}&display=swap`}
                  rel="stylesheet"
                />
                <div className={styles.fontPreview} style={{ fontFamily: `'${font.family}', sans-serif` }}>
                  {font.family}
                </div>
                <div className={styles.fontMeta}>
                  <span className={styles.fontCategory}>{font.category}</span>
                  <span className={styles.fontVariants}>{font.variants.length} variants</span>
                </div>
                <button
                  className={styles.loadButton}
                  onClick={() => handleLoadFont(font)}
                  disabled={isLoaded || isLoading}
                  data-loaded={isLoaded}
                >
                  {isLoading ? 'Loading...' : isLoaded ? '✓ Loaded' : 'Load'}
                </button>
              </div>
            );
          })}

          {filteredFonts.length > 100 && (
            <div className={styles.moreResults}>
              Showing first 100 of {filteredFonts.length} results. Refine your search to see more.
            </div>
          )}

          {filteredFonts.length === 0 && (
            <div className={styles.noResults}>No fonts match your search.</div>
          )}
        </div>
      )}
    </div>
  );
}
