import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { applyEditorTextAlign } from './editorTextAlign';
import { normalizeTextAlign, type TextAlignValue } from './textAlign';
import { normalizeLinkHref } from './links';
import { fontFamilyCss, fontFamilyName } from './fontFamily';
import { renderedPxToNominal } from './fontSizeExtension';
import {
  canIndentSelection,
  canOutdentSelection,
  normalizeLineHeight,
  selectionInTable,
} from './blockFormat';

/**
 * Editor commands for the rich-text toolbars (format controls, element toolbar,
 * contextual toolbar). Every command focuses the editor, runs as a single
 * transaction and returns whether it applied. Storage formats are documented
 * next to each feature (links.ts, tables.ts, fontFamily.ts, blockFormat.ts).
 *
 * Use getActiveFormats(editor) for a snapshot of the toolbar state.
 */

export { normalizeLinkHref } from './links';
/** Element-level line height outside the editor (clears per-paragraph overrides). */
export { lineHeightUpdates } from './blockFormat';
export { getAvailableFonts } from '@/lib/fonts/availableFonts';

// ============================================================================
// Inline marks
// ============================================================================

/** Toggle bold (Mod-B). */
export const toggleBold = (editor: Editor): boolean => editor.chain().focus().toggleBold().run();
/** Toggle italic (Mod-I). */
export const toggleItalic = (editor: Editor): boolean => editor.chain().focus().toggleItalic().run();
/** Toggle underline (Mod-U). */
export const toggleUnderline = (editor: Editor): boolean => editor.chain().focus().toggleUnderline().run();
/** Toggle strikethrough (Mod-Shift-S). */
export const toggleStrike = (editor: Editor): boolean => editor.chain().focus().toggleStrike().run();
/** Toggle inline code (Mod-E). */
export const toggleCode = (editor: Editor): boolean => editor.chain().focus().toggleCode().run();
/** Toggle subscript. */
export const toggleSubscript = (editor: Editor): boolean => editor.chain().focus().toggleSubscript().run();
/** Toggle superscript. */
export const toggleSuperscript = (editor: Editor): boolean => editor.chain().focus().toggleSuperscript().run();

/** Set the text color (any CSS color), or clear it with null. */
export function setTextColor(editor: Editor, color: string | null): boolean {
  return color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run();
}

/** Set the highlight (background) color, or clear it with null. */
export function setHighlight(editor: Editor, color: string | null): boolean {
  return color
    ? editor.chain().focus().setHighlight({ color }).run()
    : editor.chain().focus().unsetHighlight().run();
}

/** Set the font size as px (e.g. '32px'; stored as cqw), or clear it with null. */
export function setFontSize(editor: Editor, size: string | null): boolean {
  return size ? editor.chain().focus().setFontSize(size).run() : editor.chain().focus().unsetFontSize().run();
}

/** Remove all inline marks (bold, links, colors, fonts…) from the selection. */
export const clearFormatting = (editor: Editor): boolean => editor.chain().focus().unsetAllMarks().run();

// ============================================================================
// Font family (per selection)
// ============================================================================

/**
 * Set the font family of the selection (a name from getAvailableFonts()), or
 * clear it with null so the element / presentation font applies again.
 * Stored as `<span style="font-family: &quot;Name&quot;, generic;">`.
 */
export function setFontFamily(editor: Editor, family: string | null): boolean {
  const name = family ? fontFamilyName(family) : '';
  if (!name) return editor.chain().focus().unsetFontFamily().run();
  return editor.chain().focus().setFontFamily(fontFamilyCss(name)).run();
}

/** Font family name at the selection (e.g. 'Lato'), or null when inherited. */
export function getFontFamily(editor: Editor): string | null {
  return fontFamilyName(editor.getAttributes('textStyle').fontFamily as string | undefined) || null;
}

// ============================================================================
// Links
// ============================================================================

/** The link at the selection/cursor, or null. */
export function getLinkAtSelection(editor: Editor): { href: string } | null {
  if (!editor.isActive('link')) return null;
  const href = editor.getAttributes('link').href as string | undefined;
  return href ? { href } : null;
}

/**
 * Link the selection to `href` (normalized: bare domains get https://, e-mail
 * addresses get mailto:). With a cursor inside a link, the whole link is
 * updated; with a cursor outside any link, the URL is inserted as linked text.
 * Returns false (and changes nothing) when the URL is not an allowed
 * http(s)/mailto URL — `javascript:` and friends are always rejected.
 */
export function setLink(editor: Editor, href: string): boolean {
  const normalized = normalizeLinkHref(href);
  if (!normalized) return false;
  const { empty } = editor.state.selection;
  if (empty && !editor.isActive('link')) {
    const text = normalized.replace(/^mailto:/i, '');
    return editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: normalized } }] })
      .unsetMark('link')
      .run();
  }
  return editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
}

