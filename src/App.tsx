import { useEffect, useRef, useState } from 'react';
import { presentationStore } from './store/presentationStore';
import { ThemeProvider, useTheme } from './components/ThemeProvider/ThemeProvider';
import { Presentation } from './components/Presentation/Presentation';
import { EditorLayout } from './components/editor/EditorLayout';
import { EditorToolbar } from './components/editor/EditorToolbar';
import { PrintView } from './components/PrintView/PrintView';
import { PresenterView } from './components/PresenterView/PresenterView';
import { AudienceView } from './components/AudienceView/AudienceView';
import { UpdatePrompt } from './components/UpdatePrompt';
import { usePresentationStore } from './hooks/usePresentationStore';
import { usePresentationMode } from './hooks/usePresentationMode';
import { createPresentation } from './types/presentation';
import { AUTOSAVE_KEY } from './lib/storage/autosave';
import { computeImageRestoreUpdates, releaseUnreferencedImages } from './lib/media/imageRestore';
import { ThemeOptions } from './components/theme/ThemeOptions';
import styles from './App.module.css';

// ============================================================================
// App Content (inside ThemeProvider)
// ============================================================================

function AppContent() {
  const { theme, setTheme } = useTheme();
  const { setPresentation, presentation, setAspectRatio } = usePresentationStore();
  // Aspect ratio is part of the presentation so it persists and reaches
  // presenter/audience windows.
  const aspectRatio = presentation?.aspectRatio ?? '16:9';
  const [mode, setMode] = useState<'edit' | 'present'>('edit');
  const [showRecoveryMessage, setShowRecoveryMessage] = useState(false);
  const { mode: presentationMode, isPresenter, isAudience } = usePresentationMode();
  const hasInitialized = useRef(false);

  // Load sample presentation on mount (or detect crash recovery)
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Presenter/audience windows are read-only followers of the editor: they
    // must not create a sample presentation or take part in crash detection
    // (the editor window's session flag would look like a crash to them).
    if (presentationMode !== 'edit') return;

    const SESSION_KEY = 'cuecard-session-active';
    const hadSavedData = localStorage.getItem(AUTOSAVE_KEY) !== null;
    const previousSessionCrashed = localStorage.getItem(SESSION_KEY) === '1';

    // Mark this session as active; cleared on clean exit
    localStorage.setItem(SESSION_KEY, '1');
    const handleUnload = () => localStorage.removeItem(SESSION_KEY);
    window.addEventListener('beforeunload', handleUnload);

    if (hadSavedData && presentation && previousSessionCrashed) {
      // Previous session didn't exit cleanly — genuine recovery
      setShowRecoveryMessage(true);
      setTimeout(() => setShowRecoveryMessage(false), 3000);
      return;
    }

    if (presentation) return; // Already have data from normal auto-save restore

    // No saved presentation - load sample
    const samplePresentation = createPresentation();
    samplePresentation.title = 'Sample Presentation';
    samplePresentation.slides = [
      // Slide 1: Title
      {
        id: crypto.randomUUID(),
        layout: 'title',
        transition: 'fade',
        elements: [
          { id: crypto.randomUUID(), type: 'heading', position: { x: 15, y: 30, width: 70, height: 20 }, content: 'Welcome', level: 1 },
          { id: crypto.randomUUID(), type: 'text', position: { x: 20, y: 55, width: 60, height: 10 }, content: 'Markdown-First Presentations' },
        ],
      },
      // Slide 2: Title-List
      {
        id: crypto.randomUUID(),
        layout: 'title-list',
        transition: 'slide',
        elements: [
          { id: crypto.randomUUID(), type: 'heading', position: { x: 12, y: 10, width: 76, height: 15 }, content: 'Features', level: 1 },
          { id: crypto.randomUUID(), type: 'list', position: { x: 14, y: 30, width: 72, height: 58 }, items: ['7 Layout Types', 'Theme Support', 'Keyboard Navigation', 'Responsive Scaling'], ordered: false },
        ],
      },
      // Slide 3: Two-Column
      {
        id: crypto.randomUUID(),
        layout: 'two-column',
        transition: 'fade',
        elements: [
          { id: crypto.randomUUID(), type: 'heading', position: { x: 12, y: 10, width: 76, height: 12 }, content: 'Comparison', level: 1 },
          { id: crypto.randomUUID(), type: 'text', position: { x: 12, y: 26, width: 36, height: 62 }, content: 'Before\n- Manual slides\n- No themes\n- Limited layouts' },
          { id: crypto.randomUUID(), type: 'text', position: { x: 52, y: 26, width: 36, height: 62 }, content: 'After\n- Markdown import\n- Rich themes\n- 7 layout types' },
        ],
      },
      // Slide 4: Code Block
      {
        id: crypto.randomUUID(),
        layout: 'code-block',
        transition: 'none',
        elements: [
          { id: crypto.randomUUID(), type: 'heading', position: { x: 12, y: 8, width: 76, height: 10 }, content: 'Example Code', level: 2 },
          { id: crypto.randomUUID(), type: 'code', position: { x: 12, y: 22, width: 76, height: 60 }, code: `interface Presentation {
  id: string;
  title: string;
  theme: string;
  slides: Slide[];
}

function createPresentation(): Presentation {
  return { id: crypto.randomUUID(), title: '', theme: 'default', slides: [] };
}`, language: 'typescript' },
          { id: crypto.randomUUID(), type: 'text', position: { x: 12, y: 86, width: 76, height: 8 }, content: 'Type-safe presentation data model' },
        ],
      },
      // Slide 5: Full-Bleed Media
      {
        id: crypto.randomUUID(),
        layout: 'full-bleed-media',
        transition: 'zoom',
        elements: [
          { id: crypto.randomUUID(), type: 'image', position: { x: 0, y: 0, width: 100, height: 100 }, url: 'https://picsum.photos/1920/1080', objectFit: 'cover' },
          { id: crypto.randomUUID(), type: 'text', position: { x: 12, y: 85, width: 76, height: 10 }, content: 'Full-screen media with optional caption' },
        ],
      },
      // Slide 6: Media-Anywhere
      {
        id: crypto.randomUUID(),
        layout: 'media-anywhere',
        transition: 'fade',
        elements: [
          { id: crypto.randomUUID(), type: 'text', position: { x: 12, y: 12, width: 38, height: 76 }, content: 'Position media anywhere on the slide with text content flowing around it.' },
          { id: crypto.randomUUID(), type: 'image', position: { x: 54, y: 12, width: 34, height: 56 }, url: 'https://picsum.photos/800/600' },
        ],
      },
      // Slide 7: Freestyle
      {
        id: crypto.randomUUID(),
        layout: 'freestyle',
        transition: 'slide',
        elements: [
          { id: crypto.randomUUID(), type: 'text', position: { x: 10, y: 10, width: 40, height: 15 }, content: 'Freestyle Layout' },
          { id: crypto.randomUUID(), type: 'text', position: { x: 15, y: 30, width: 35, height: 10 }, content: 'Position text elements anywhere' },
          { id: crypto.randomUUID(), type: 'text', position: { x: 50, y: 60, width: 40, height: 15 }, content: 'Total creative freedom' },
        ],
      },
    ];
    setPresentation(samplePresentation);
  }, [setPresentation, presentation, presentationMode]);

  // Regenerate blob URLs for cached images. Blob URLs die with the document
  // that created them, so this runs whenever the presentation changes (new
  // file opened, markdown imported, rehydrated, undo/redo) and only touches
  // image elements whose cachedUrl isn't this document's live URL for their
  // cacheKey. Uses restoreCachedUrls so it doesn't create undo history.
  const restoreState = useRef({ running: false, rerun: false });
  useEffect(() => {
    if (!presentation) return;

    const run = async () => {
      const guard = restoreState.current;
      if (guard.running) {
        guard.rerun = true;
        return;
      }
      guard.running = true;
      try {
        do {
          guard.rerun = false;
          const current = presentationStore.getState().presentation;
          if (!current) break;
          const updates = await computeImageRestoreUpdates(current);
          if (updates.length === 0) continue;
          const state = presentationStore.getState();
          if (state.presentation?.id !== current.id) {
            guard.rerun = true;
            continue;
          }
          state.restoreCachedUrls(updates);
        } while (guard.rerun);
        // Release against the latest state, after the run (not a stale snapshot)
        releaseUnreferencedImages(presentationStore.getState().presentation);
      } catch (e) {
        console.error('Failed to restore cached images:', e);
      } finally {
        guard.running = false;
      }
    };

    run();
  }, [presentation]);

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'edit' ? 'present' : 'edit'));
  };

  // Mode-based routing: presenter and audience views take over the entire UI
  if (isPresenter) {
    return (
      <div className={styles.app}>
        <UpdatePrompt />
        <PresenterView aspectRatio={aspectRatio} />
        <PrintView aspectRatio={aspectRatio} />
      </div>
    );
  }

  if (isAudience) {
    return (
      <div className={styles.app}>
        <AudienceView aspectRatio={aspectRatio} />
        <PrintView aspectRatio={aspectRatio} />
      </div>
    );
  }

  // Default edit mode (no URL param)
  return (
    <div className={styles.app}>
      <UpdatePrompt />
      {showRecoveryMessage && (
        <div className={styles.recoveryBanner}>Recovered from auto-save</div>
      )}
      <div data-screen-only className={styles.screenContent}>
        {mode === 'edit' ? (
          <>
            <EditorToolbar
              onToggleMode={handleToggleMode}
              isEditMode={true}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
            />
            <div className={styles.editorArea}>
              <EditorLayout aspectRatio={aspectRatio} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.toolbarSection}>
                <span className={styles.toolbarLabel}>Theme:</span>
                <select
                  className={styles.toolbarSelect}
                  value={theme}
                  onChange={(e) => {
                    const newTheme = e.target.value;
                    setTheme(newTheme);
                    // Release focus so arrow keys go back to slide navigation
                    e.currentTarget.blur();
                  }}
                >
                  <ThemeOptions />
                </select>
              </div>

              <div className={styles.toolbarSection}>
                <span className={styles.toolbarLabel}>Aspect Ratio:</span>
                <button
                  className={styles.toolbarButton}
                  data-active={aspectRatio === '16:9'}
                  onClick={() => setAspectRatio('16:9')}
                >
                  16:9
                </button>
                <button
                  className={styles.toolbarButton}
                  data-active={aspectRatio === '4:3'}
                  onClick={() => setAspectRatio('4:3')}
                >
                  4:3
                </button>
                <button
                  className={styles.toolbarButton}
                  data-active={aspectRatio === '16:10'}
                  onClick={() => setAspectRatio('16:10')}
                >
                  16:10
                </button>
              </div>

              <div className={styles.toolbarSection}>
                <button className={styles.toolbarButton} onClick={handleToggleMode}>
                  ✎ Edit Mode
                </button>
              </div>
            </div>

            <div className={styles.presentationArea}>
              <Presentation aspectRatio={aspectRatio} />
            </div>
          </>
        )}
      </div>

      {/* PrintView: hidden on screen, visible in @media print for PDF export */}
      <PrintView aspectRatio={aspectRatio} />
    </div>
  );
}

// ============================================================================
// App Root
// ============================================================================

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
