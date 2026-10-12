import { useState, useRef, useCallback, useEffect } from 'react';
import { parsePresentation } from '@/lib/parser/parsePresentation';
import { presentationStore } from '@/store/presentationStore';
import { Slide } from '@/components/Slide/Slide';
import type { Presentation } from '@/types/presentation';
import { formatValidationError } from '@/lib/storage/fileStorage';
import { compressForSlide } from '@/lib/media/imageCompression';
import { cacheImageBlob, getCachedImage, pinImageKeys, unpinImageKeys } from '@/lib/media/imageCaching';
import { resolveImageReferences, findUnresolvedImageRefs, collectImageCacheKeys } from '@/lib/media/imageRestore';
import styles from './MarkdownImportDialog.module.css';

interface MarkdownImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MarkdownImportDialog({ isOpen, onClose }: MarkdownImportDialogProps) {
  const [parsedPresentation, setParsedPresentation] = useState<Presentation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [imageKeys, setImageKeys] = useState<Map<string, string>>(new Map());
  const [unresolvedImages, setUnresolvedImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Keep preview blob URLs alive while the dialog shows them (App's restore
  // pass would otherwise release keys the store doesn't reference yet).
  useEffect(() => {
    if (!parsedPresentation) return;
    const keys = [...collectImageCacheKeys(parsedPresentation)];
    pinImageKeys(keys);
    return () => unpinImageKeys(keys);
  }, [parsedPresentation]);

  // Cache selected image files (by content hash) and map them by filename
  const cacheImageFiles = useCallback(async (files: File[], known: Map<string, string>) => {
    const next = new Map(known);
    for (const file of files) {
      const blob = await compressForSlide(file);
      const { cacheKey } = await cacheImageBlob(blob, file.name);
      next.set(file.name.toLowerCase(), cacheKey);
    }
    return next;
  }, []);

  // Link image references to cached blobs and fill cachedUrl for the preview
  const linkImages = useCallback(async (presentation: Presentation, keys: Map<string, string>) => {
    const linked: Presentation = structuredClone(presentation);
    await resolveImageReferences(linked, keys);
    for (const slide of linked.slides) {
      for (const el of slide.elements) {
        if (el.type === 'image' && el.cacheKey) {
          el.cachedUrl = (await getCachedImage(el.cacheKey)) ?? undefined;
        }
      }
    }
    setUnresolvedImages(findUnresolvedImageRefs(linked));
    return linked;
  }, []);

  // Handle file selection: one markdown file plus any referenced images
  const handleFilesSelect = useCallback(async (files: File[]) => {
    setError(null);
    setIsLoading(true);

    try {
      const markdownFile = files.find((f) => /\.(md|markdown)$/i.test(f.name));
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (!markdownFile) {
        throw new Error('Please include a .md or .markdown file.');
      }

      const keys = await cacheImageFiles(images, imageKeys);
      setImageKeys(keys);

      const markdownText = await markdownFile.text();
      const presentation = await parsePresentation(markdownText);

      // Check if presentation has slides
      if (!presentation.slides || presentation.slides.length === 0) {
        setError('No slides found in the markdown file. Make sure slides are separated by --- markers.');
        setParsedPresentation(null);
      } else {
        setParsedPresentation(await linkImages(presentation, keys));
      }
    } catch (err) {
      setError(`Failed to import markdown: ${formatValidationError(err)}`);
      setParsedPresentation(null);
    } finally {
      setIsLoading(false);
    }
  }, [cacheImageFiles, imageKeys, linkImages]);

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length > 0) {
        handleFilesSelect(files);
      }
    },
    [handleFilesSelect]
  );

  // Attach referenced images after the markdown has been parsed
  const handleImageInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
      e.target.value = '';
      if (files.length === 0 || !parsedPresentation) return;
      setIsLoading(true);
      try {
        const keys = await cacheImageFiles(files, imageKeys);
        setImageKeys(keys);
        setParsedPresentation(await linkImages(parsedPresentation, keys));
      } catch (err) {
        setError(`Failed to add images: ${formatValidationError(err)}`);
      } finally {
        setIsLoading(false);
      }
    },
    [cacheImageFiles, imageKeys, linkImages, parsedPresentation]
  );

  // Handle import confirmation
  const handleImport = useCallback(() => {
    if (parsedPresentation) {
      const { setPresentation } = presentationStore.getState();
      setPresentation(parsedPresentation);

      // Reset state and close
      setParsedPresentation(null);
      setError(null);
      setImageKeys(new Map());
      setUnresolvedImages([]);
      onClose();
    }
  }, [parsedPresentation, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setParsedPresentation(null);
    setError(null);
    setImageKeys(new Map());
    setUnresolvedImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  }, [onClose]);

  // Handle click on file input button
  const handleClickFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle dialog escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className={styles.header}>
          <h2 id="dialog-title">Import Markdown Presentation</h2>
          <button
            className={styles.closeButton}
            onClick={handleCancel}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* Hidden inputs stay mounted so "Try Another File" works from the error state */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,image/*"
            multiple
            onChange={handleFileInputChange}
            className={styles.fileInput}
            aria-label="Select markdown file and images"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageInputChange}
            className={styles.fileInput}
            aria-label="Select referenced images"
          />

          {/* File upload area */}
          {!parsedPresentation && !error && !isLoading && (
            <div className={styles.uploadArea}>
              <button
                className={styles.uploadButton}
                onClick={handleClickFileInput}
              >
                Select Markdown File
              </button>
              <p className={styles.uploadHint}>
                Choose a .md or .markdown file with slides separated by ---.
                Select the images it references at the same time to include them.
              </p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className={styles.loading}>
              <p>Parsing markdown file...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className={styles.error}>
              <h3>Error</h3>
              <p>{error}</p>
              <button
                className={styles.retryButton}
                onClick={handleClickFileInput}
              >
                Try Another File
              </button>
            </div>
          )}

          {/* Preview area */}
          {parsedPresentation && !error && !isLoading && (
            <>
              <div className={styles.previewInfo}>
                <p className={styles.slideCount}>
                  {parsedPresentation.slides.length} slide
                  {parsedPresentation.slides.length !== 1 ? 's' : ''} detected
                </p>
                <p className={styles.presentationTitle}>
                  Title: {parsedPresentation.title}
                </p>
                {unresolvedImages.length > 0 && (
                  <div className={styles.uploadHint} role="status">
                    <p>
                      {unresolvedImages.length} image{unresolvedImages.length !== 1 ? 's' : ''} not found:{' '}
                      {unresolvedImages.join(', ')}
                    </p>
                    <button
                      className={styles.retryButton}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      Add Image Files
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.previewGrid}>
                {parsedPresentation.slides.map((slide, index) => (
                  <div key={slide.id} className={styles.slidePreview}>
                    <div className={styles.slideHeader}>
                      <span className={styles.slideNumber}>Slide {index + 1}</span>
                      <span className={styles.layoutBadge}>{slide.layout}</span>
                    </div>
                    <div className={styles.slideContainer}>
                      <Slide slide={slide} />
                    </div>
                    {slide.notes && (
                      <div className={styles.notesIndicator}>
                        Has speaker notes
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions bar */}
        {parsedPresentation && !error && (
          <div className={styles.actions}>
            <button className={styles.cancelButton} onClick={handleCancel}>
              Cancel
            </button>
            <button className={styles.importButton} onClick={handleImport}>
              Import Presentation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
