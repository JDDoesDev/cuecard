import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { TextLikeElement } from '@/lib/editor/textAlign';
import rendererStyles from '@/components/layouts/ElementRenderer.module.css';

/**
 * Makes the in-place Tiptap editor look exactly like ElementRenderer output.
 *
 * ElementRenderer puts its classes/inline styles on the element's own nodes
 * (`<h1 class=heading data-level>`, `<ul class=list>`, `<div class=text>`).
 * Tiptap owns the editor DOM, so the same classes and styles are applied via
 * ProseMirror root attributes and node decorations — they never reach
 * `editor.getHTML()`, so stored content stays clean.
 *
 * Also adapts a few keys to the element type:
 * - heading: Enter inserts a line break (a heading element holds one block)
 * - list: Enter / Shift-Tab on an empty or top-level item and Backspace at the
 *   start of the first item don't lift it out of the list (text outside the
 *   list would be dropped by tiptapToSlide)
 * - Mod-Z / Mod-Y / Mod-Shift-Z: flush the pending debounced update first, so
 *   the store-level undo (EditorToolbar) sees the latest text.
 */

export const inlineSurfaceKey = new PluginKey('inlineSurface');

/** Meta that forces a re-render of root attributes/decorations (element props changed). */
export const REFRESH_META = 'inlineSurfaceRefresh';

export interface InlineSurfaceOptions {
  getElement: () => TextLikeElement;
  /** Extra class for the editor root (outline/caret/placeholder styles). */
  surfaceClass: string;
  onBeforeHistory: () => void;
}

/** Inline styles ElementRenderer puts on the element node itself. */
function elementStyle(el: TextLikeElement): string {
  const parts: string[] = [];
  if (el.lineHeight) parts.push(`line-height: ${el.lineHeight}`);
  if (el.fontFamily) parts.push(`font-family: '${el.fontFamily}', sans-serif`);
  return parts.join('; ');
}

const isList = (node: PMNode) => node.type.name === 'bulletList' || node.type.name === 'orderedList';

/** Bullets sit next to centered/right-aligned text (ElementRenderer: list-style-position: inside). */
function listMarkerInside(list: PMNode): boolean {
  let align: string | null = null;
  list.descendants((node) => {
    if (align !== null) return false;
    if (node.type.name === 'paragraph') {
      align = (node.attrs.textAlign as string | null) ?? 'left';
      return false;
    }
    return true;
  });
  return align === 'center' || align === 'right';
}

function buildDecorations(state: EditorState, el: TextLikeElement): DecorationSet {
  const decorations: Decoration[] = [];
  const style = elementStyle(el);

  state.doc.forEach((node, offset) => {
    const end = offset + node.nodeSize;
    if (el.type === 'heading') {
      const level = node.type.name === 'heading' ? node.attrs.level : el.level;
      decorations.push(
        Decoration.node(offset, end, {
          class: rendererStyles.heading,
          'data-level': String(level),
          ...(style && { style }),
        })
      );
    } else if (el.type === 'list' && isList(node)) {
      const inside = listMarkerInside(node);
      decorations.push(
        Decoration.node(offset, end, {
          class: rendererStyles.list,
          ...(style && { style }),
          ...(inside && { 'data-marker-inside': '' }),
        })
      );
      // Only top-level items carry .listItem (nested lists come from stored HTML)
      node.forEach((item, itemOffset) => {
        const from = offset + 1 + itemOffset;
        decorations.push(Decoration.node(from, from + item.nodeSize, { class: rendererStyles.listItem }));
      });
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

/** Number of list ancestors of the selection head. */
function listDepth(state: EditorState): number {
  const { $from } = state.selection;
  let depth = 0;
  for (let d = $from.depth; d > 0; d--) if (isList($from.node(d))) depth++;
  return depth;
}

export const InlineSurface = Extension.create<InlineSurfaceOptions>({
  name: 'inlineSurface',
  // Before StarterKit's list keymaps
  priority: 1000,

  addOptions() {
    return {
      getElement: () => ({ type: 'text', id: '', content: '', position: { x: 0, y: 0, width: 0, height: 0 } }),
      surfaceClass: '',
      onBeforeHistory: () => {},
    };
  },

  addKeyboardShortcuts() {
    const beforeHistory = () => {
      this.options.onBeforeHistory();
      // Not handled: the event continues to the global undo/redo handler
      return false;
    };
    return {
      'Mod-z': beforeHistory,
      'Mod-Z': beforeHistory,
      'Mod-Shift-z': beforeHistory,
      'Mod-y': beforeHistory,
      Enter: () => {
        const el = this.options.getElement();
        if (el.type === 'heading') return this.editor.commands.setHardBreak();
        if (el.type === 'list') {
          const { $from, empty } = this.editor.state.selection;
          // Enter on an empty top-level item would lift it out of the list
          return empty && $from.parent.content.size === 0 && listDepth(this.editor.state) <= 1;
        }
        return false;
      },
      Backspace: () => {
        const el = this.options.getElement();
        if (el.type !== 'list') return false;
        const { $from, empty } = this.editor.state.selection;
        // Backspace at the very start of the first item (doc > list > item >
        // paragraph) would lift it out of the list: keep the list intact
        return (
          empty &&
          $from.parentOffset === 0 &&
          $from.depth === 3 &&
          isList($from.node(1)) &&
          $from.index(1) === 0 &&
          $from.index(2) === 0
        );
      },
      'Shift-Tab': () => {
        const el = this.options.getElement();
        return el.type === 'list' && listDepth(this.editor.state) <= 1;
      },
    };
  },

  addProseMirrorPlugins() {
    const { getElement, surfaceClass } = this.options;
    return [
      new Plugin({
        key: inlineSurfaceKey,
        props: {
          attributes: () => {
            const el = getElement();
            // Text: ElementRenderer's <div class=text> is the editor root itself
            if (el.type === 'text') {
              const style = elementStyle(el);
              return { class: `${rendererStyles.text} ${surfaceClass}`, ...(style && { style }) };
            }
            return { class: surfaceClass };
          },
          decorations: (state) => buildDecorations(state, getElement()),
        },
      }),
    ];
  },
});

/** Outdent is allowed unless it would lift a list element's item out of the list. */
export function canOutdentListItem(state: EditorState, elementType: TextLikeElement['type']): boolean {
  const depth = listDepth(state);
  return elementType === 'list' ? depth > 1 : depth > 0;
}
