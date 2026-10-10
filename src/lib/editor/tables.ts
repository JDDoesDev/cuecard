/**
 * Tables in text elements.
 *
 * Stored (canonical) form, produced from Tiptap's HTML by canonicalizeTables:
 *
 *   <table><tbody><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td>3</td></tr></tbody></table>
 *
 * - Tiptap's render-only noise is dropped: the table's min-width/width style,
 *   the <colgroup> it derives from the cells, and colspan="1" / rowspan="1".
 * - A cell holding exactly one attribute-less paragraph stores its inline
 *   content directly (Tiptap wraps it in <p> again when loading).
 * - Merged cells keep colspan/rowspan > 1; resized columns keep `colwidth`.
 *
 * The form is a fixed point of load -> getHTML -> canonicalize, so editing
 * sessions never churn stored content, and simple tables convert to and from
 * GFM pipe tables exactly (see src/lib/editor/richTextMarkdown.ts).
 */

/** Canonicalize every table under `root` in place. */
export function canonicalizeTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    table.removeAttribute('style');
    if (!table.getAttribute('class')) table.removeAttribute('class');
    for (const colgroup of Array.from(table.querySelectorAll(':scope > colgroup'))) colgroup.remove();
    for (const cell of Array.from(table.querySelectorAll<HTMLElement>('td, th'))) {
      if (cell.closest('table') !== table) continue;
      for (const attr of ['colspan', 'rowspan']) {
        const value = cell.getAttribute(attr);
        if (value !== null && Number(value) <= 1) cell.removeAttribute(attr);
      }
      const only = cell.children.length === 1 ? cell.firstElementChild : null;
      if (
        only?.tagName === 'P' &&
        only.attributes.length === 0 &&
        cell.childNodes.length === 1
      ) {
        only.replaceWith(...Array.from(only.childNodes));
      }
    }
  }
}

/** Drop Tiptap's trailing empty paragraph after a final table (TrailingNode re-adds it on load). */
export function dropTrailingParagraphAfterTable(body: HTMLElement): void {
  const last = body.lastElementChild;
  if (
    last?.tagName === 'P' &&
    last.attributes.length === 0 &&
    last.childNodes.length === 0 &&
    last.previousElementSibling?.tagName === 'TABLE'
  ) {
    last.remove();
  }
}
