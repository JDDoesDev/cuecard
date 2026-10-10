import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

/**
 * Markdown form of rich-text (editor HTML) text-element content.
 *
 * Text elements edited in the app store HTML (`<p>…</p>`, tables, …). When
 * that HTML only uses constructs markdown can express — paragraphs with
 * bold/italic/strike/code/links/hard breaks, and simple tables (header row,
 * no merged cells, inline-only cells) — it is exported as readable markdown
 * (`**b**`, `[text](url)`, GFM pipe tables) and converted back on import.
 *
 * - htmlToRichMarkdown: canonical editor HTML -> markdown, or null when the
 *   HTML holds anything markdown cannot express (spans with styles, underline,
 *   alignment, line height, indent, merged cells, empty paragraphs, …).
 * - richMarkdownToHtml: markdown -> canonical editor HTML (CommonMark + GFM
 *   parse, then a small mdast renderer), or null for unsupported markdown.
 *
 * The serializer only uses the markdown form when
 * richMarkdownToHtml(htmlToRichMarkdown(html)) === html, so export stays lossless.
 */

// ============================================================================
// HTML -> markdown (strict tokenizer over the canonical editor HTML)
// ============================================================================

type Token = { kind: 'open'; tag: string; href?: string } | { kind: 'close'; tag: string } | { kind: 'text'; text: string };

const TAG_RE = /<(\/?)([a-z]+)((?:\s+[a-z-]+="[^"]*")*)\s*>/gy;
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: '\u00a0' };
const INLINE_TAGS = new Set(['strong', 'em', 's', 'code', 'a', 'br']);
const BLOCK_TAGS = new Set(['p', 'table', 'tbody', 'tr', 'th', 'td']);

function decodeEntities(text: string): string | null {
  let ok = true;
  const out = text.replace(/&([a-z]+|#\d+);?/gi, (_m, name: string) => {
    const value = ENTITY[name.toLowerCase()];
    if (value === undefined) ok = false;
    return value ?? '';
  });
  return ok ? out : null;
}

function tokenize(html: string): Token[] | null {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < html.length) {
    const lt = html.indexOf('<', pos);
    if (lt !== pos) {
      const raw = html.slice(pos, lt === -1 ? html.length : lt);
      const text = decodeEntities(raw);
      if (text === null) return null;
      tokens.push({ kind: 'text', text });
      if (lt === -1) break;
      pos = lt;
    }
    TAG_RE.lastIndex = pos;
    const m = TAG_RE.exec(html);
    if (!m) return null;
    pos = TAG_RE.lastIndex;
    const [, slash, tag, attrs] = m;
    if (!INLINE_TAGS.has(tag) && !BLOCK_TAGS.has(tag)) return null;
    if (slash) {
      tokens.push({ kind: 'close', tag });
      continue;
    }
    let href: string | undefined;
    if (attrs.trim()) {
      const hrefMatch = /^\s+href="([^"]*)"$/.exec(attrs);
      if (tag !== 'a' || !hrefMatch) return null;
      const decoded = decodeEntities(hrefMatch[1]);
      if (decoded === null) return null;
      href = decoded;
    } else if (tag === 'a') {
      return null;
    }
    tokens.push({ kind: 'open', tag, href });
    if (tag === 'br') tokens.push({ kind: 'close', tag });
  }
  return tokens;
}

/** Characters escaped everywhere in markdown text. */
const ALWAYS_ESCAPE = /[\\`*_[\]<>~|]/g;

function escapeText(text: string): string {
  return text
    .replace(ALWAYS_ESCAPE, (c) => `\\${c}`)
    .replace(/&(?=#?[a-z0-9]+;)/gi, '\\&');
}

/** Escape block markers (heading, list, setext, ordered list) at the start of each line. */
function escapeLineStarts(md: string): string {
  return md
    .split('\n')
    .map((line) => line.replace(/^[#\-+=]/, (c) => `\\${c}`).replace(/^(\d+)([.)])/, '$1\\$2'))
    .join('\n');
}

class Reader {
  pos = 0;
  constructor(private tokens: Token[]) {}
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  done(): boolean {
    return this.pos >= this.tokens.length;
  }
}

const MARK_MD: Record<string, string> = { strong: '**', em: '*', s: '~~' };

/** Inline content until the closing `endTag`; null if not representable. */
function inlineMarkdown(r: Reader, endTag: string, inTable: boolean): string | null {
  let md = '';
  for (;;) {
    const t = r.next();
    if (!t) return null;
    if (t.kind === 'close') return t.tag === endTag ? md : null;
    if (t.kind === 'text') {
      if (t.text.includes('\n')) return null;
      md += escapeText(t.text);
      continue;
    }
    switch (t.tag) {
      case 'br':
        r.next();
        if (inTable) return null;
        md += '\\\n';
        break;
      case 'strong':
      case 'em':
      case 's': {
        const inner = inlineMarkdown(r, t.tag, inTable);
        if (!inner || /^\s|\s$/.test(inner) || inner.endsWith('\\\n')) return null;
        md += `${MARK_MD[t.tag]}${inner}${MARK_MD[t.tag]}`;
        break;
      }
      case 'code': {
        const text = r.next();
        if (text?.kind !== 'text' || r.next()?.kind !== 'close') return null;
        if (/[`\n]/.test(text.text) || /^\s|\s$/.test(text.text) || text.text === '') return null;
        // GFM: a pipe in a table cell must be escaped even inside code
        md += `\`${inTable ? text.text.replace(/\|/g, '\\|') : text.text}\``;
        break;
      }
      case 'a': {
        const href = t.href ?? '';
        if (!href || /[\s()<>\\]/.test(href)) return null;
        const inner = inlineMarkdown(r, 'a', inTable);
        if (!inner) return null;
        md += `[${inner}](${href})`;
        break;
      }
      default:
        return null;
    }
  }
}

