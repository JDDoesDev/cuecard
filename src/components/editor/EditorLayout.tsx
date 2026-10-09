import { usePresentationStore } from '@/hooks/usePresentationStore';
import { SlidePanel } from './SlidePanel';
import { SlideEditor } from './SlideEditor';
import { NotesPanel } from './NotesPanel';
import styles from './EditorLayout.module.css';

interface EditorLayoutProps {
  aspectRatio: '16:9' | '4:3' | '16:10';
}

/**
 * Three-panel editor layout.
 * - Left: SlidePanel (sortable thumbnails)
 * - Center: SlideEditor (Tiptap editor for current slide)
 * - Bottom: NotesPanel (speaker notes)
 * - Top banner: autosave failures / multi-tab notices
 */
export function EditorLayout({ aspectRatio }: EditorLayoutProps) {
  const {
    currentSlideIndex,
    saveError,
    storageNotice,
    storageConflict,
    setSaveError,
    setStorageNotice,
    resolveStorageConflict,
  } = usePresentationStore();

  return (
    <div className={styles.editorRoot}>
      {saveError && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <span>{saveError}</span>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={() => setSaveError(null)}
            aria-label="Dismiss autosave warning"
          >
            Dismiss
          </button>
        </div>
      )}
      {storageConflict && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <span>
            This presentation was saved in another editor tab while you had unsaved changes here.
            Autosave is paused until you choose which version to keep.
          </span>
          <span className={styles.bannerActions}>
            <button
              type="button"
              className={styles.bannerDismiss}
              onClick={() => resolveStorageConflict('mine')}
            >
              Keep mine
            </button>
            <button
              type="button"
              className={styles.bannerDismiss}
              onClick={() => resolveStorageConflict('theirs')}
            >
              Load theirs
            </button>
          </span>
        </div>
      )}
      {storageNotice && !storageConflict && (
        <div className={`${styles.banner} ${styles.bannerNotice}`} role="status">
          <span>{storageNotice}</span>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={() => setStorageNotice(null)}
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className={styles.editorLayout}>
        {/* Left: Slide Panel */}
        <aside className={styles.slidePanel}>
          <SlidePanel />
        </aside>

        {/* Center + Bottom: Editor + Notes */}
        <div className={styles.mainArea}>
          {/* Center: Slide Editor */}
          <main className={styles.editorArea}>
            <SlideEditor slideIndex={currentSlideIndex} aspectRatio={aspectRatio} />
          </main>

          {/* Bottom: Notes Panel */}
          <section className={styles.notesArea}>
            <NotesPanel slideIndex={currentSlideIndex} />
          </section>
        </div>
      </div>
    </div>
  );
}
