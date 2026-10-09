import type { ResizeDirection } from '@/lib/editor/resizeUtils';
import styles from './ResizeHandles.module.css';

interface ResizeHandlesProps {
  onResizeStart: (direction: ResizeDirection, e: React.MouseEvent) => void;
}

/**
 * Resize handles for selected elements.
 * Provides 8 handles: 4 corners + 4 edges.
 */
export function ResizeHandles({ onResizeStart }: ResizeHandlesProps) {
  return (
    <>
      {/* Corner handles */}
      <div
        className={`${styles.handle} ${styles.nw}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('nw', e)}
      />
      <div
        className={`${styles.handle} ${styles.ne}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('ne', e)}
      />
      <div
        className={`${styles.handle} ${styles.se}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('se', e)}
      />
      <div
        className={`${styles.handle} ${styles.sw}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('sw', e)}
      />

      {/* Edge handles */}
      <div
        className={`${styles.handle} ${styles.n}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('n', e)}
      />
      <div
        className={`${styles.handle} ${styles.s}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('s', e)}
      />
      <div
        className={`${styles.handle} ${styles.e}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('e', e)}
      />
      <div
        className={`${styles.handle} ${styles.w}`}
        data-resize-handle
        onMouseDown={(e) => onResizeStart('w', e)}
      />
    </>
  );
}
