import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

/**
 * Compresses an image file for use in slides.
 * Default: maxSizeMB=1, maxWidthOrHeight=1920
 * Uses WebWorker, preserves EXIF, outputs WebP at 0.85 quality.
 * Falls back to original file on compression failure.
 */
export async function compressForSlide(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const maxSizeMB = options.maxSizeMB ?? 1;
  const maxWidthOrHeight = options.maxWidthOrHeight ?? 1920;

  try {
    // Skip compression for GIFs to preserve animation
    if (file.type === 'image/gif') {
      console.log(`GIF skipped compression (${(file.size / 1024).toFixed(1)}KB) — preserving animation`);
      return file;
    }

    const originalSize = file.size;

    const compressed = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      preserveExif: true,
      fileType: 'image/webp',
      initialQuality: 0.85,
    });

    const compressedSize = compressed.size;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    console.log(
      `Image compressed: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB (${ratio}% reduction)`
    );

    return compressed;
  } catch (error) {
    console.error('Image compression failed, using original:', error);
    return file;
  }
}
