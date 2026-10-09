import { useState, useEffect, useRef } from 'react';
import { usePresentationStore } from '@/hooks/usePresentationStore';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  slideIndex: number;
  className?: string;
}

/**
 * Speaker notes editor component.
 * Provides a textarea for editing speaker notes with debounced updates to the store.
 */
export function NotesPanel({ slideIndex, className = '' }: NotesPanelProps) {
  const store = usePresentationStore();
  const slide = store.presentation?.slides[slideIndex];

  // Local state for immediate UI updates
  const [localNotes, setLocalNotes] = useState(slide?.notes ?? '');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when slide changes
  useEffect(() => {
    setLocalNotes(slide?.notes ?? '');
  }, [slide?.notes, slideIndex]);

  // Handle notes change with debouncing
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setLocalNotes(newNotes);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to update store after 300ms
    debounceTimerRef.current = setTimeout(() => {
      if (slide) {
        const updatedSlide = { ...slide, notes: newNotes };
        store.updateSlide(slideIndex, updatedSlide);
      }
    }, 300);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
        placeholder="Add speaker notes..."
        className={styles.textarea}
      />
    </div>
  );
}
