import { useState, useEffect, useRef, useCallback } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import { coalesceHistory, resetHistoryCoalescing } from '@/store/presentationStore';
import { flushPendingSave } from '@/lib/storage/autosave';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  slideIndex: number;
  className?: string;
}

/**
 * Speaker notes editor component.
 * Provides a textarea for editing speaker notes with debounced updates to the store.
 * Only the notes field of the slide is written, and pending edits are flushed
 * (not dropped) on slide change and unmount.
 */
export function NotesPanel({ slideIndex, className = '' }: NotesPanelProps) {
  const store = usePresentationStore();
  const slide = store.presentation?.slides[slideIndex];
  const slideId = slide?.id;

  // Local state for immediate UI updates
  const [localNotes, setLocalNotes] = useState(slide?.notes ?? '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ slideId: string; notes: string } | null>(null);
  const setSlideNotes = store.setSlideNotes;

  const flush = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    coalesceHistory(`notes:${pending.slideId}`, () => setSlideNotes(pending.slideId, pending.notes), 2000);
  }, [setSlideNotes]);

  // Flush pending notes for the previous slide when switching slides / unmounting
  useEffect(() => {
    return () => flush();
  }, [slideId, flush]);

  // Flush when the page is hidden or closed
  useEffect(() => {
    const flushAndSave = () => {
      flush();
      // Autosave's own hide handler may already have run: write now
      flushPendingSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAndSave();
    };
    window.addEventListener('pagehide', flushAndSave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushAndSave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  // Update local state when slide changes
  useEffect(() => {
    if (pendingRef.current) return; // don't clobber what the user is typing
    setLocalNotes(slide?.notes ?? '');
  }, [slide?.notes, slideId]);

  // Handle notes change with debouncing
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setLocalNotes(newNotes);
    if (!slideId) return;

    pendingRef.current = { slideId, notes: newNotes };
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(flush, 300);
  };

  if (!slide) {
    return (
      <div className={`${styles.notesPanel} ${className}`}>
        <div className={styles.emptyState}>No slide selected</div>
      </div>
    );
  }

  return (
    <div className={`${styles.notesPanel} ${className}`}>
      <label className={styles.label} htmlFor="speaker-notes">
        Speaker Notes
      </label>
      <textarea
        id="speaker-notes"
        value={localNotes}
        onChange={handleNotesChange}
        onBlur={() => {
          flush();
          resetHistoryCoalescing();
        }}
        placeholder="Add speaker notes..."
        className={styles.textarea}
      />
    </div>
  );
}
