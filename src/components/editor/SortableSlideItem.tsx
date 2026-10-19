import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slide as SlideType, LAYOUTS, type LayoutPreset } from '@/types/slide';
import { Slide } from '@/components/Slide/Slide';
import styles from './SortableSlideItem.module.css';

interface SortableSlideItemProps {
  slide: SlideType;
  index: number;
  isActive: boolean;
  fontHeading?: string;
  fontBody?: string;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onAddAfter: (index: number) => void;
  onChangeLayout: (index: number, layout: LayoutPreset) => void;
}

function SortableSlideItemComponent({
  slide,
  index,
  isActive,
  fontHeading,
  fontBody,
  onSelect,
  onDelete,
  onDuplicate,
  onAddAfter,
  onChangeLayout,
}: SortableSlideItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.container} ${isActive ? styles.active : ''}`}
      data-dragging={isDragging ? 'true' : undefined}
      onClick={() => onSelect(index)}
    >
      {/* Drag Handle */}
      <div className={styles.dragHandle} {...listeners} {...attributes}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="12" cy="4" r="1.5" />
          <circle cx="4" cy="8" r="1.5" />
          <circle cx="12" cy="8" r="1.5" />
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
      </div>

      {/* Slide Number Badge */}
      <div className={styles.slideNumber}>{index + 1}</div>

      {/* Mini Slide Preview */}
      <div className={styles.previewContainer}>
        <div className={styles.previewScaler}>
          <Slide slide={slide} fontHeading={fontHeading} fontBody={fontBody} />
        </div>
      </div>

      {/* Layout Type Selector */}
      <select
        className={styles.layoutSelect}
        value={slide.layout}
        onChange={(e) => {
          e.stopPropagation();
          onChangeLayout(index, e.target.value as LayoutPreset);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {LAYOUTS.map((layout) => (
          <option key={layout} value={layout}>{layout}</option>
        ))}
      </select>

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button
          className={styles.actionButton}
          onClick={(e) => {
            e.stopPropagation();
            onAddAfter(index);
          }}
          title="Add slide after"
          aria-label="Add slide after"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>

        <button
          className={styles.actionButton}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(index);
          }}
          title="Duplicate slide"
          aria-label="Duplicate slide"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="5" y="5" width="8" height="8" />
            <path d="M3 11V3h8" />
          </svg>
        </button>

        <button
          className={styles.actionButton}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(index);
          }}
          title="Delete slide"
          aria-label="Delete slide"
          disabled={false} // Will be controlled by parent
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M2.5 4.5h11" />
            <path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
            <path d="M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" />
            <path d="M6.75 7v4.5M9.25 7v4.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Memoize to prevent re-renders during drag (per research pitfall #3)
export const SortableSlideItem = React.memo(SortableSlideItemComponent);
