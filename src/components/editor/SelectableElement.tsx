import { useRef, useState, useCallback } from 'react';
import type { SlideElement } from '@/types/slide';
import { ResizeHandles } from './ResizeHandles';
import { calculateResize, type ResizeDirection } from '@/lib/editor/resizeUtils';
import styles from './SelectableElement.module.css';

interface SelectableElementProps {
  element: SlideElement;
  isSelected: boolean;
  /** Text is being edited in place: pointer events go to the editor, no drag/resize. */
  isEditing?: boolean;
  zIndex: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDoubleClick?: (id: string, point: { x: number; y: number }) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  onPositionChange: (elementId: string, newPosition: any, disableSnap: boolean) => void;
  onResizeEnd: (elementId: string, newPosition: any) => void;
  onResize?: (elementId: string, newPosition: any, disableSnap: boolean, direction: ResizeDirection) => void;
  onResizeStart?: (elementId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  children: React.ReactNode;
}

/** Blur any focused input/editor and focus the (focusable) slide canvas. */
function moveFocusToCanvas(slideContainer: Element) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !slideContainer.contains(active)) {
    active.blur();
  }
  if (slideContainer instanceof HTMLElement && slideContainer.hasAttribute('tabindex')) {
    slideContainer.focus({ preventScroll: true });
  }
}

/**
 * Wrapper for elements with selection, drag, and resize capabilities.
 */
export function SelectableElement({
  element,
  isSelected,
  isEditing = false,
  zIndex,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onPositionChange,
  onResizeEnd,
  onResize,
  onResizeStart,
  onDragStart,
  onDragEnd,
  children,
}: SelectableElementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    elementX: number;
    elementY: number;
  } | null>(null);
  const didDragRef = useRef(false);

  // Click handler for selection
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) {
        e.stopPropagation();
        return;
      }
      if (didDragRef.current) {
        e.stopPropagation();
        didDragRef.current = false;
        return;
      }
      e.stopPropagation();
      onSelect(element.id, e.shiftKey);
    },
    [element.id, onSelect, isEditing]
  );

  // Double-click handler for entering edit mode
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // While editing, double-click selects a word (native behavior)
      if (!isEditing) onDoubleClick?.(element.id, { x: e.clientX, y: e.clientY });
    },
    [element.id, onDoubleClick, isEditing]
  );

  // Context menu handler for right-click
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // While editing, keep the native menu (spelling, copy/paste)
      if (isEditing) return;
      e.preventDefault();
      onContextMenu?.(element.id, e.clientX, e.clientY);
    },
    [element.id, onContextMenu, isEditing]
  );

  // Drag start handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left clicks on the element body (not resize handles)
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-resize-handle]')) return;

      if (isEditing) {
        // Don't start a drag or a canvas marquee. A press on the element box
        // outside the text keeps editing: return focus to the text.
        e.stopPropagation();
        if (!target.closest('.ProseMirror')) {
          e.preventDefault();
          containerRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;

      // Find the slide container
      const slideContainer = containerRef.current?.closest('[data-slide-container]');
      if (!slideContainer) return;

      // preventDefault() above stops the browser from moving focus, so do it
      // ourselves: otherwise Delete/Ctrl+C/V keep going to e.g. the notes textarea.
      moveFocusToCanvas(slideContainer);

      const slideRect = slideContainer.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;

      dragStartRef.current = {
        mouseX: startX,
        mouseY: startY,
        elementX: element.position.x,
        elementY: element.position.y,
      };

      setIsDragging(true);
      onDragStart?.();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;

        const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
        const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;

        // Mark as a real drag if mouse moved more than 3px
        if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
          didDragRef.current = true;
        }

        // Convert pixel deltas to percentage
        const deltaXPercent = (deltaX / slideRect.width) * 100;
        const deltaYPercent = (deltaY / slideRect.height) * 100;

        // Calculate new position
        let newX = dragStartRef.current.elementX + deltaXPercent;
        let newY = dragStartRef.current.elementY + deltaYPercent;

        // Constrain to slide bounds
        newX = Math.max(0, Math.min(100 - element.position.width, newX));
        newY = Math.max(0, Math.min(100 - element.position.height, newY));

        // Update position (with snap control via altKey)
        onPositionChange(
          element.id,
          {
            x: newX,
            y: newY,
            width: element.position.width,
            height: element.position.height,
          },
          moveEvent.altKey
        );
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
    [element, onPositionChange, onDragStart, onDragEnd, isEditing]
  );

  // Resize start handler
  const handleResizeStart = useCallback(
    (direction: ResizeDirection, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const slideContainer = containerRef.current?.closest('[data-slide-container]');
      if (!slideContainer) return;
      moveFocusToCanvas(slideContainer);

      const slideRect = slideContainer.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const originalPosition = { ...element.position };

      setIsResizing(true);
      onResizeStart?.(element.id);
      let lastPosition = originalPosition;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const deltaXPercent = (deltaX / slideRect.width) * 100;
        const deltaYPercent = (deltaY / slideRect.height) * 100;

        const newPosition = calculateResize(direction, deltaXPercent, deltaYPercent, originalPosition);
        lastPosition = newPosition;

        // Call onResize callback during resize to enable smart guides
        if (onResize) {
          onResize(element.id, newPosition, moveEvent.altKey, direction);
        } else {
          onPositionChange(element.id, newPosition, true); // Fallback to position change
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);

        onResizeEnd(element.id, lastPosition);

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [element, onPositionChange, onResize, onResizeStart, onResizeEnd]
  );

  const isTextType = element.type === 'heading' || element.type === 'text' || element.type === 'list';
  const verticalAlign = isTextType ? element.verticalAlign : undefined;

  return (
    <div
      ref={containerRef}
      className={`${styles.elementContainer} ${isSelected || isEditing ? styles.selected : ''} ${
        isEditing ? styles.editing : ''
      } ${isTextType ? styles.textContainer : ''} ${isDragging ? styles.dragging : ''} ${
        isResizing ? styles.resizing : ''
      }`}
      data-element-id={element.id}
      data-editing={isEditing || undefined}
      style={{
        position: 'absolute',
        left: `${element.position.x}%`,
        top: `${element.position.y}%`,
        width: `${element.position.width}%`,
        // Text grows past its box like in UniversalSlide (present mode)
        ...(isTextType
          ? { minHeight: `${element.position.height}%` }
          : { height: `${element.position.height}%` }),
        zIndex,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      <div
        className={styles.content}
        style={
          verticalAlign && verticalAlign !== 'top'
            ? {
                display: 'flex',
                alignItems: verticalAlign === 'middle' ? 'center' : 'flex-end',
              }
            : undefined
        }
      >
        {children}
      </div>
      {isSelected && !isEditing && <ResizeHandles onResizeStart={handleResizeStart} />}
    </div>
  );
}
