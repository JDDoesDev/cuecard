import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Underline } from '@tiptap/extension-underline';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize } from './fontSizeExtension';
import { applyEditorTextAlign } from './editorTextAlign';

/**
 * Get Tiptap editor extensions with FLDC-specific configuration.
 *
 * CRITICAL: Disables Tiptap's built-in history extension in favor of zundo
 * middleware for unified undo/redo across all editing operations.
 */
export function getEditorExtensions(placeholderText = 'Start typing...') {
  return [
    StarterKit.configure({
      // CRITICAL: Disable Tiptap's built-in undo/redo - we use zundo instead
      // Tiptap's history only tracks ProseMirror state, not slide operations
      undoRedo: false,

      // Configure heading levels for slide layouts
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },

      // Disable features not needed in slides
      codeBlock: false, // Code editing is in CodeBlockSlide, not inline Tiptap
      horizontalRule: false, // Not needed in slides
    }),

    // Inline formatting
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontSize,

    // Block formatting
    // Shortcuts go through the same whole-element logic as the toolbar buttons
    TextAlign.extend({
      addKeyboardShortcuts() {
        return {
          'Mod-Shift-l': () => applyEditorTextAlign(this.editor, 'left'),
          'Mod-Shift-e': () => applyEditorTextAlign(this.editor, 'center'),
          'Mod-Shift-r': () => applyEditorTextAlign(this.editor, 'right'),
          'Mod-Shift-j': () => applyEditorTextAlign(this.editor, 'justify'),
        };
      },
    }).configure({
      types: ['heading', 'paragraph'],
    }),

    Placeholder.configure({
      placeholder: placeholderText,
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
  ];
}
