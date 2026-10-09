/**
 * Text element content helpers for the "rich HTML vs markdown" rendering rule.
 *
 * Current renderer rule (ElementRenderer): content that starts with a block tag
 * (<p>, <div>, …) is rich-text HTML; anything else is GFM markdown, where a
 * single newline is a soft break.
 *
 * Legacy rule (before that change): content with a block tag anywhere was raw
 * HTML; other HTML (inline tags) had each line wrapped in <p>; plain/markdown
 * text had every single newline turned into a paragraph break.
 */

const LEADING_BLOCK_RE = /^\s*<(?:p|div|table|ul|ol|h[1-6]|blockquote|pre)\b/i;
const ANY_BLOCK_RE = /<(?:p|div|table|ul|ol|h[1-6])\b/i;
const ANY_TAG_RE = /<[a-z][\s\S]*>/i;

/**
 * Convert text content saved under the legacy renderer rule into content that
 * renders the same under the current rule. Pure and idempotent for content
 * that is already rich HTML.
 */
export function migrateLegacyTextContent(content: string): string {
  if (!content) return content;
  if (LEADING_BLOCK_RE.test(content)) return content;
  if (ANY_TAG_RE.test(content)) {
    // Block HTML not at the start was rendered raw: keep it as one HTML block
    if (ANY_BLOCK_RE.test(content)) return `<div>${content}</div>`;
    // Inline HTML: each line was its own paragraph
    return content
      .split('\n')
      .map((line) => `<p>${line}</p>`)
      .join('');
  }
  // Plain text / markdown: each single newline was a paragraph break
  if (!content.includes('\n')) return content;
  return content.split('\n').join('\n\n');
}

/**
 * Split text element content into paragraph strings (inline HTML/markdown),
 * e.g. for converting a text element into a list or heading.
 */
export function textContentToLines(content: string): string[] {
  if (LEADING_BLOCK_RE.test(content) && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const lines: string[] = [];
    for (const child of Array.from(doc.body.children)) {
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        for (const li of Array.from(child.children)) lines.push(li.textContent?.trim() ?? '');
      } else {
        lines.push(child.innerHTML);
      }
    }
    return lines;
  }
  return content.split(/\n{2,}|\n/).map((s) => s.trim());
}

/** Build rich-text content from paragraph strings (inline HTML). */
export function linesToTextContent(lines: string[]): string {
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length === 0) return '';
  return lines.map((l) => `<p>${l}</p>`).join('');
}
