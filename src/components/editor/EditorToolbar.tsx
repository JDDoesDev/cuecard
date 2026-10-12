import { useState, useEffect, useCallback } from 'react';
import { usePresentationUndo } from '@/hooks/usePresentationUndo';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { presentationStore } from '@/store/presentationStore';
import { useTheme } from '@/components/ThemeProvider/ThemeProvider';
import { openDualScreen } from '@/hooks/usePresentationMode';
import { ThemeOptions } from '@/components/theme/ThemeOptions';
import { saveToFile, downloadCopy, openFromFile, getFileName, setFileHandle, formatValidationError } from '@/lib/storage/fileStorage';
import { createPresentation } from '@/types/presentation';
import { LAYOUTS, type LayoutPreset } from '@/types/slide';
import { getAvailableFonts } from '@/lib/fonts/availableFonts';
import { MarkdownImportDialog } from './MarkdownImportDialog';
import { ExportDialog } from './ExportDialog';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import { ThemeImportExport } from '@/components/theme/ThemeImportExport';
import { FontBrowser } from '@/components/fonts/FontBrowser';
import styles from './EditorToolbar.module.css';

interface EditorToolbarProps {
  onToggleMode: () => void;
  isEditMode: boolean;
  aspectRatio: '16:9' | '4:3' | '16:10';
  onAspectRatioChange: (ratio: '16:9' | '4:3' | '16:10') => void;
  className?: string;
}

/**
 * Editor toolbar with undo/redo, import, theme/aspect ratio controls, and mode toggle.
 */