/** Remove the link at the selection (the whole link when the cursor is inside one). */
export function unsetLink(editor: Editor): boolean {
  return editor.chain().focus().extendMarkRange('link').unsetLink().run();
}

// ============================================================================
// Lists
// ============================================================================

/** Toggle a bullet list. */
export const toggleBulletList = (editor: Editor): boolean => editor.chain().focus().toggleBulletList().run();
/** Toggle a numbered list. */
export const toggleOrderedList = (editor: Editor): boolean => editor.chain().focus().toggleOrderedList().run();

// ============================================================================
// Alignment, line spacing, indent
// ============================================================================

/**
 * Align text. With a cursor the whole element is aligned; with a range only
 * the selected blocks (see applyEditorTextAlign).
 */
export function setTextAlign(editor: Editor, align: TextAlignValue): boolean {
  return applyEditorTextAlign(editor, align);
}

/** Current block alignment at the selection. */
export function getTextAlign(editor: Editor): TextAlignValue {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      return normalizeTextAlign(node.attrs.textAlign as string | undefined) ?? 'left';
    }
  }
  return 'left';
}

/** Is the document a single heading or a single list (heading / list element editor)? */
function isSingleBlockDocument(editor: Editor): boolean {
  const { doc } = editor.state;
  if (doc.childCount === 0) return false;
  const first = doc.child(0).type.name;
  const rest = Array.from({ length: doc.childCount - 1 }, (_, i) => doc.child(i + 1));
  // Ignore Tiptap's trailing empty paragraph
  const onlyTrailing = rest.every((n) => n.type.name === 'paragraph' && n.content.size === 0);
  return onlyTrailing && (first === 'heading' || first === 'bulletList' || first === 'orderedList');
}

/**
 * Set the line height (unitless, 0.1-10, e.g. 1.5) of the paragraphs at the
 * selection, or clear it with null (the element's line height applies again).
 * Stored per block as `style="line-height: 1.5"`; a block value overrides the
 * element-level `lineHeight`. In heading and list element editors (one heading
 * or one list) it applies to the whole element and is stored as the element's
 * `lineHeight` by tiptapToSlide.
 */
export function setLineHeight(editor: Editor, value: number | string | null): boolean {
  const lineHeight = value == null || value === '' ? null : normalizeLineHeight(value);
  if (value != null && value !== '' && lineHeight == null) return false;
  return editor
    .chain()
    .focus()
    .setBlockLineHeight(lineHeight, { wholeDocument: isSingleBlockDocument(editor) })
    .run();
}

/** Block line height at the selection, or null when inherited from the element. */
export function getLineHeight(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      return normalizeLineHeight(node.attrs.lineHeight as number | null);
    }
  }
  return null;
}

/** Indent: sink the list item, or raise the paragraph indent level (max 6). Same as Tab. */
export const indent = (editor: Editor): boolean => editor.chain().focus().indentBlock().run();
/** Outdent: lift the list item, or lower the paragraph indent level. Same as Shift-Tab. */
export const outdent = (editor: Editor): boolean => editor.chain().focus().outdentBlock().run();
/** Can the selection be indented? (false inside tables) */
export const canIndent = (editor: Editor): boolean => canIndentSelection(editor);
/** Can the selection be outdented? (false inside tables) */
export const canOutdent = (editor: Editor): boolean => canOutdentSelection(editor);

// ============================================================================
// Tables (text elements only: the schema has no table nodes otherwise)
// ============================================================================

/** Can a table be inserted here (text element editor, not already in a table)? */
export function canInsertTable(editor: Editor): boolean {
  return 'table' in editor.schema.nodes && !selectionInTable(editor);
}

/** Insert a rows x cols table (header row optional) at the selection. */
export function insertTable(editor: Editor, rows: number, cols: number, withHeader = true): boolean {
  if (!canInsertTable(editor)) return false;
  const clamp = (n: number) => Math.max(1, Math.min(20, Math.round(n)));
  return editor.chain().focus().insertTable({ rows: clamp(rows), cols: clamp(cols), withHeaderRow: withHeader }).run();
}

