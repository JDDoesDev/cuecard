import { useState, useCallback } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import { downloadMarkdown } from '@/lib/export/exportToMarkdown';
import { embedImagesForExport } from '@/lib/media/imageRestore';
import { downloadHTML, type ExportProgress } from '@/lib/export/exportToHTML';
import styles from './ExportDialog.module.css';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ExportDialog provides export options for PDF, Markdown, and HTML formats.
 *
 * PDF: Opens print dialog via ?print=true URL parameter
 * Markdown: Downloads .md file with position metadata
 * HTML: Downloads self-contained HTML file that works offline
 */
export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { presentation } = usePresentationStore();
  const { theme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [embedRemoteImages, setEmbedRemoteImages] = useState(false);
  const [embedMarkdownImages, setEmbedMarkdownImages] = useState(true);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle PDF export via print dialog
  const handleExportPDF = useCallback(() => {
    onClose();
    // Small delay to let dialog close before print dialog opens
    setTimeout(() => window.print(), 100);
  }, [onClose]);

  // Handle Markdown export (optionally inlining uploaded images as data URIs)
  const handleExportMarkdown = useCallback(async () => {
    if (!presentation) return;

    setIsExporting(true);
    setExportingFormat('markdown');
    setError(null);

    try {
      const target = embedMarkdownImages ? await embedImagesForExport(presentation) : presentation;
      downloadMarkdown(target);
      setIsExporting(false);
      setExportingFormat(null);
      onClose();
    } catch (err) {
      console.error('Markdown export failed:', err);
      setError(`Markdown export failed: ${err instanceof Error ? err.message : String(err)}`);
      setIsExporting(false);
      setExportingFormat(null);
    }
  }, [presentation, embedMarkdownImages, onClose]);

  // Handle HTML export (async: embeds images and fonts)
  const handleExportHTML = useCallback(async () => {
    if (!presentation) return;

    setIsExporting(true);
    setExportingFormat('html');
    setError(null);
    setProgress(null);

    try {
      await downloadHTML(presentation, {
        theme,
        aspectRatio: presentation.aspectRatio,
        embedRemoteImages,
        onProgress: setProgress,
      });
      setIsExporting(false);
      setExportingFormat(null);
      setProgress(null);
      onClose();
    } catch (err) {
      console.error('HTML export failed:', err);
      setError(`HTML export failed: ${err instanceof Error ? err.message : String(err)}`);
      setIsExporting(false);
      setExportingFormat(null);
      setProgress(null);
    }
  }, [presentation, theme, embedRemoteImages, onClose]);

  const progressLabel = (() => {
    if (!progress) return null;
    switch (progress.stage) {
      case 'images':
        return progress.total ? `Embedding media (${progress.done}/${progress.total})` : 'Embedding media';
      case 'fonts':
        return 'Embedding fonts and styles';
      case 'slides':
        return `Rendering slides (${progress.done}/${progress.total})`;
      default:
        return 'Finishing';
    }
  })();

  // Handle dialog close
  const handleCancel = useCallback(() => {
    if (!isExporting) {
      onClose();
    }
  }, [isExporting, onClose]);

  // Handle escape key
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
          <h2 id="dialog-title">Export Presentation</h2>
          <button
            className={styles.closeButton}
            onClick={handleCancel}
            aria-label="Close dialog"
            disabled={isExporting}
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {isExporting ? (
            <div className={styles.exporting}>
              <p role="status" aria-live="polite">
                Exporting as {exportingFormat}...
                {progressLabel && <><br />{progressLabel}</>}
              </p>
            </div>
          ) : (
            <div className={styles.formats}>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              {/* PDF Export Card */}
              <button
                className={styles.formatCard}
                onClick={handleExportPDF}
                aria-label="Export as PDF"
              >
                <div className={styles.formatIcon}>📄</div>
                <div className={styles.formatInfo}>
                  <h3 className={styles.formatTitle}>Export PDF</h3>
                  <p className={styles.formatDescription}>
                    Print-optimized layout, one slide per page
                  </p>
                </div>
              </button>

              {/* Markdown Export Card */}
              <button
                className={styles.formatCard}
                onClick={handleExportMarkdown}
                aria-label="Export as Markdown"
              >
                <div className={styles.formatIcon}>📝</div>
                <div className={styles.formatInfo}>
                  <h3 className={styles.formatTitle}>Export Markdown</h3>
                  <p className={styles.formatDescription}>
                    Editable markdown with position metadata
                  </p>
                </div>
              </button>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={embedMarkdownImages}
                  onChange={(e) => setEmbedMarkdownImages(e.target.checked)}
                />
                Embed images in Markdown export (uploaded images inlined as data URIs)
              </label>

              {/* HTML Export Card */}
              <button
                className={styles.formatCard}
                onClick={handleExportHTML}
                aria-label="Export as HTML"
              >
                <div className={styles.formatIcon}>🌐</div>
                <div className={styles.formatInfo}>
                  <h3 className={styles.formatTitle}>Export HTML</h3>
                  <p className={styles.formatDescription}>
                    Self-contained file, works offline
                  </p>
                </div>
              </button>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={embedRemoteImages}
                  onChange={(e) => setEmbedRemoteImages(e.target.checked)}
                />
                Embed remote images in HTML export (uploaded images are always embedded; remote servers must allow CORS)
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
