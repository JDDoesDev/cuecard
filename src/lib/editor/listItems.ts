/**
 * List item strings (`ListElement.items`) hold the item's inline content
 * (markdown from import, or inline HTML from the editor), optionally followed
 * by nested sub-lists as HTML:
 *
 *   'Parent **bold**'                                   (no children)
 *   'Parent<ul><li>Child</li><li>Other<ol start="3"><li>Deep</li></ol></li></ul>'
 *
 * Canonical nested markup: `<ul>` / `<ol>` (with `start="N"` only when N != 1),
 * and each nested `<li>` holds inline HTML directly (no `<p>` wrappers; several
 * paragraphs are joined with `<br>`), followed by its own nested lists. Top-level
 * items stay separate strings, so fragments (`fragmentPerItem`) only ever step
 * through top-level items.
 *
 * An item only counts as having sub-lists when it ENDS with a well-formed list
 * block (checked by a small structural parser below), so text such as
 * "Use `<ul>` tags" or "<code>&lt;ul&gt;</code>" is never split or rewritten.
 */

export interface NestedList {
  ordered: boolean;
  start: number;
  items: Array<{ text: string; lists: NestedList[] }>;
}

const LIST_OPEN = /<(ul|ol)(?: start="(\d+)")?>/y;
const LI_OPEN = /<li>/y;
const LI_CLOSE = /<\/li>/y;
/** Where an <li>'s own inline content ends: a nested list or the closing tag. */
const LI_CONTENT_END = /<(?:ul|ol)[\s>]|<\/li>/;

/**
 * Parse a block of one or more `<ul>`/`<ol start="N">` lists of `<li>` items
 * (inline content, then nested lists). The whole string must be consumed;
 * returns null for anything else.
 */
export function parseListBlock(html: string): NestedList[] | null {
  let pos = 0;
  const at = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = pos;
    const m = re.exec(html);
    if (m) pos = re.lastIndex;
    return m;
  };
  const parseLists = (): NestedList[] | null => {
    const lists: NestedList[] = [];
    for (let open = at(LIST_OPEN); open; open = at(LIST_OPEN)) {
      const tag = open[1];
      if (tag === 'ul' && open[2] !== undefined) return null;
      const list: NestedList = {
        ordered: tag === 'ol',
        start: open[2] !== undefined ? Number(open[2]) : 1,
        items: [],
      };
      while (at(LI_OPEN)) {
        const end = html.slice(pos).search(LI_CONTENT_END);
        if (end < 0) return null;
        const text = html.slice(pos, pos + end);
        pos += end;
        const sub = parseLists();
        if (!sub || !at(LI_CLOSE)) return null;
        list.items.push({ text, lists: sub });
      }
      const close = new RegExp(`</${tag}>`, 'y');
      if (list.items.length === 0 || !at(close)) return null;
      lists.push(list);
    }
    return lists;
  };
  const lists = parseLists();
  return lists && lists.length > 0 && pos === html.length ? lists : null;
}

/** True when `prefix` leaves a code span open (HTML `<code>` or markdown backticks). */
function insideCode(prefix: string): boolean {
  const opens = (prefix.match(/<code\b/gi) ?? []).length;
  const closes = (prefix.match(/<\/code>/gi) ?? []).length;
  if (opens > closes) return true;
  return (prefix.match(/`/g) ?? []).length % 2 === 1;
}

/**
 * Split an item into its own inline content and its trailing nested-list HTML.
 * `lists` is the parsed structure of `nested` (null when there are no sub-lists).
 */
export function splitListItem(item: string): { text: string; nested: string; lists: NestedList[] | null } {
  const candidates = /<(?:ul|ol)[\s>]/gi;
  for (let m = candidates.exec(item); m; m = candidates.exec(item)) {
    const text = item.slice(0, m.index);
    if (insideCode(text)) continue;
    const nested = item.slice(m.index);
    const lists = parseListBlock(nested);
    if (lists) return { text, nested, lists };
  }
  return { text: item, nested: '', lists: null };
}

/** `<p>A</p><p>B</p>` -> `A<br>B`; anything else is returned unchanged. */
function unwrapParagraphs(text: string): string {
  const paragraphs = [...text.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)];
  if (paragraphs.length === 0 || paragraphs.map((p) => p[0]).join('') !== text) return text;
  return paragraphs.map((p) => p[1]).join('<br>');
}

function listsToHtml(lists: NestedList[]): string {
  return lists
    .map((list) => {
      const tag = list.ordered ? 'ol' : 'ul';
      const open = list.ordered && list.start !== 1 ? `<ol start="${list.start}">` : `<${tag}>`;
      const items = list.items.map((li) => `<li>${unwrapParagraphs(li.text)}${listsToHtml(li.lists)}</li>`).join('');
      return `${open}${items}</${tag}>`;
    })
    .join('');
}

/**
 * Bring an item's nested-list HTML to canonical form (drops the `<p>` wrappers
 * Tiptap puts inside `<li>`, joining several paragraphs with `<br>`).
 * Idempotent; items without a well-formed trailing list block are unchanged.
 */
export function normalizeListItem(item: string): string {
  const { text, lists } = splitListItem(item);
  return lists ? text + listsToHtml(lists) : item;
}

/**
 * Inline markdown -> HTML as used for item content alongside nested lists
 * (by the importer) and for rendering markdown list items.
 */
/**
 * Inline content of a heading or list item -> HTML. Content holding HTML
 * (editor output, nested lists) passes through; markdown (from import) is
 * converted with code spans kept literal, so text like "Use `<ul>`" is not
 * treated as markup. Shared by the renderer and the in-place editor so both
 * show the same formatting.
 */
export function inlineContentToHtml(text: string): string {
  return /<[a-z][\s\S]*>/i.test(text.replace(/`[^`]*`/g, '')) ? text : inlineMarkdownToHtml(text);
}

export function inlineMarkdownToHtml(text: string): string {
  // Code spans are literal: set them aside (escaped) so neither emphasis nor
  // markup such as `<ul>` inside them is interpreted
  const codes: string[] = [];
  let html = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/\[([^\][]+)\]\(([^()\s]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
  return html;
}
