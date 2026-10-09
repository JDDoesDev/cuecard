import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { getEditorExtensions } from '@/lib/editor/tiptapSchema';
import { EditorFormatToolbar } from './EditorFormatToolbar';

export interface TiptapEditorProps {
  content: string; // HTML string
  onUpdate: (html: string) => void;
  /** When true, skip applying content to the editor (it's an echo of the user's own edit). */
  skipContentSync?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Tiptap wrapper with full formatting toolbar.
 *
 * Uses HTML strings for content input/output, letting Tiptap handle
 * all parsing and serialization natively. This supports the full range
 * of formatting: bold, italic, underline, strikethrough, subscript,
 * superscript, font size, color, highlight, and text alignment.
 */
export function TiptapEditor({
  content,
  onUpdate,
  skipContentSync = false,
  placeholder = 'Start typing...',
  className = '',
}: TiptapEditorProps) {
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const handleUpdate = useCallback(
    (editor: any) => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(() => {
        onUpdateRef.current(editor.getHTML());
      }, 300);
    },
    []
  );

  const editor = useEditor(
    {
      extensions: getEditorExtensions(placeholder),
      content,
      autofocus: 'end',
      onUpdate: ({ editor }) => handleUpdate(editor),
      shouldRerenderOnTransaction: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: className,
        },
      },
    },
    [placeholder, className]
  );

  // Sync content from store into editor (for undo/redo, slide switches)
  useEffect(() => {
    if (!editor) return;
    if (skipContentSync) return;

    const { from, to } = editor.state.selection;

    editor.commands.setContent(content, { emitUpdate: false });

    const maxPos = editor.state.doc.content.size;
    const safeFrom = Math.max(1, Math.min(from, maxPos - 1));
    const safeTo = Math.max(1, Math.min(to, maxPos - 1));
    try {
      editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
    } catch {
      try { editor.commands.setTextSelection(1); } catch { /* empty doc */ }
    }
  }, [editor, content, skipContentSync]);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div>
      <EditorFormatToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
