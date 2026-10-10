import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Underline } from '@tiptap/extension-underline';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextStyle, FontFamily } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontSize } from './fontSizeExtension';
import { applyEditorTextAlign } from './editorTextAlign';
import { BlockFormat } from './blockFormat';
import { PasteCleanup } from './pasteCleanup';
import { isAllowedLinkHref } from './links';
import { normalizeFontFamilyCss } from './fontFamily';
import { isSafeCssColor, isSafeFontFamily } from '@/lib/security/inlineStyle';

/** A plain CSS color, or null (never interpolate anything else into a style). */
function safeColor(value: unknown): string | null {
  return typeof value === 'string' && isSafeCssColor(value) ? value.trim() : null;
}

export interface EditorExtensionOptions {
  /**
   * Element type being edited. Tables are only available in text elements:
   * pass 'heading' or 'list' to leave them out of the schema.
   */
  elementType?: 'heading' | 'text' | 'list';
}

/**
 * Get Tiptap editor extensions with Cuecard-specific configuration.
 *
 * CRITICAL: Disables Tiptap's built-in history extension in favor of zundo
 * middleware for unified undo/redo across all editing operations.
 */
export function getEditorExtensions(placeholderText = 'Start typing...', options: EditorExtensionOptions = {}) {
  const tables = options.elementType !== 'heading' && options.elementType !== 'list';
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
      underline: false, // Registered separately below
      trailingNode: false, // No forced empty paragraph after tables/lists

      // Links: never navigate while editing; only http(s)/mailto URLs are
      // accepted (parse, render, autolink, paste and setLink all check)
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isAllowedLinkHref(url),
        shouldAutoLink: (url) => isAllowedLinkHref(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`),
      },
    }),

    // Tables (text elements only); fixed layout, no column resizing
    ...(tables ? [TableKit.configure({ table: { resizable: false } })] : []),

    // Inline formatting
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    // Color values are interpolated into style attributes: only plain CSS colors
    Color.extend({
      addGlobalAttributes() {
        return [
          {
            types: ['textStyle'],
            attributes: {
              color: {
                default: null,
                // Keep the authored value (e.g. #ff0000, not the CSSOM's rgb())
                parseHTML: (element: HTMLElement) => {
                  const decls = (element.getAttribute('style') ?? '').split(';');
                  for (let i = decls.length - 1; i >= 0; i--) {
                    const m = /^\s*color\s*:(.*)$/i.exec(decls[i]);
                    if (m) return safeColor(m[1].replace(/['"]+/g, ''));
                  }
                  return safeColor(element.style.color?.replace(/['"]+/g, ''));
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                  const color = safeColor(attributes.color);
                  return color ? { style: `color: ${color}` } : {};
                },
              },
            },
          },
        ];
      },
    }),
    Highlight.extend({
      addAttributes() {
        return {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              safeColor(element.getAttribute('data-color')) ?? safeColor(element.style.backgroundColor),
            renderHTML: (attributes: Record<string, unknown>) => {
              const color = safeColor(attributes.color);
              return color ? { 'data-color': color, style: `background-color: ${color}; color: inherit` } : {};
            },
          },
        };
      },
    }).configure({ multicolor: true }),
    FontSize,
    // Per-selection font family, stored canonically as `'Name', generic`
    FontFamily.extend({
      addGlobalAttributes() {
        return [
          {
            types: ['textStyle'],
            attributes: {
              fontFamily: {
                default: null,
                parseHTML: (element: HTMLElement) => normalizeFontFamilyCss(element.style.fontFamily),
                renderHTML: (attributes: Record<string, unknown>) => {
                  const family = normalizeFontFamilyCss(attributes.fontFamily as string | null);
                  return family && isSafeFontFamily(family) ? { style: `font-family: ${family}` } : {};
                },
              },
            },
          },
        ];
      },
    }),

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

    // Line height (paragraph/heading), paragraph indent, Tab/Shift-Tab
    BlockFormat,
    // Word / Google Docs / web paste cleanup
    PasteCleanup,

    Placeholder.configure({
      placeholder: placeholderText,
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
    }),
  ];
}
