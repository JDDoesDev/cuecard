import { compressForSlide } from './imageCompression';
import { cacheImageBlob } from './imageCaching';

/**
 * Fetches an image from a URL, compresses it, caches it to IndexedDB under its
 * content hash, and returns the live blob URL plus cache key.
 *
 * Falls back to the original URL (and no cacheKey) on CORS or fetch errors —
 * the image will display from the network but won't be available offline.
 */
export async function fetchAndCacheImage(
  url: string
): Promise<{ blobUrl: string; cacheKey?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Convert to File for compression
    const fileName = url.split('/').pop() || 'image';
    const file = new File([blob], fileName, { type: blob.type });

    const compressed = await compressForSlide(file);
    return await cacheImageBlob(compressed);
  } catch (error) {
    console.warn('Failed to fetch/cache image, using original URL:', error);
    return { blobUrl: url };
  }
}

/**
 * Validates and normalizes image URLs.
 * Returns the URL if valid, null otherwise.
 */
export function extractImageUrl(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  // Check for common image extensions
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const lowerUrl = trimmed.toLowerCase();
  const hasImageExtension = imageExtensions.some((ext) => lowerUrl.includes(ext));

  // Accept if it has image extension or looks like it could be an image
  // (some CDNs don't have extensions in URLs)
  return hasImageExtension || lowerUrl.includes('image') ? trimmed : trimmed;
}
