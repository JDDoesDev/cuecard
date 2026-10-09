import { useEffect, useRef, useState } from 'react';
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
import { getCachedImage } from './lib/media/imageCaching';
import { BUILT_IN_THEMES } from './lib/theme/builtInThemes';
import { setTheme as setThemeManager } from './lib/theme/themeManager';
import styles from './App.module.css';

// ============================================================================
// App Content (inside ThemeProvider)
// ============================================================================

function AppContent() {
  const { theme, setTheme } = useTheme();
  const { setPresentation, presentation } = usePresentationStore();
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '16:10'>('16:9');
  const [mode, setMode] = useState<'edit' | 'present'>('edit');
  const [showRecoveryMessage, setShowRecoveryMessage] = useState(false);
  const { mode: presentationMode, isPresenter, isAudience } = usePresentationMode();
  const hasInitialized = useRef(false);

  // Load sample presentation on mount (or detect crash recovery)
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const SESSION_KEY = 'fldc-session-active';
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
    samplePresentation.title = 'FLDC 2026 - Sample Presentation';
    samplePresentation.slides = [
      // Slide 1: Title
      {
        id: crypto.randomUUID(),
        layout: 'title',
        transition: 'fade',
        elements: [
          { id: crypto.randomUUID(), type: 'heading', position: { x: 15, y: 30, width: 70, height: 20 }, content: 'Welcome to FLDC 2026', level: 1 },
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
  }, [setPresentation, presentation]);

  // Restore blob URLs for cached images after rehydration.
  // Blob URLs from previous sessions are dead — regenerate from IndexedDB.
  const hasRestoredImages = useRef(false);
  const { updateElement } = usePresentationStore();
  useEffect(() => {
    if (!presentation || hasRestoredImages.current) return;
    hasRestoredImages.current = true;

    const restoreImages = async () => {
      for (let si = 0; si < presentation.slides.length; si++) {
        for (const el of presentation.slides[si].elements) {
          if (el.type !== 'image' || !el.cacheKey) continue;
          const freshBlobUrl = await getCachedImage(el.cacheKey);
          if (freshBlobUrl) {
            updateElement(si, el.id, { cachedUrl: freshBlobUrl } as any);
          }
        }
      }
    };

    restoreImages();
  }, [presentation]);

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'edit' ? 'present' : 'edit'));
  };

  // Mode-based routing: presenter and audience views take over the entire UI
  if (isPresenter) {
    return (
      <div className={styles.app}>
        <UpdatePrompt />
        {showRecoveryMessage && (
          <div className={styles.recoveryBanner}>Recovered from auto-save</div>
        )}
        <PresenterView aspectRatio={aspectRatio} />
        <PrintView />
      </div>
    );
  }

  if (isAudience) {
    return (
      <div className={styles.app}>
        <UpdatePrompt />
        {showRecoveryMessage && (
          <div className={styles.recoveryBanner}>Recovered from auto-save</div>
        )}
        <AudienceView aspectRatio={aspectRatio} />
        <PrintView />
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
                    const newTheme = e.target.value as any;
                    setThemeManager(newTheme);
                    setTheme(newTheme);
                  }}
                >
                  {BUILT_IN_THEMES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
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
      <PrintView />
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