/** Is the selection inside a table? */
export const isInTable = (editor: Editor): boolean => selectionInTable(editor);
/** Insert a row above the current one. */
export const addRowBefore = (editor: Editor): boolean => editor.chain().focus().addRowBefore().run();
/** Insert a row below the current one. */
export const addRowAfter = (editor: Editor): boolean => editor.chain().focus().addRowAfter().run();
/** Insert a column left of the current one. */
export const addColumnBefore = (editor: Editor): boolean => editor.chain().focus().addColumnBefore().run();
/** Insert a column right of the current one. */
export const addColumnAfter = (editor: Editor): boolean => editor.chain().focus().addColumnAfter().run();
/** Delete the current row (deletes the table when it is the last row). */
export const deleteRow = (editor: Editor): boolean => editor.chain().focus().deleteRow().run();
/** Delete the current column (deletes the table when it is the last column). */
export const deleteColumn = (editor: Editor): boolean => editor.chain().focus().deleteColumn().run();
/** Delete the whole table. */
export const deleteTable = (editor: Editor): boolean => editor.chain().focus().deleteTable().run();
/**
 * Toggle the table's first row between header (<th>) and body (<td>) cells,
 * wherever the cursor is in the table. Only a first-row header exports as a
 * markdown table header.
 */
export function toggleHeaderRow(editor: Editor): boolean {
  const { $from, from, to } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'table') continue;
    // table > row > cell > paragraph: first text position of the first cell
    const firstCell = $from.before(d) + 4;
    return editor
      .chain()
      .focus()
      .setTextSelection(firstCell)
      .toggleHeaderRow()
      .setTextSelection({ from, to })
      .run();
  }
  return false;
}

// ============================================================================
// Toolbar state snapshot
// ============================================================================

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  subscript: boolean;
  superscript: boolean;
  /** Link at the selection, or null. */
  link: { href: string } | null;
  /** Font family name at the selection, or null when inherited. */
  fontFamily: string | null;
  /** Font size as px (e.g. '32px'), or null when inherited. */
  fontSize: string | null;
  /** Size the selection renders at (nominal px), or null when mixed/unknown. */
  renderedFontSize: string | null;
  /** Text color, or null when inherited. */
  color: string | null;
  /** Highlight color, or null when none. */
  highlight: string | null;
  /** Block line height, or null when inherited from the element. */
  lineHeight: number | null;
  textAlign: TextAlignValue;
  /** List type at the selection, or null when not in a list. */
  listType: 'bullet' | 'ordered' | null;
  inTable: boolean;
  /** The schema supports tables (text element editor). */
  tablesAvailable: boolean;
  canIndent: boolean;
  canOutdent: boolean;
}

/**
 * Nominal px size the text renders at `pos`, or null outside a slide container.
 * `side` picks the text after (1) or before (-1) the position at a boundary
 * between differently sized text.
 */
function renderedFontSizeAt(editor: Editor, pos: number, side: 1 | -1): string | null {
  const { node } = editor.view.domAtPos(pos, side);
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const container = el?.closest('[data-slide-container]');
  if (!el || !container || !container.clientWidth) return null;
  const px = parseFloat(getComputedStyle(el).fontSize);
  return Number.isFinite(px) ? renderedPxToNominal(px, container.clientWidth) : null;
}

/**
 * Size the selection renders at, including inherited sizes (heading level,
 * theme), so the toolbar can show it when no explicit size is set. Null when
 * the selection starts and ends at different sizes.
 */
function getRenderedFontSize(editor: Editor): string | null {
  const { doc, selection } = editor.state;
  const { from, to, empty } = selection;
  // Typed text takes the marks before the caret
  if (empty) return renderedFontSizeAt(editor, from, -1);
  // First/last text positions (select-all spans the blocks, outside any text)
  const start = Selection.near(doc.resolve(from), 1).from;
  const end = Selection.near(doc.resolve(to), -1).from;
  const size = renderedFontSizeAt(editor, start, 1);
  return size === renderedFontSizeAt(editor, end, -1) ? size : null;
}

/** Snapshot of the formatting at the selection, for rendering toolbar state. */
export function getActiveFormats(editor: Editor): ActiveFormats {
  const textStyle = editor.getAttributes('textStyle');
  const highlightActive = editor.isActive('highlight');
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    subscript: editor.isActive('subscript'),
    superscript: editor.isActive('superscript'),
    link: getLinkAtSelection(editor),
    fontFamily: getFontFamily(editor),
    fontSize: (textStyle.fontSize as string | undefined) || null,
    renderedFontSize: getRenderedFontSize(editor),
    color: (textStyle.color as string | undefined) || null,
    highlight: highlightActive ? ((editor.getAttributes('highlight').color as string | undefined) || 'yellow') : null,
    lineHeight: getLineHeight(editor),
    textAlign: getTextAlign(editor),
    listType: editor.isActive('orderedList') ? 'ordered' : editor.isActive('bulletList') ? 'bullet' : null,
    inTable: isInTable(editor),
    tablesAvailable: 'table' in editor.schema.nodes,
    canIndent: canIndent(editor),
    canOutdent: canOutdent(editor),
  };
}
