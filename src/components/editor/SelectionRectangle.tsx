import { useState, useEffect, useRef, type RefObject } from 'react';
import type { SlideElement } from '@/types/slide';
import { intersectsRect } from '@/lib/editor/resizeUtils';
import styles from './SelectionRectangle.module.css';

interface SelectionRectangleProps {
  /** `additive` is true when Shift was held: add to the existing selection. */
  onSelectionComplete: (selectedIds: string[], additive: boolean) => void;
  elements: SlideElement[];
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Drag-to-select marquee component.
 * Listens on the canvas container for mousedown on empty space,
 * then draws a selection rectangle and selects intersecting elements.
 */
export function SelectionRectangle({
  onSelectionComplete,
  elements,
  containerRef,
}: SelectionRectangleProps) {
  const [rect, setRect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const isSelectingRef = useRef(false);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const onSelectionCompleteRef = useRef(onSelectionComplete);
  onSelectionCompleteRef.current = onSelectionComplete;

  // Listen directly on the canvas container — no blocking overlay
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only start selection if clicking directly on the canvas background
      if (e.target !== container) return;
      if (e.button !== 0) return;

      e.preventDefault();
      // preventDefault() blocks the native focus change; move focus to the canvas
      // so keyboard shortcuts don't go to a previously focused input
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active !== container) {
        active.blur();
      }
      if (container.hasAttribute('tabindex')) container.focus({ preventScroll: true });

      const containerRect = container.getBoundingClientRect();
      const startX = e.clientX - containerRect.left;
      const startY = e.clientY - containerRect.top;

      isSelectingRef.current = true;
      const startRect = { startX, startY, currentX: startX, currentY: startY };
      let latestRect = startRect;

      setRect(startRect);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isSelectingRef.current) return;

        const containerRect = container.getBoundingClientRect();
        const currentX = moveEvent.clientX - containerRect.left;
        const currentY = moveEvent.clientY - containerRect.top;

        latestRect = { startX, startY, currentX, currentY };
        setRect(latestRect);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        isSelectingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const containerRect = container.getBoundingClientRect();

        // Calculate selection rectangle in percentage coordinates
        const left = Math.min(latestRect.startX, latestRect.currentX);
        const top = Math.min(latestRect.startY, latestRect.currentY);
        const width = Math.abs(latestRect.currentX - latestRect.startX);
        const height = Math.abs(latestRect.currentY - latestRect.startY);

        // Only select if the user actually dragged (not just a click)
        if (width > 3 || height > 3) {
          const rectInPercent = {
            x: (left / containerRect.width) * 100,
            y: (top / containerRect.height) * 100,
            width: (width / containerRect.width) * 100,
            height: (height / containerRect.height) * 100,
          };

          const selectedIds = elementsRef.current
            .filter((el) => intersectsRect(el.position, rectInPercent))
            .map((el) => el.id);

          onSelectionCompleteRef.current(selectedIds, e.shiftKey || upEvent.shiftKey);

          // The click that follows this mouseup would land on the canvas
          // background and clear the selection we just made — swallow it.
          const suppressClick = (clickEvent: MouseEvent) => {
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
          };
          window.addEventListener('click', suppressClick, true);
          setTimeout(() => window.removeEventListener('click', suppressClick, true), 0);
        }

        setRect(null);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    container.addEventListener('mousedown', handleMouseDown);
    return () => container.removeEventListener('mousedown', handleMouseDown);
  }, [containerRef]);

  if (!rect) return null;

  const left = Math.min(rect.startX, rect.currentX);
  const top = Math.min(rect.startY, rect.currentY);
  const width = Math.abs(rect.currentX - rect.startX);
  const height = Math.abs(rect.currentY - rect.startY);

  return (
    <div
      className={styles.selectionRect}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
}
