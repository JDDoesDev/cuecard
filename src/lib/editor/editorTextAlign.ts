import type { Editor } from '@tiptap/core';
import type { TextAlignValue } from './textAlign';

/**
 * Apply alignment in the rich-text editor. Text boxes align as a whole: with a
 * collapsed cursor, every block of the element is aligned; with a range
 * selection, only the selected blocks are. Used by the toolbar buttons and the
 * Mod-Shift-L/E/R/J shortcuts so both behave the same.
 */
export function applyEditorTextAlign(editor: Editor, align: TextAlignValue): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    return editor.chain().focus().selectAll().setTextAlign(align).setTextSelection({ from, to }).run();
  }
  return editor.chain().focus().setTextAlign(align).run();
}