export function EditorToolbar({
  onToggleMode,
  isEditMode,
  aspectRatio,
  onAspectRatioChange,
  className = '',
}: EditorToolbarProps) {
  const { undo, redo, canUndo, canRedo } = usePresentationUndo();
  const { theme, setTheme } = useTheme();
  const store = usePresentationStore();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(getFileName());
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Get current slide for reset to layout functionality
  const currentSlide = store.presentation?.slides[store.currentSlideIndex];

  // Keyboard shortcuts for undo/redo
  // These must work even inside contenteditable since Tiptap's built-in
  // history is disabled — zundo handles all undo/redo at the store level.
  // Only skip for native input/textarea elements which have their own undo.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isNativeInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (isNativeInput) return;

      const key = e.key.toLowerCase();

      // History is read fresh: the in-place text editor flushes its pending
      // typing into the store on this same keydown (before it reaches here),
      // so the canUndo/canRedo captured at render time may be stale.
      const history = presentationStore.temporal.getState();

      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (history.pastStates.length > 0) undo();
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y for redo
      if (
        ((e.ctrlKey || e.metaKey) && key === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && key === 'y')
      ) {
        e.preventDefault();
        if (history.futureStates.length > 0) redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  const handleSaveToFile = useCallback(async (forceNew = false) => {
    if (!store.presentation) return;
    try {
      const result = await saveToFile(store.presentation, forceNew);
      if (result.success && result.fileName) {
        setCurrentFileName(result.fileName);
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(null), 2000);
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [store.presentation]);

  const handleDownloadCopy = useCallback(async () => {
    if (!store.presentation) return;
    try {
      await downloadCopy(store.presentation);
    } catch (e) {
      console.error('Download failed:', e);
      setSaveStatus('Download failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [store.presentation]);

  const handleOpenFromFile = useCallback(async () => {
    try {
      const result = await openFromFile();
      if (result.success && result.presentation) {
        store.setPresentation(result.presentation);
        if (result.fileName) setCurrentFileName(result.fileName);
      }
    } catch (e) {
      console.error('Open failed:', e);
      alert(`Could not open this file.\n\n${formatValidationError(e)}`);
    }
  }, [store]);

  // Ctrl+S to save
  useEffect(() => {
    const handleSaveShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveToFile(false);
      }
    };
    document.addEventListener('keydown', handleSaveShortcut);
    return () => document.removeEventListener('keydown', handleSaveShortcut);
  }, [handleSaveToFile]);

  const handleOpenImportDialog = useCallback(() => {
    setIsImportDialogOpen(true);
  }, []);

  const handleCloseImportDialog = useCallback(() => {
    setIsImportDialogOpen(false);
  }, []);

  const handleOpenExportDialog = useCallback(() => {
    setIsExportDialogOpen(true);
  }, []);

  const handleCloseExportDialog = useCallback(() => {
    setIsExportDialogOpen(false);
  }, []);

  const handleChangeLayout = useCallback((newLayout: LayoutPreset) => {
    if (!currentSlide) return;
    store.resetToPreset(store.currentSlideIndex, newLayout);
  }, [currentSlide, store]);

  const handleDualScreen = useCallback(() => {
    const result = openDualScreen();
    if (!result.success && result.error === 'popup-blocked') {
      alert('Popup blocked. Please allow popups for this site to use dual-screen presenter mode.');
    }
  }, []);

  return (
    <>
      <div className={`${styles.toolbar} ${className}`}>
        {/* Undo/Redo */}
        <div className={styles.section}>
          <button
            className={styles.button}
            onClick={() => undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ⟲
          </button>
          <button
            className={styles.button}
            onClick={() => redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            ⟳
          </button>
        </div>

        {/* File operations */}
        <div className={styles.section}>
          <button
            className={styles.button}
            onClick={() => {
              if (window.confirm('Start a new presentation? Any unsaved changes will be lost.')) {
                setFileHandle(null);
                store.setPresentation(createPresentation());
                setCurrentFileName(null);
              }
            }}
            title="New presentation"
          >
            New
          </button>
          <button className={styles.button} onClick={handleOpenFromFile} title="Open (JSON)">
            Open
          </button>
          <button className={styles.button} onClick={() => handleSaveToFile(false)} title="Save (Ctrl+S)">
            Save
          </button>
          <button className={styles.button} onClick={() => handleSaveToFile(true)} title="Save as new file">
            Save As
          </button>
          <button
            className={styles.button}
            onClick={handleDownloadCopy}
            title="Download a copy (JSON) through the browser's downloads, for folders Save can't reach"
          >
            Download
          </button>
          {(currentFileName || saveStatus) && (
            <span className={styles.fileStatus}>
              {saveStatus || currentFileName}
            </span>
          )}
        </div>

        {/* Import/Export */}
        <div className={styles.section}>
          <button className={styles.button} onClick={handleOpenImportDialog} title="Import Markdown">
            Import
          </button>
          <button className={styles.button} onClick={handleOpenExportDialog} title="Export Presentation">
            Export
          </button>
        </div>

        {/* Layout (edit mode only) */}
        {isEditMode && currentSlide && (
          <div className={styles.section}>
            <select
              className={styles.layoutSelect}
              value={currentSlide.layout}
              onChange={(e) => handleChangeLayout(e.target.value as LayoutPreset)}
              title="Slide layout"
            >
              {LAYOUTS.map((layout) => (
                <option key={layout} value={layout}>{layout}</option>
              ))}
            </select>
            <button
              className={styles.button}
              onClick={() => handleChangeLayout(currentSlide.layout)}
              title="Reset current slide to layout defaults"
            >
              Reset
            </button>
          </div>
        )}

        {/* Presentation fonts (edit mode only) */}
        {isEditMode && store.presentation && (
          <div className={styles.section}>
            <span className={styles.label}>H:</span>
            <select
              className={styles.layoutSelect}
              value={store.presentation.fontHeading || ''}
              onChange={(e) => {
                store.setFonts(e.target.value || undefined, store.presentation?.fontBody);
              }}
              title="Heading font"
            >
              <option value="">Default</option>
              {getAvailableFonts().map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
            <span className={styles.label}>B:</span>
            <select
              className={styles.layoutSelect}
              value={store.presentation.fontBody || ''}
              onChange={(e) => {
                store.setFonts(store.presentation?.fontHeading, e.target.value || undefined);
              }}
              title="Body font"
            >
              <option value="">Default</option>
              {getAvailableFonts().map((font) => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </div>
        )}

        {/* Theme */}
        <div className={styles.section}>
          <select
            className={styles.themeSelect}
            value={theme}
            onChange={(e) => {
              const newTheme = e.target.value;
              setTheme(newTheme);
            }}
            title="Editor theme"
          >
            <ThemeOptions />
          </select>
          <button
            className={styles.button}
            onClick={() => { setShowThemePanel(!showThemePanel); setShowFontPanel(false); }}
            data-active={showThemePanel}
            title="Theme Customizer"
          >
            Customize
          </button>
          <button
            className={styles.button}
            onClick={() => { setShowFontPanel(!showFontPanel); setShowThemePanel(false); }}
            data-active={showFontPanel}
            title="Browse Google Fonts"
          >
            Fonts
          </button>
        </div>

        {/* Aspect ratio */}
        <div className={styles.section}>
          <button className={styles.button} data-active={aspectRatio === '16:9'} onClick={() => onAspectRatioChange('16:9')}>16:9</button>
          <button className={styles.button} data-active={aspectRatio === '4:3'} onClick={() => onAspectRatioChange('4:3')}>4:3</button>
          <button className={styles.button} data-active={aspectRatio === '16:10'} onClick={() => onAspectRatioChange('16:10')}>16:10</button>
        </div>

        {/* Present */}
        <div className={styles.section}>
          <button
            className={`${styles.button} ${styles.modeToggle}`}
            onClick={onToggleMode}
          >
            {isEditMode ? '▶ Present' : '✎ Edit'}
          </button>
          {isEditMode && (
            <button
              className={`${styles.button} ${styles.modeToggle}`}
              onClick={handleDualScreen}
              title="Open audience view in new window"
            >
              ▶ Dual
            </button>
          )}
        </div>
      </div>

      {/* Markdown Import Dialog */}
      <MarkdownImportDialog
        isOpen={isImportDialogOpen}
        onClose={handleCloseImportDialog}
      />

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={handleCloseExportDialog}
      />

      {/* Theme Panel */}
      {showThemePanel && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Theme Settings</span>
            <button className={styles.panelClose} onClick={() => setShowThemePanel(false)}>Close</button>
          </div>
          <div className={styles.panelContent}>
            <ThemeSelector />
            <ThemeImportExport currentTheme={theme} onThemeImported={() => {}} />
          </div>
        </div>
      )}

      {/* Font Panel */}
      {showFontPanel && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Google Fonts</span>
            <button className={styles.panelClose} onClick={() => setShowFontPanel(false)}>Close</button>
          </div>
          <div className={styles.panelContent}>
            <FontBrowser />
          </div>
        </div>
      )}
    </>
  );
}
