import type { Presentation } from '@/types/presentation';
import { serializePresentation } from '@/lib/serializer/serializePresentation';
import { sanitizeFilename } from './exportUtils';

/**
 * Export a presentation to markdown format.
 *
 * Wraps the existing serializePresentation function to provide
 * a clear export API. The serializer handles all markdown generation.
 */
export function exportToMarkdown(presentation: Presentation): string {
  return serializePresentation(presentation);
}

/**
 * Export a presentation to markdown and trigger browser download.
 *
 * Creates a markdown file and downloads it with the presentation title
 * as the filename.
 */
export function downloadMarkdown(presentation: Presentation): void {
  const markdown = exportToMarkdown(presentation);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(presentation.title)}.md`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
