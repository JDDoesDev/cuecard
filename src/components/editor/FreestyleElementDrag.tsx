import { useRef, useState, useCallback } from 'react';
import styles from './FreestyleElementDrag.module.css';

interface FreestyleElementDragProps {
  slideIndex: number;
  elementIndex: number;
  position: { x: number; y: number; width: number; height: number };
  children: React.ReactNode;
  onPositionChange: (newPosition: { x: number; y: number; width: number; height: number }) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * Freestyle element drag wrapper.
 * Uses mouse events for free-form canvas positioning (not @dnd-kit).
 *
 * After a drag operation (mouse moved > 3px), suppresses the subsequent
 * click event to prevent the parent's onClick from switching to edit mode.
 */
export function FreestyleElementDrag({
  slideIndex,
  elementIndex,
  position,
  children,
  onPositionChange,
  onDragStart,
  onDragEnd,
}: FreestyleElementDragProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    elementX: number;
    elementY: number;
  } | null>(null);
  const didDragRef = useRef(false);

  // Suppress click events that follow a drag to prevent toggling edit mode
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.stopPropagation();
      didDragRef.current = false;
    }
  }, []);

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;

      // Find the parent container (slide) to calculate relative position
      const slideContainer = containerRef.current?.closest('[data-slide-container]');
      if (!slideContainer) return;

      const slideRect = slideContainer.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;

      dragStartRef.current = {
        mouseX: startX,
        mouseY: startY,
        elementX: position.x,
        elementY: position.y,
      };

      setIsDragging(true);
      onDragStart?.();

      // Measure actual rendered height as percentage of slide
      const containerEl = containerRef.current;
      const renderedHeightPct = containerEl
        ? (containerEl.getBoundingClientRect().height / slideRect.height) * 100
        : position.height;

      // Attach global listeners
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;

        const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
        const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;

        // Mark as a real drag if mouse moved more than 3px
        if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
          didDragRef.current = true;
        }

        // Convert pixel deltas to percentage of slide dimensions
        const deltaXPercent = (deltaX / slideRect.width) * 100;
        const deltaYPercent = (deltaY / slideRect.height) * 100;

        // Calculate new position
        let newX = dragStartRef.current.elementX + deltaXPercent;
        let newY = dragStartRef.current.elementY + deltaYPercent;

        // Constrain to slide bounds using rendered height (not stored height)
        newX = Math.max(0, Math.min(100 - position.width, newX));
        newY = Math.max(0, Math.min(100 - renderedHeightPct, newY));

        // Update position (live during drag)
        onPositionChange({
          x: newX,
          y: newY,
          width: position.width,
          height: position.height,
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onDragEnd?.();
        dragStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [position, onPositionChange, onDragStart, onDragEnd]
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.elementContainer} ${isDragging ? styles.dragging : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: `${position.width}%`,
      }}
      onClick={handleContainerClick}
    >
      <div
        className={styles.dragHandle}
        onMouseDown={handleMouseDown}
        title="Drag to reposition"
      >
        <svg
          width="16"
          height="10"
          viewBox="0 0 16 10"
          fill="currentColor"
          className={styles.gripIcon}
        >
          <circle cx="4" cy="3" r="1.2" />
          <circle cx="8" cy="3" r="1.2" />
          <circle cx="12" cy="3" r="1.2" />
          <circle cx="4" cy="7" r="1.2" />
          <circle cx="8" cy="7" r="1.2" />
          <circle cx="12" cy="7" r="1.2" />
        </svg>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
