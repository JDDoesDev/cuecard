import { useState, useRef, useCallback } from 'react';
import { parsePresentation } from '@/lib/parser/parsePresentation';
import { presentationStore } from '@/store/presentationStore';
import { Slide } from '@/components/Slide/Slide';
import type { Presentation } from '@/types/presentation';
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

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);

    try {
      // Read file contents
      const markdownText = await file.text();

      // Parse markdown using Phase 1 parser
      const presentation = await parsePresentation(markdownText);

      // Check if presentation has slides
      if (!presentation.slides || presentation.slides.length === 0) {
        setError('No slides found in the markdown file. Make sure slides are separated by --- markers.');
        setParsedPresentation(null);
      } else {
        setParsedPresentation(presentation);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to parse markdown: ${err.message}`
          : 'Failed to parse markdown file. Please check the file format.'
      );
      setParsedPresentation(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Handle import confirmation
  const handleImport = useCallback(() => {
    if (parsedPresentation) {
      const { setPresentation } = presentationStore.getState();
      setPresentation(parsedPresentation);

      // Reset state and close
      setParsedPresentation(null);
      setError(null);
      onClose();
    }
  }, [parsedPresentation, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setParsedPresentation(null);
    setError(null);
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
          {/* File upload area */}
          {!parsedPresentation && !error && !isLoading && (
            <div className={styles.uploadArea}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown"
                onChange={handleFileInputChange}
                className={styles.fileInput}
                aria-label="Select markdown file"
              />
              <button
                className={styles.uploadButton}
                onClick={handleClickFileInput}
              >
                Select Markdown File
              </button>
              <p className={styles.uploadHint}>
                Choose a .md or .markdown file with slides separated by ---
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
          {parsedPresentation && !error && (
            <>
              <div className={styles.previewInfo}>
                <p className={styles.slideCount}>
                  {parsedPresentation.slides.length} slide
                  {parsedPresentation.slides.length !== 1 ? 's' : ''} detected
                </p>
                <p className={styles.presentationTitle}>
                  Title: {parsedPresentation.title}
                </p>
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
