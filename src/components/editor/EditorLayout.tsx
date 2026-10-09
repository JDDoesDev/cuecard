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
 */
export function EditorLayout({ aspectRatio }: EditorLayoutProps) {
  const { currentSlideIndex } = usePresentationStore();

  return (
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
  );
}
