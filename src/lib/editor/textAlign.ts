import type { SlideElement, HeadingElement, TextElement, ListElement } from '@/types/slide';

/**
 * Horizontal text alignment for text-like elements.
 *
 * Model:
 * - Whole-element alignment lives on the element as `textAlign` (heading, text,
 *   list). 'left' is the default and is stored as undefined.
 * - Text elements may additionally carry per-paragraph alignment inside their
 *   HTML content (`<p style="text-align: …">`) when paragraphs are mixed.
 *
 * Tiptap (TextAlign extension) works per block; tiptapToSlide collapses a
 * uniform alignment into the element field and slideToTiptap expands it again.
 */

export type TextAlignValue = 'left' | 'center' | 'right' | 'justify';

export const TEXT_ALIGN_VALUES: readonly TextAlignValue[] = ['left', 'center', 'right', 'justify'];

export type TextLikeElement = HeadingElement | TextElement | ListElement;

type WithTextAlign = { textAlign?: TextAlignValue };

export function isTextLikeElement(el: SlideElement): el is TextLikeElement {
  return el.type === 'heading' || el.type === 'text' || el.type === 'list';
}

/** Normalize a CSS text-align value; 'left'/'start'/invalid become undefined (default). */
export function normalizeTextAlign(value: string | null | undefined): Exclude<TextAlignValue, 'left'> | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'center' || v === 'right' || v === 'justify') return v;
  return undefined;
}

/** Element-level alignment ('left' when unset). */
export function getElementTextAlign(el: SlideElement): TextAlignValue {
  if (!isTextLikeElement(el)) return 'left';
  return normalizeTextAlign((el as WithTextAlign).textAlign) ?? 'left';
}

/**
 * Alignment state for UI: the element alignment, or 'mixed' when a text
 * element's paragraphs carry differing per-paragraph alignment.
 */
export function getTextAlignState(el: SlideElement): TextAlignValue | 'mixed' {
  const base = getElementTextAlign(el);
  if (el.type !== 'text' || !/text-align/i.test(el.content) || typeof DOMParser === 'undefined') {
    return base;
  }
  const doc = new DOMParser().parseFromString(el.content, 'text/html');
  const aligns = new Set(
    (Array.from(doc.body.children) as HTMLElement[]).map((b) => (b.style.textAlign ? normalizeTextAlign(b.style.textAlign) ?? 'left' : base))
  );
  if (aligns.size > 1) return 'mixed';
  return (aligns.values().next().value as TextAlignValue | undefined) ?? base;
}

/** Return a copy of `el` with the element-level alignment set (undefined removes it). */
export function withElementTextAlign<T extends SlideElement>(el: T, align: string | null | undefined): T {
  const normalized = normalizeTextAlign(align);
  const copy = { ...el } as T & WithTextAlign;
  if (normalized) copy.textAlign = normalized;
  else delete copy.textAlign;
  return copy;
}

/** Inline style attribute for an alignment ('' for default). */
export function textAlignStyleAttr(align: string | null | undefined): string {
  const normalized = normalizeTextAlign(align);
  return normalized ? ` style="text-align: ${normalized}"` : '';
}

/** Remove text-align from an element's inline style, dropping an empty style attribute. */
export function stripTextAlignStyle(el: HTMLElement): void {
  if (!el.style.textAlign) return;
  el.style.removeProperty('text-align');
  if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
}

/** Set (or clear) text-align on an element's inline style. */
function setTextAlignStyle(el: HTMLElement, align: string | undefined): void {
  if (align) el.style.textAlign = align;
  else stripTextAlignStyle(el);
}

/** Leading block tag = rich-text HTML (same rule as ElementRenderer's isRichTextHtml). */
const LEADING_BLOCK_TAG_RE = /^\s*<(?:p|div|table|ul|ol|h[1-6]|blockquote|pre)\b/i;

/** Is text content rich-text HTML (vs markdown source)? Matches the renderer's rule. */
export function hasBlockHtml(content: string): boolean {
  return LEADING_BLOCK_TAG_RE.test(content);
}

/**
 * Serialize the top-level blocks of a text element body back to content.
 * Always block HTML (`<p>…</p>` per paragraph) so the renderer treats it as
 * rich text and each paragraph stays a paragraph. An empty document is ''.
 */
export function serializeTextBody(body: HTMLElement): string {
  const children = Array.from(body.children);
  const isEmpty =
    children.length <= 1 &&
    (body.textContent ?? '').trim() === '' &&
    !body.querySelector('img, br, table, ul, ol');
  if (isEmpty) return '';
  if (children.length === 0) return `<p>${body.innerHTML}</p>`;
  return body.innerHTML;
}

/**
 * Collapse block alignment for a text element body: if every top-level block has
 * the same alignment, strip it from the blocks and return it (to be stored on
 * the element). Mixed alignment is left in the HTML and undefined is returned.
 */
export function collapseBlockAlignment(blocks: HTMLElement[]): {
  uniform: boolean;
  align: Exclude<TextAlignValue, 'left'> | undefined;
} {
  // Tables have no alignment of their own: they never make alignment mixed
  blocks = blocks.filter((b) => b.tagName !== 'TABLE');
  if (blocks.length === 0) return { uniform: true, align: undefined };
  const aligns = blocks.map((b) => normalizeTextAlign(b.style.textAlign));
  const first = aligns[0];
  const uniform = aligns.every((a) => a === first);
  if (!uniform) return { uniform: false, align: undefined };
  blocks.forEach(stripTextAlignStyle);
  return { uniform: true, align: first };
}

/**
 * Apply alignment to a whole element (used outside text-edit mode).
 * Sets the element field and removes conflicting per-paragraph alignment from
 * text content so the choice applies to every paragraph.
 * Returns the partial update to pass to updateElement.
 */
export function textAlignUpdates(el: SlideElement, align: TextAlignValue): Partial<SlideElement> {
  if (!isTextLikeElement(el)) return {};
  const normalized = normalizeTextAlign(align);
  const updates: Record<string, unknown> = { textAlign: normalized };

  if (el.type === 'text' && /text-align/i.test(el.content) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(el.content, 'text/html');
    doc.body.querySelectorAll<HTMLElement>('[style]').forEach(stripTextAlignStyle);
    updates.content = serializeTextBody(doc.body);
  }
  return updates as Partial<SlideElement>;
}

/** Apply an element-level alignment to every top-level block in an HTML body. */
export function applyAlignToBlocks(body: HTMLElement, align: string | undefined): void {
  if (!align) return;
  for (const child of Array.from(body.children) as HTMLElement[]) {
    if (!child.style.textAlign) setTextAlignStyle(child, align);
  }
}
