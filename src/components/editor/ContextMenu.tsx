import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  hasClipboard: boolean;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

/**
 * Right-click context menu: clipboard, duplicate/delete, and z-order control.
 */
export function ContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  hasClipboard,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onCopy)}
      >
        Copy
        <span className={styles.shortcut}>⌘C</span>
      </button>
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onPaste)}
        disabled={!hasClipboard}
      >
        Paste
        <span className={styles.shortcut}>⌘V</span>
      </button>
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onDuplicate)}
      >
        Duplicate
        <span className={styles.shortcut}>⌘D</span>
      </button>
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onDelete)}
      >
        Delete
        <span className={styles.shortcut}>Del</span>
      </button>
      <div className={styles.separator} />
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onBringForward)}
      >
        Bring Forward
        <span className={styles.shortcut}>]</span>
      </button>
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onSendBackward)}
      >
        Send Backward
        <span className={styles.shortcut}>[</span>
      </button>
      <div className={styles.separator} />
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onBringToFront)}
      >
        Bring to Front
      </button>
      <button
        className={styles.menuItem}
        onClick={() => handleAction(onSendToBack)}
      >
        Send to Back
      </button>
    </div>
  );
}
