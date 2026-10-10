import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { sanitizeHtml, sanitizeUrl } from '@/lib/security/sanitize';
import { HtmlFrame } from './HtmlFrame';
import { parseYouTubeUrl, getYouTubeEmbedUrl } from './youtube';
import { rehypeSanitizeRaw } from './rehypeSanitizeRaw';
import type { SlideElement, ImageElement } from '@/types/slide';
import { cacheImageBlob } from '@/lib/media/imageCaching';
import { presentationStore } from '@/store/presentationStore';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { getVisibleItemCount } from '@/lib/fragments';
import { scaleInlineFontSizes } from '@/lib/editor/fontSizeExtension';
import { getElementTextAlign } from '@/lib/editor/textAlign';
import { inlineMarkdownToHtml as listInlineMarkdownToHtml } from '@/lib/editor/listItems';
import { SyntaxHighlighter, resolveCodeLanguage } from '@/lib/code/languages';
import { ShapeRenderer } from './ShapeRenderer';
import styles from './ElementRenderer.module.css';

/**
 * Image component that restarts GIF animations when the slide is entered.
 * The restart token is created once per mount (i.e. per slide visit, since
 * elements remount when the slide changes) — re-renders keep the same src,
 * so images are not reloaded on every render.
 * http(s)/relative URLs get a stable `#t=<token>` fragment so the browser
 * treats each visit as a fresh resource and replays from frame 0.
 * blob:/data: URLs (no fragment support) mount with no src and set it after
 * a frame so the browser does a fresh decode.
 */
function GifRestartImg({ src, alt, className, dataFit, onError }: {
  src: string; alt: string; className: string; dataFit: string; onError?: () => void;
}) {
  const deferSrc = src.startsWith('blob:') || src.startsWith('data:');
  const [ready, setReady] = useState(!deferSrc);
  const [restartToken] = useState(() => Date.now().toString(36));

  useEffect(() => {
    if (!deferSrc) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [deferSrc]);

  const finalSrc = !src || !ready
    ? undefined
    : deferSrc || src.includes('#') ? src : `${src}#t=${restartToken}`;

  return (
    <img src={finalSrc} alt={alt} className={className} data-fit={dataFit} onError={onError} />
  );
}

/**
 * An image is "missing" when it references a cached blob that could not be
 * restored (cacheKey without cachedUrl and no fetchable http(s)/data: url),
 * or when the <img> fails to load.
 */
function isImageMissing(el: ImageElement): boolean {
  return !!el.cacheKey && !el.cachedUrl && !/^(https?:|data:)/i.test(el.url.trim());
}

/** Prompt for a replacement file and relink the image element in the store. */
function relinkImage(elementId: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { cacheKey, blobUrl } = await cacheImageBlob(file, file.name);
      const state = presentationStore.getState();
      const slideIndex = state.presentation?.slides.findIndex((s) => s.elements.some((e) => e.id === elementId)) ?? -1;
      if (slideIndex < 0) return;
      state.updateElement(slideIndex, elementId, { cacheKey, cachedUrl: blobUrl, url: file.name } as Partial<SlideElement>);
    } catch (err) {
      console.error('Failed to relink image:', err);
    }
  };
  input.click();
}

function ImageView({ element, staticExport }: { element: ImageElement; staticExport?: boolean }) {
  const { mode: urlMode } = usePresentationMode();
  const mode = staticExport ? 'export' : urlMode;
  const src = element.cachedUrl || element.url;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const missing = isImageMissing(element) || failedSrc === src;

  if (missing) {
    const label = `Missing image: ${element.url}`;
    if (mode !== 'edit') {
      return <div className={styles.image} data-missing-image role="img" aria-label={label} style={MISSING_STYLE}>{label}</div>;
    }
    return (
      <button
        type="button"
        className={styles.image}
        data-missing-image
        style={{ ...MISSING_STYLE, cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); relinkImage(element.id); }}
        title="Choose a replacement image file"
      >
        {label} — click to relink
      </button>
    );
  }

  return (
    <GifRestartImg
      src={sanitizeUrl(src)}
      alt={element.alt || ''}
      className={styles.image}
      dataFit={element.objectFit || 'contain'}
      onError={() => setFailedSrc(src)}
    />
  );
}

