import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

/**
 * Markdown source of an imported text element -> HTML for the in-place editor.
 *
 * Imported text elements keep their markdown source (rendered by
 * ElementRenderer with react-markdown + GFM). The editor must receive the same
 * structure as HTML, or the markdown syntax (`code`, *em*, …) shows up as
 * literal characters and is saved that way on the first edit. Inline HTML in
 * the markdown is passed through; Tiptap keeps only what its schema knows.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

export function markdownToEditorHtml(markdown: string): string {
  // Whitespace between blocks only adds empty text nodes for the editor
  return String(processor.processSync(markdown)).replace(/>\n+</g, '><').trim();
}
