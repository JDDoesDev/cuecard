import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { getEditorExtensions } from '@/lib/editor/tiptapSchema';
import { flushPendingSave } from '@/lib/storage/autosave';
import type { TextLikeElement } from '@/lib/editor/textAlign';
import { InlineSurface, REFRESH_META } from './inlineSurfaceExtension';
import styles from './InlineTextEditor.module.css';

/** Debounce for pushing editor HTML to the store (thumbnails/autosave follow). */
const UPDATE_DEBOUNCE_MS = 300;

/** Where the caret goes when editing starts. */
export type InlineEditEntry = 'end' | 'all' | { x: number; y: number };

export interface InlineTextEditorHandle {
  /** Push a pending debounced update to the store now. */
  flush: () => void;
}

export interface InlineTextEditorProps {
  element: TextLikeElement;
  /** Element HTML (slideToTiptap) from the store. */
  content: string;
  /** True when `content` is an echo of this editor's own update. */
  skipContentSync: boolean;
  onUpdate: (elementId: string, html: string) => void;
  entry?: InlineEditEntry;
  /** Reports the Tiptap instance (null on unmount) for the contextual toolbar. */
  onEditorChange?: (editor: Editor | null) => void;
  ref?: Ref<InlineTextEditorHandle>;
}

/**
 * Edits a heading/text/list element in place on the slide canvas.
 *
 * The editor root and nodes get ElementRenderer's classes/styles (see
 * InlineSurface), and it is rendered inside the canvas' `data-slide-container`,
 * so text scales with cqw units exactly like the rendered element.
 *
 * Updates are debounced into the store; a pending update is flushed on
 * unmount, page hide, undo/redo keys, and via the imperative `flush()`.
 */
export function InlineTextEditor({
  element,
  content,
  skipContentSync,
  onUpdate,
  entry = 'end',
  onEditorChange,
  ref,
}: InlineTextEditorProps) {
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const elementRef = useRef(element);
  elementRef.current = element;
  // An editor instance always edits the element it was created for
  const elementIdRef = useRef(element.id);
  const editorRef = useRef<Editor | null>(null);
  const entryRef = useRef(entry);

  const flush = () => {
    if (!updateTimeoutRef.current) return;
    clearTimeout(updateTimeoutRef.current);
    updateTimeoutRef.current = null;
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) onUpdateRef.current(elementIdRef.current, editor.getHTML());
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useImperativeHandle(ref, () => ({ flush: () => flushRef.current() }), []);

  const editor = useEditor(
    {
      extensions: [
        // Schema depends on the element type (tables only in text elements):
        // the editor is re-created (keyed by type) when the type changes
        ...getEditorExtensions('Type something…', { elementType: element.type }),
        InlineSurface.configure({
          getElement: () => elementRef.current,
          surfaceClass: styles.surface,
          onBeforeHistory: () => flushRef.current(),
        }),
      ],
      content,
      autofocus: false,
      shouldRerenderOnTransaction: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': 'Slide text',
          'aria-multiline': 'true',
          spellcheck: 'true',
        },
      },
      onUpdate: ({ editor }) => {
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = setTimeout(() => {
          updateTimeoutRef.current = null;
          if (!editor.isDestroyed) onUpdateRef.current(elementIdRef.current, editor.getHTML());
        }, UPDATE_DEBOUNCE_MS);
      },
    },
    []
  );
  editorRef.current = editor;

  // Report the instance to the contextual toolbar
  const onEditorChangeRef = useRef(onEditorChange);
  onEditorChangeRef.current = onEditorChange;
  useEffect(() => {
    if (!editor) return;
    onEditorChangeRef.current?.(editor);
    return () => onEditorChangeRef.current?.(null);
  }, [editor]);

  // Focus on entry: caret at the double-click point, at the end, or select all
  useEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const start = entryRef.current;
      if (typeof start === 'object') {
        const hit = editor.view.posAtCoords({ left: start.x, top: start.y });
        if (hit) {
          editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(hit.pos).run();
          return;
        }
      }
      editor.commands.focus(start === 'all' ? 'all' : 'end', { scrollIntoView: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor]);

  // Sync content from the store (undo/redo, type changes, external edits)
  useEffect(() => {
    if (!editor || skipContentSync) return;
    // Unsaved typing (debounce pending) must not be replaced by a store change
    // (e.g. another tab's autosave): commit it instead; the store then echoes
    // this editor's own content and nothing is reset
    if (updateTimeoutRef.current) {
      flushRef.current();
      return;
    }
    if (editor.getHTML() === content) return;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(content, { emitUpdate: false });
    const maxPos = editor.state.doc.content.size;
    const clamp = (pos: number) => Math.max(1, Math.min(pos, maxPos - 1));
    try {
      editor.commands.setTextSelection({ from: clamp(from), to: clamp(to) });
    } catch {
      try { editor.commands.setTextSelection(1); } catch { /* empty doc */ }
    }
  }, [editor, content, skipContentSync]);

  // Element props (type, level, font, line height) changed: re-apply surface styles
  const { type, lineHeight, fontFamily } = element;
  const level = element.type === 'heading' ? element.level : 0;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(REFRESH_META, true));
  }, [editor, type, level, lineHeight, fontFamily]);

  // Flush a pending update when the page is hidden or closed
  useEffect(() => {
    const flushAndSave = () => {
      if (!updateTimeoutRef.current) return;
      flushRef.current();
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
  }, []);

  // Flush (don't drop) a pending update on unmount (exit, slide switch, …)
  useEffect(() => {
    return () => {
      flushRef.current();
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) return null;

  return <EditorContent editor={editor} className={styles.host} />;
}
