import { getLoadedFonts } from './fontLoader';

// Built-in fonts shipped with the app
export const BUILT_IN_FONTS = [
  'Inter',
  'Roboto',
  'Playfair Display',
  'Merriweather',
  'Source Sans 3',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Poppins',
  'Raleway',
  'Fira Code',
  'JetBrains Mono',
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