const MISSING_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%',
  padding: '0.5em', border: '2px dashed var(--color-border, #999)', background: 'var(--color-bg-secondary, #f4f4f4)',
  color: 'var(--color-text-secondary, #666)', font: 'inherit', fontSize: 'var(--font-size-sm)', textAlign: 'center',
  wordBreak: 'break-all', boxSizing: 'border-box',
};

/** Sanitize rich-text HTML right before it is injected into the DOM. */
function safeHtml(html: string): string {
  return withExternalLinkTargets(sanitizeHtml(scaleInlineFontSizes(html)));
}

/**
 * List item -> HTML. Items holding HTML (editor output, nested lists) pass
 * through; markdown items are converted with code spans kept literal, so text
 * like "Use `<ul>`" is not treated as markup.
 */
function listItemHtml(item: string): string {
  return /<[a-z][\s\S]*>/i.test(item.replace(/`[^`]*`/g, '')) ? item : listInlineMarkdownToHtml(item);
}

/** External links open in a new tab (stored content keeps plain `<a href>`). */
export function withExternalLinkTargets(html: string): string {
  if (!/<a\b/i.test(html) || typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let changed = false;
  for (const a of Array.from(tpl.content.querySelectorAll('a[href]'))) {
    if (a.hasAttribute('target') || !/^https?:/i.test(a.getAttribute('href')!.trim())) continue;
    a.setAttribute('target', '_blank');
    if (!a.hasAttribute('rel')) a.setAttribute('rel', 'noopener noreferrer');
    changed = true;
  }
  return changed ? tpl.innerHTML : html;
}

interface ElementRendererProps {
  element: SlideElement;
  visibleFragment?: number;
  /** Static HTML export: render non-interactive placeholders (no relink button). */
  staticExport?: boolean;
}

/**
 * Convert markdown inline formatting to HTML.
 * Handles bold, italic, inline code, strikethrough, and links.
 * Passes through content that is already HTML.
 */
/** Tiptap / legacy rich-text HTML: starts with a block-level tag. */
export function isRichTextHtml(content: string): boolean {
  return /^\s*<(?:p|div|table|ul|ol|h[1-6]|blockquote|pre)\b/i.test(content);
}

function inlineMarkdownToHtml(text: string): string {
  // If content already contains HTML tags, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  let result = text;
  // Bold+italic (must come before bold and italic)
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}


export function ElementRenderer({ element, visibleFragment, staticExport }: ElementRendererProps) {
  switch (element.type) {
    case 'heading': {
      const headingStyle: React.CSSProperties = {};
      if (element.lineHeight) headingStyle.lineHeight = element.lineHeight;
      if (element.fontFamily) headingStyle.fontFamily = `'${element.fontFamily}', sans-serif`;
      if (getElementTextAlign(element) !== 'left') headingStyle.textAlign = getElementTextAlign(element);
      const headingProps = {
        className: styles.heading,
        'data-level': element.level,
        style: Object.keys(headingStyle).length > 0 ? headingStyle : undefined,
        dangerouslySetInnerHTML: { __html: safeHtml(inlineMarkdownToHtml(element.content)) },
      };
      switch (element.level) {
        case 1: return <h1 {...headingProps} />;
        case 2: return <h2 {...headingProps} />;
        case 3: return <h3 {...headingProps} />;
        case 4: return <h4 {...headingProps} />;
        case 5: return <h5 {...headingProps} />;
        case 6: return <h6 {...headingProps} />;
      }
      return <h1 {...headingProps} />;
    }

    case 'text': {
      const textStyle: React.CSSProperties = {};
      if (element.lineHeight) textStyle.lineHeight = element.lineHeight;
      if (element.fontFamily) textStyle.fontFamily = `'${element.fontFamily}', sans-serif`;
      if (getElementTextAlign(element) !== 'left') textStyle.textAlign = getElementTextAlign(element);
      const hasTextStyle = Object.keys(textStyle).length > 0;
      // Content is either Tiptap HTML (rich editor output always starts with a
      // block tag such as <p>) or the markdown source slice from import.
      // Markdown may itself contain inline HTML, so detection is by leading block tag.
      const isHTML = isRichTextHtml(element.content);
      if (isHTML) {
        const html = element.content;
        return (
          <div
            className={styles.text}
            style={textStyle}
            dangerouslySetInnerHTML={{ __html: safeHtml(html) }}
          />
        );
      }
      // Markdown source: render as-is with GFM semantics (tables, lists,
      // blank-line paragraphs, single newlines are soft breaks).
      const markdownContent = scaleInlineFontSizes(element.content);
      return (
        <div className={styles.text} style={textStyle}>
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitizeRaw]}>
            {markdownContent}
          </Markdown>
        </div>
      );
    }

    case 'list': {
      const ListTag = element.ordered ? 'ol' : 'ul';
      const listStyle: React.CSSProperties = {};
      if (element.lineHeight) listStyle.lineHeight = element.lineHeight;
      if (element.fontFamily) listStyle.fontFamily = `'${element.fontFamily}', sans-serif`;
      if (getElementTextAlign(element) !== 'left') {
        listStyle.textAlign = getElementTextAlign(element);
        // Keep bullets next to centered/right-aligned text
        if (listStyle.textAlign !== 'justify') listStyle.listStylePosition = 'inside';
      }
      const hasListStyle = Object.keys(listStyle).length > 0;
      const itemCount = visibleFragment != null
        ? getVisibleItemCount(element, visibleFragment)
        : element.items.length;
      return (
        <ListTag
          className={styles.list}
          style={hasListStyle ? listStyle : undefined}
          start={element.ordered && Number.isInteger(element.start) && element.start !== 1 ? element.start : undefined}
        >
          {element.items.map((item, idx) => {
            const itemVisible = idx < itemCount;
            return (
              <li
                key={idx}
                className={`${styles.listItem} ${styles.listItemFragment} ${itemVisible ? '' : styles.listItemHidden}`}
                dangerouslySetInnerHTML={{ __html: safeHtml(listItemHtml(item)) }}
              />
            );
          })}
        </ListTag>
      );
    }

    case 'code': {
      const highlightLines = element.highlightLines || [];
      return (
        <div className={styles.codeContainer}>
          <SyntaxHighlighter
            language={resolveCodeLanguage(element.language)}
            style={vs2015}
            showLineNumbers={true}
            wrapLines={true}
            lineProps={(lineNumber) => {
              const style: React.CSSProperties = {};
              if (highlightLines.includes(lineNumber)) {
                style.backgroundColor = 'rgba(255, 255, 0, 0.15)';
                style.borderLeft = '3px solid #ffeb3b';
                style.paddingLeft = '0.5em';
                style.display = 'block';
              }
              return { style };
            }}
            customStyle={{
              margin: 0,
              padding: 'var(--space-lg)',
              fontSize: 'var(--font-size-base)',
              borderRadius: 'var(--radius-md)',
              lineHeight: 1.6,
              height: '100%',
              boxSizing: 'border-box',
            }}
          >
            {element.code}
          </SyntaxHighlighter>
        </div>
      );
    }

    case 'image':
      return <ImageView element={element} staticExport={staticExport} />;

    case 'video': {
      const youtube = parseYouTubeUrl(element.url);
      if (youtube) {
        return (
          <iframe
            src={getYouTubeEmbedUrl(youtube)}
            className={styles.video}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        );
      }
      return <video src={sanitizeUrl(element.url) || undefined} controls className={styles.video} />;
    }

    case 'html':
      // Rendered in a sandboxed iframe (no scripts, opaque origin); see HtmlFrame.
      return <HtmlFrame html={element.htmlContent} className={styles.htmlContainer} />;

    case 'rectangle':
    case 'circle':
    case 'line':
      return <ShapeRenderer element={element} />;
  }
}
