import { getLoadedFonts } from './fontLoader';

// Built-in fonts shipped with the app (must match the @fontsource imports in src/styles/fonts.ts)
export const BUILT_IN_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Source Sans 3',
  'Nunito',
  'Work Sans',
  'Oswald',
  'Playfair Display',
  'Merriweather',
  'PT Serif',
  'Libre Baskerville',
  'Fira Code',
  'JetBrains Mono',
  'Source Code Pro',
];

/**
 * Get all available fonts: built-in + loaded Google Fonts.
 * Returns a deduplicated sorted list.
 */
export function getAvailableFonts(): string[] {
  const loaded = getLoadedFonts();
  const all = [...BUILT_IN_FONTS];
  for (const font of loaded) {
    if (!all.includes(font)) {
      all.push(font);
    }
  }
  return all;
}
