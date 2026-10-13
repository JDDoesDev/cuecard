import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { Root } from 'mdast';

/**
 * The editor schema has no image node, so an image inside a text paragraph
 * would be dropped on the first edit. Keep its markdown source as text
 * instead (paragraphs holding only images are imported as image elements).
 */
function keepImagesAsSource() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    visit(tree, (node, index, parent) => {
      if ((node.type !== 'image' && node.type !== 'imageReference') || !parent || index === undefined) return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return;
      parent.children[index] = { type: 'text', value: source.slice(start, end) };
      return SKIP;
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(keepImagesAsSource)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * Markdown source of an imported text element -> HTML for the in-place editor.
 *
 * Imported text elements keep their markdown source (rendered by
 * ElementRenderer with react-markdown + GFM). The editor must receive the same
 * structure as HTML, or the markdown syntax (`code`, *em*, …) shows up as
 * literal characters and is saved that way on the first edit. Inline HTML in
 * the markdown is passed through; Tiptap keeps only what its schema knows.
 */
export function markdownToEditorHtml(markdown: string): string {
  // Whitespace between blocks only adds empty text nodes for the editor
  return String(processor.processSync(markdown)).replace(/>\n+</g, '><').trim();
}
