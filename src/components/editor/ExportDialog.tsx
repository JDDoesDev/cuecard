import { useState, useCallback } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import { downloadMarkdown } from '@/lib/export/exportToMarkdown';
import { downloadHTML } from '@/lib/export/exportToHTML';
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

  // Handle PDF export via print dialog
  const handleExportPDF = useCallback(() => {
    onClose();
    // Small delay to let dialog close before print dialog opens
    setTimeout(() => window.print(), 100);
  }, [onClose]);

  // Handle Markdown export
  const handleExportMarkdown = useCallback(() => {
    if (!presentation) return;

    setIsExporting(true);
    setExportingFormat('markdown');

    try {
      downloadMarkdown(presentation);

      // Brief delay for UX, then close dialog
      setTimeout(() => {
        setIsExporting(false);
        setExportingFormat(null);
        onClose();
      }, 300);
    } catch (error) {
      console.error('Markdown export failed:', error);
      setIsExporting(false);
      setExportingFormat(null);
    }
  }, [presentation, onClose]);

  // Handle HTML export
  const handleExportHTML = useCallback(() => {
    if (!presentation) return;

    setIsExporting(true);
    setExportingFormat('html');

    try {
      downloadHTML(presentation, theme);

      // Brief delay for UX, then close dialog
      setTimeout(() => {
        setIsExporting(false);
        setExportingFormat(null);
        onClose();
      }, 500);
    } catch (error) {
      console.error('HTML export failed:', error);
      setIsExporting(false);
      setExportingFormat(null);
    }
  }, [presentation, theme, onClose]);

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
              <p>Exporting as {exportingFormat}...</p>
            </div>
          ) : (
            <div className={styles.formats}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
