import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import type { SlideElement } from '@/types/slide';
import { serializeTextBody } from './textAlign';

/**
 * Block-level formatting stored as attributes on top-level text blocks:
 *
 * - `lineHeight` (paragraph, heading): unitless line height, rendered as
 *   `style="line-height: 1.5"`. A block value overrides the element-level
 *   `lineHeight` (which the renderer applies to the element container).
 * - `indent` (paragraph): level 0-6, rendered as
 *   `data-indent="2" style="margin-left: 2em"`.
 *
 * Paragraphs inside list items and table cells never get an indent (lists use
 * sink/lift instead; Tab in a table moves between cells).
 */

export const MAX_INDENT = 6;
export const MIN_LINE_HEIGHT = 0.1;
export const MAX_LINE_HEIGHT = 10;

/** Parse a line-height value to a unitless number in range, or null. */
export function normalizeLineHeight(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < MIN_LINE_HEIGHT || n > MAX_LINE_HEIGHT) return null;
  return Number(n.toFixed(3));
}

function clampIndent(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_INDENT, Math.round(n)));
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockFormat: {
      /** Set (or clear with null) the line height of the selected blocks. */
      setBlockLineHeight: (value: number | null, options?: { wholeDocument?: boolean }) => ReturnType;
      /** Indent (or sink the list item) at the selection. */
      indentBlock: () => ReturnType;
      /** Outdent (or lift the list item) at the selection. */
      outdentBlock: () => ReturnType;
    };
  }
}

/** Node types that can never carry a paragraph indent (their own structure handles it). */
const NO_INDENT_ANCESTORS = new Set(['listItem', 'taskItem', 'tableCell', 'tableHeader']);

/** Positions of indentable paragraphs touched by the selection. */
function indentableParagraphs(state: EditorState): Array<{ pos: number; node: PMNode }> {
  const { from, to } = state.selection;
  const found: Array<{ pos: number; node: PMNode }> = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (NO_INDENT_ANCESTORS.has(node.type.name)) return false;
    if (node.type.name === 'paragraph') {
      found.push({ pos, node });
      return false;
    }
    return true;
  });
  return found;
}

/** Is the selection inside a list item (where indent means sink/lift)? */
export function selectionInList(stateOrEditor: EditorState | Editor): boolean {
  const { $from } = ('state' in stateOrEditor ? stateOrEditor.state : stateOrEditor).selection;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'listItem' || name === 'taskItem') return true;
    if (name === 'tableCell' || name === 'tableHeader') return false;
  }
  return false;
}

/** Is the selection inside a table? */
export function selectionInTable(stateOrEditor: EditorState | Editor): boolean {
  const { $from } = ('state' in stateOrEditor ? stateOrEditor.state : stateOrEditor).selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return true;
  }
  return false;
}

export function canIndentSelection(editor: Editor): boolean {
  if (selectionInTable(editor)) return false;
  if (selectionInList(editor)) return editor.can().sinkListItem('listItem');
  return indentableParagraphs(editor.state).some(({ node }) => clampIndent(node.attrs.indent) < MAX_INDENT);
}

export function canOutdentSelection(editor: Editor): boolean {
  if (selectionInTable(editor)) return false;
  if (selectionInList(editor)) return editor.can().liftListItem('listItem');
  return indentableParagraphs(editor.state).some(({ node }) => clampIndent(node.attrs.indent) > 0);
}

export const BlockFormat = Extension.create({
  name: 'blockFormat',

  // Lower than the table (Tab = next cell) and list item (Tab = sink) keymaps
  priority: 50,

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeLineHeight(element.style.lineHeight),
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = normalizeLineHeight(attributes.lineHeight as number | null);
              return value == null ? {} : { style: `line-height: ${value}` };
            },
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => clampIndent(element.getAttribute('data-indent')),
            renderHTML: (attributes: Record<string, unknown>) => {
              const level = clampIndent(attributes.indent);
              return level === 0 ? {} : { 'data-indent': String(level), style: `margin-left: ${level}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockLineHeight:
        (value, options) =>
        ({ tr, state, dispatch }) => {
          const lineHeight = normalizeLineHeight(value);
          if (value != null && lineHeight == null) return false;
          const from = options?.wholeDocument ? 0 : state.selection.from;
          const to = options?.wholeDocument ? state.doc.content.size : state.selection.to;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true;
            if (dispatch && node.attrs.lineHeight !== lineHeight) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
            }
            return false;
          });
          return true;
        },

      indentBlock:
        () =>
        ({ state, tr, commands, dispatch }) => {
          if (selectionInTable(state)) return false;
          if (selectionInList(state)) return commands.sinkListItem('listItem');
          const targets = indentableParagraphs(state).filter(({ node }) => clampIndent(node.attrs.indent) < MAX_INDENT);
          if (targets.length === 0) return false;
          if (!dispatch) return true;
          for (const { pos, node } of targets) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: clampIndent(node.attrs.indent) + 1 });
          }
          return true;
        },

      outdentBlock:
        () =>
        ({ state, tr, commands, dispatch }) => {
          if (selectionInTable(state)) return false;
          if (selectionInList(state)) return commands.liftListItem('listItem');
          const targets = indentableParagraphs(state).filter(({ node }) => clampIndent(node.attrs.indent) > 0);
          if (targets.length === 0) return false;
          if (!dispatch) return true;
          for (const { pos, node } of targets) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: clampIndent(node.attrs.indent) - 1 });
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    // Table and list-item keymaps run first (higher priority). In lists and
    // paragraphs Tab is always consumed (even at the limit) so focus does not
    // jump out of the editor; elsewhere (e.g. a heading) the default applies.
    const handle = (outdent: boolean) => {
      const { state, commands } = this.editor;
      if (selectionInTable(state)) return false;
      if (selectionInList(state)) {
        if (outdent) commands.liftListItem('listItem');
        else commands.sinkListItem('listItem');
        return true;
      }
      if (indentableParagraphs(state).length === 0) return false;
      if (outdent) commands.outdentBlock();
      else commands.indentBlock();
      return true;
    };
    return {
      Tab: () => handle(false),
      'Shift-Tab': () => handle(true),
    };
  },
});

/**
 * Element-level line height change made outside the text editor (e.g. the
 * properties panel): sets the element field and, for text elements, removes
 * per-paragraph line heights so the new value applies to every paragraph.
 * Returns the partial update to pass to updateElement.
 */
export function lineHeightUpdates(el: SlideElement, lineHeight: number | undefined): Partial<SlideElement> {
  if (el.type !== 'heading' && el.type !== 'text' && el.type !== 'list') return {};
  const updates: Record<string, unknown> = { lineHeight };
  if (el.type === 'text' && /line-height/i.test(el.content) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(el.content, 'text/html');
    for (const block of Array.from(doc.body.querySelectorAll<HTMLElement>('[style]'))) {
      if (!block.style.lineHeight) continue;
      block.style.removeProperty('line-height');
      if (!block.getAttribute('style')?.trim()) block.removeAttribute('style');
    }
    updates.content = serializeTextBody(doc.body);
  }
  return updates as Partial<SlideElement>;
}