function tableMarkdown(r: Reader): string | null {
  const open = r.next();
  if (open?.kind !== 'open' || open.tag !== 'table') return null;
  const tbody = r.next();
  if (tbody?.kind !== 'open' || tbody.tag !== 'tbody') return null;
  const rows: string[][] = [];
  for (;;) {
    const t = r.next();
    if (!t) return null;
    if (t.kind === 'close' && t.tag === 'tbody') break;
    if (t.kind !== 'open' || t.tag !== 'tr') return null;
    const cellTag = rows.length === 0 ? 'th' : 'td';
    const cells: string[] = [];
    for (;;) {
      const c = r.next();
      if (!c) return null;
      if (c.kind === 'close' && c.tag === 'tr') break;
      if (c.kind !== 'open' || c.tag !== cellTag) return null;
      const inner = inlineMarkdown(r, cellTag, true);
      if (inner === null) return null;
      cells.push(inner);
    }
    if (cells.length === 0 || (rows.length > 0 && cells.length !== rows[0].length)) return null;
    rows.push(cells);
  }
  const close = r.next();
  if (close?.kind !== 'close' || close.tag !== 'table' || rows.length === 0) return null;
  const line = (cells: string[]) => `|${cells.map((c) => (c ? ` ${c} ` : '  ')).join('|')}|`;
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n');
}

/** Canonical rich-text HTML -> markdown, or null when markdown cannot express it. */
export function htmlToRichMarkdown(html: string): string | null {
  const tokens = tokenize(html);
  if (!tokens || tokens.length === 0) return null;
  const r = new Reader(tokens);
  const blocks: string[] = [];
  while (!r.done()) {
    const t = r.peek()!;
    if (t.kind !== 'open') return null;
    if (t.tag === 'p') {
      r.next();
      const md = inlineMarkdown(r, 'p', false);
      if (!md || /^\s|\s$/.test(md) || md.endsWith('\\\n')) return null;
      blocks.push(escapeLineStarts(md));
    } else if (t.tag === 'table') {
      const md = tableMarkdown(r);
      if (md === null) return null;
      blocks.push(md);
    } else {
      return null;
    }
  }
  return blocks.join('\n\n');
}

// ============================================================================
// Markdown -> HTML (remark parse, minimal canonical renderer)
// ============================================================================

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\u00a0/g, '&nbsp;');
}

function renderInline(nodes: MdNode[] | undefined): string | null {
  let html = '';
  for (const node of nodes ?? []) {
    let part: string | null;
    switch (node.type) {
      case 'text':
        part = escapeHtmlText(node.value ?? '');
        break;
      case 'strong':
      case 'emphasis':
      case 'delete': {
        const tag = node.type === 'strong' ? 'strong' : node.type === 'emphasis' ? 'em' : 's';
        const inner = renderInline(node.children);
        part = inner === null ? null : `<${tag}>${inner}</${tag}>`;
        break;
      }
      case 'inlineCode':
        part = `<code>${escapeHtmlText(node.value ?? '')}</code>`;
        break;
      case 'link': {
        if (node.title) return null;
        const inner = renderInline(node.children);
        part = inner === null ? null : `<a href="${escapeHtmlAttr(node.url ?? '')}">${inner}</a>`;
        break;
      }
      case 'break':
        part = '<br>';
        break;
      default:
        return null;
    }
    if (part === null) return null;
    html += part;
  }
  return html;
}

const processor = unified().use(remarkParse).use(remarkGfm);

/** Markdown (as produced by htmlToRichMarkdown) -> canonical rich-text HTML, or null. */
export function richMarkdownToHtml(markdown: string): string | null {
  const tree = processor.parse(markdown) as unknown as MdNode;
  let html = '';
  for (const block of tree.children ?? []) {
    if (block.type === 'paragraph') {
      const inner = renderInline(block.children);
      if (inner === null) return null;
      html += `<p>${inner}</p>`;
    } else if (block.type === 'table') {
      // Column alignment (:---:) has no place in the canonical cell form:
      // not convertible (the importer keeps the markdown and warns)
      if ((block as MdNode & { align?: Array<string | null> }).align?.some((a) => a)) return null;
      const rows = (block.children ?? []).map((row, i) => {
        const tag = i === 0 ? 'th' : 'td';
        const cells = (row.children ?? []).map((cell) => {
          const inner = renderInline(cell.children);
          return inner === null ? null : `<${tag}>${inner}</${tag}>`;
        });
        return cells.includes(null) ? null : `<tr>${cells.join('')}</tr>`;
      });
      if (rows.includes(null)) return null;
      html += `<table><tbody>${rows.join('')}</tbody></table>`;
    } else {
      return null;
    }
  }
  return html || null;
}
