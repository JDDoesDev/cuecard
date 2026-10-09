import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/light';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust';
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css';
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import php from 'react-syntax-highlighter/dist/esm/languages/hljs/php';
import twig from 'react-syntax-highlighter/dist/esm/languages/hljs/twig';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useRef, useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { SlideElement } from '@/types/slide';
import { getVisibleItemCount } from '@/lib/fragments';
import { scaleInlineFontSizes } from '@/lib/editor/fontSizeExtension';
import { ShapeRenderer } from './ShapeRenderer';
import styles from './ElementRenderer.module.css';

// Register languages for syntax highlighting
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('xml', xml);
SyntaxHighlighter.registerLanguage('html', xml);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('php', php);
SyntaxHighlighter.registerLanguage('twig', twig);

/**
 * Image component that restarts GIF animations on mount.
 * Appends a unique cache-busting fragment to the src so the browser
 * treats it as a fresh resource and replays the GIF from frame 0.
 * For blob: URLs (which don't support fragments), it mounts with no src
 * then sets it after a frame so the browser does a fresh decode.
 */
function GifRestartImg({ src, alt, className, dataFit }: {
  src: string; alt: string; className: string; dataFit: string;
}) {
  const isBlob = src.startsWith('blob:');
  const [ready, setReady] = useState(!isBlob);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!isBlob) return;
    // For blob URLs, delay setting src by one frame so the browser
    // does a fresh decode instead of resuming from a cached frame.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [isBlob]);

  // For non-blob URLs, append a unique fragment to bust the cache
  const finalSrc = ready
    ? isBlob ? src : `${src}#t=${Date.now()}`
    : undefined;

  return (
    <img ref={imgRef} src={finalSrc} alt={alt} className={className} data-fit={dataFit} />
  );
}

interface ElementRendererProps {
  element: SlideElement;
  visibleFragment?: number;
}

/**
 * Convert markdown inline formatting to HTML.
 * Handles bold, italic, inline code, strikethrough, and links.
 * Passes through content that is already HTML.
 */
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

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function getYouTubeEmbedUrl(url: string): string {
  if (url.includes('youtu.be/')) {
    const videoId = url.split('youtu.be/')[1]?.split('?')[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }
  if (url.includes('youtube.com/watch?v=')) {
    const videoId = url.split('v=')[1]?.split('&')[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }
  return url;
}

export function ElementRenderer({ element, visibleFragment }: ElementRendererProps) {
  switch (element.type) {
    case 'heading': {
      const headingStyle: React.CSSProperties = {};
      if (element.lineHeight) headingStyle.lineHeight = element.lineHeight;
      if (element.fontFamily) headingStyle.fontFamily = `'${element.fontFamily}', sans-serif`;
      const headingProps = {
        className: styles.heading,
        'data-level': element.level,
        style: Object.keys(headingStyle).length > 0 ? headingStyle : undefined,
        dangerouslySetInnerHTML: { __html: scaleInlineFontSizes(inlineMarkdownToHtml(element.content)) },
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
      const hasTextStyle = Object.keys(textStyle).length > 0;
      // Content may be HTML (from rich editor) or markdown (from import)
      const isHTML = /<[a-z][\s\S]*>/i.test(element.content);
      if (isHTML) {
        // If content has block-level tags already, render as-is
        const hasBlockTags = /<(?:p|div|table|ul|ol|h[1-6])\b/i.test(element.content);
        const html = hasBlockTags
          ? element.content
          : element.content.split('\n').map(line => `<p>${line || ''}</p>`).join('');
        return (
          <div
            className={styles.text}
            style={textStyle}
            dangerouslySetInnerHTML={{ __html: scaleInlineFontSizes(html) }}
          />
        );
      }
      // Plain text or markdown: render through Markdown component
      // This handles tables, multi-paragraph text, inline formatting, etc.
      // Single \n from Tiptap paragraph joins must become \n\n for Markdown paragraph breaks
      const markdownContent = scaleInlineFontSizes(element.content.split('\n').join('\n\n'));
      return (
        <div className={styles.text} style={textStyle}>
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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
      const hasListStyle = Object.keys(listStyle).length > 0;
      const itemCount = visibleFragment != null
        ? getVisibleItemCount(element, visibleFragment)
        : element.items.length;
      return (
        <ListTag className={styles.list} style={hasListStyle ? listStyle : undefined}>
          {element.items.map((item, idx) => {
            const itemVisible = idx < itemCount;
            return (
              <li
                key={idx}
                className={`${styles.listItem} ${styles.listItemFragment} ${itemVisible ? '' : styles.listItemHidden}`}
                dangerouslySetInnerHTML={{ __html: scaleInlineFontSizes(inlineMarkdownToHtml(item)) }}
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
            language={element.language}
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
      return (
        <GifRestartImg
          src={element.cachedUrl || element.url}
          alt={element.alt || ''}
          className={styles.image}
          dataFit={element.objectFit || 'contain'}
        />
      );

    case 'video': {
      const isYouTube = isYouTubeUrl(element.url);
      if (isYouTube) {
        return (
          <iframe
            src={getYouTubeEmbedUrl(element.url)}
            className={styles.video}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
      return <video src={element.url} controls className={styles.video} />;
    }

    case 'html':
      return (
        <div
          className={styles.htmlContainer}
          dangerouslySetInnerHTML={{ __html: element.htmlContent }}
        />
      );

    case 'rectangle':
    case 'circle':
    case 'line':
      return <ShapeRenderer element={element} />;
  }
}
