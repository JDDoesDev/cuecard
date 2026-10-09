import { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import styles from './EditorBubbleMenu.module.css';

export interface EditorBubbleMenuProps {
  editor: Editor;
}

/**
 * Floating formatting toolbar that appears on text selection.
 * Provides bold, italic, and strikethrough formatting.
 */
export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ from, to }) => {
        // Only show when text is selected
        return from !== to;
      }}
      className={styles.bubbleMenu}
    >
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? styles.active : ''}
        aria-label="Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? styles.active : ''}
        aria-label="Italic"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? styles.active : ''}
        aria-label="Strikethrough"
      >
        S
      </button>
    </BubbleMenu>
  );
}
