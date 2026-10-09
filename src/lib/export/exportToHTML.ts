import type { Presentation } from '@/types/presentation';
import type { SlideElement } from '@/types/slide';

/**
 * Export a presentation to a self-contained HTML file.
 *
 * Generates a complete HTML document with:
 * - Inline CSS (theme variables, slide styles)
 * - Static HTML rendering of all slides
 * - JavaScript for keyboard navigation
 * - Fallback for no-JS environments
 *
 * Note: Uses CDN for fonts (requires internet). All other content is embedded.
 */
export function exportToHTML(presentation: Presentation, theme = 'default'): string {
  const themeVars = getThemeVariables(theme);
  const slidesHTML = presentation.slides
    .map((slide, index) => renderSlideHTML(slide, index))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(presentation.title)}</title>

  <!-- Google Fonts CDN (requires internet) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Fira+Code:wght@400;700&family=Playfair+Display:wght@400;700&family=Source+Sans+3:wght@400;700&display=swap" rel="stylesheet">

  <style>
    /* Theme Variables */
    ${themeVars}

    /* Base Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-body);
      background: #000;
      color: var(--color-text-primary);
      overflow: hidden;
    }

    /* Slide Container — letterboxed to 16:9 so it fills whatever screen it is
       shown on without distorting element positions */
    .presentation {
      position: absolute;
      inset: 0;
      margin: auto;
      width: min(100vw, calc(100vh * 16 / 9));
      height: min(100vh, calc(100vw * 9 / 16));
      overflow: hidden;
    }

    .slide {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      background: var(--color-bg-primary);
      color: var(--color-text-primary);

      /* Type and spacing scale with the slide width (1000px ≈ nominal px),
         matching the in-app [data-slide-container] rules */
      container-type: inline-size;
      --font-size-xs: 1.6cqw;
      --font-size-sm: 1.8cqw;
      --font-size-base: 2cqw;
      --font-size-lg: 2.2cqw;
      --font-size-xl: 2.6cqw;
      --font-size-2xl: 3cqw;
      --font-size-3xl: 3.6cqw;
      --font-size-4xl: 4.2cqw;
      --font-size-5xl: 5.4cqw;
      --space-xs: 0.4cqw;
      --space-sm: 0.8cqw;
      --space-md: 1.6cqw;
      --space-lg: 2.4cqw;
      --space-xl: 3.2cqw;
      --space-2xl: 4.8cqw;
      --space-3xl: 6.4cqw;
    }

    .slide.active {
      display: block;
    }

    /* Element Positioning */
    .element {
      position: absolute;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* Element Styles */
    .heading {
      font-family: var(--font-heading);
      font-weight: 700;
      margin: 0;
      color: var(--color-text-primary);
      line-height: 1.2;
    }

    .heading[data-level='1'] {
      font-size: var(--font-size-5xl);
    }

    .heading[data-level='2'] {
      font-size: var(--font-size-3xl);
      font-weight: 600;
    }

    .heading[data-level='3'] {
      font-size: var(--font-size-2xl);
      font-weight: 600;
    }

    .text {
      font-family: var(--font-body);
      font-size: var(--font-size-xl);
      color: var(--color-text-primary);
      white-space: pre-wrap;
      line-height: 1.6;
      margin: 0;
    }

    .list {
      font-family: var(--font-body);
      font-size: var(--font-size-xl);
      color: var(--color-text-primary);
      line-height: 1.8;
      margin: 0;
      padding-left: var(--space-xl);
    }

    .list li {
      margin-bottom: var(--space-xs);
    }

    .code-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      border-radius: var(--radius-md);
      background: var(--color-code-bg);
      padding: var(--space-md);
    }

    .code {
      font-family: var(--font-code);
      font-size: var(--font-size-base);
      color: var(--color-code-text);
      white-space: pre;
      line-height: 1.5;
    }

    .image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .image[data-fit='cover'] {
      object-fit: cover;
    }

    .video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border: none;
    }

    /* Navigation UI */
    .nav-controls {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: var(--font-body);
      font-size: 14px;
      z-index: 1000;
    }

    /* No-JS Fallback */
    .no-js-warning {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      color: #000;
      padding: 2rem;
      border-radius: 8px;
      text-align: center;
      z-index: 2000;
    }
  </style>
</head>
<body data-theme="${theme}">
  <noscript>
    <div class="no-js-warning">
      <h2>JavaScript Required</h2>
      <p>This presentation requires JavaScript for navigation.</p>
      <p>Please enable JavaScript to view the slides.</p>
    </div>
  </noscript>

  <div class="presentation">
${slidesHTML}
  </div>

  <div class="nav-controls">
    <span id="slide-counter">1 / ${presentation.slides.length}</span>
  </div>

  <script>
    // Presentation Navigation
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const totalSlides = slides.length;
    const counter = document.getElementById('slide-counter');

    function showSlide(index) {
      // Clamp index
      if (index < 0) index = 0;
      if (index >= totalSlides) index = totalSlides - 1;

      // Hide all slides
      slides.forEach(slide => slide.classList.remove('active'));

      // Show current slide
      if (slides[index]) {
        slides[index].classList.add('active');
        currentSlide = index;
        counter.textContent = (currentSlide + 1) + ' / ' + totalSlides;
      }
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          showSlide(currentSlide + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          showSlide(currentSlide - 1);
          break;
        case 'Home':
          e.preventDefault();
          showSlide(0);
          break;
        case 'End':
          e.preventDefault();
          showSlide(totalSlides - 1);
          break;
      }
    });

    // Mouse click navigation
    document.addEventListener('click', (e) => {
      const x = e.clientX;
      const width = window.innerWidth;

      // Click left half to go back, right half to go forward
      if (x < width / 2) {
        showSlide(currentSlide - 1);
      } else {
        showSlide(currentSlide + 1);
      }
    });

    // Initialize
    showSlide(0);
  </script>
</body>
</html>`;
}

/**
 * Render a single slide as HTML.
 */
function renderSlideHTML(slide: any, index: number): string {
  const elementsHTML = slide.elements
    .map((element: SlideElement, idx: number) => renderElementHTML(element, idx))
    .join('\n      ');

  return `    <div class="slide" data-slide-index="${index}">
${elementsHTML || '      <div class="element" style="left: 50%; top: 50%; transform: translate(-50%, -50%); color: var(--color-text-secondary); font-style: italic;">Empty Slide</div>'}
    </div>`;
}

/**
 * Render a single element as HTML.
 */
function renderElementHTML(element: SlideElement, zIndex: number): string {
  const { position } = element;
  const style = `left: ${position.x}%; top: ${position.y}%; width: ${position.width}%; height: ${position.height}%; z-index: ${zIndex};`;

  let content = '';

  switch (element.type) {
    case 'heading':
      content = `<h${element.level} class="heading" data-level="${element.level}">${escapeHTML(element.content)}</h${element.level}>`;
      break;

    case 'text':
      content = `<p class="text">${escapeHTML(element.content)}</p>`;
      break;

    case 'list':
      const tag = element.ordered ? 'ol' : 'ul';
      const items = element.items.map(item => `<li>${escapeHTML(item)}</li>`).join('');
      content = `<${tag} class="list">${items}</${tag}>`;
      break;

    case 'code':
      content = `<div class="code-container"><pre class="code">${escapeHTML(element.code)}</pre></div>`;
      break;

    case 'image':
      const fit = element.objectFit || 'contain';
      content = `<img class="image" src="${escapeHTML(element.url)}" alt="${escapeHTML(element.alt || '')}" data-fit="${fit}" />`;
      break;

    case 'video':
      if (element.url.includes('youtube.com') || element.url.includes('youtu.be')) {
        const videoId = extractYouTubeId(element.url);
        content = `<iframe class="video" src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        content = `<video class="video" src="${escapeHTML(element.url)}" controls></video>`;
      }
      break;

    case 'rectangle':
      const rectFill = element.fill || 'transparent';
      const rectStroke = element.stroke || '#333';
      const rectStrokeWidth = element.strokeWidth || 2;
      const rectRadius = element.cornerRadius || 0;
      content = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${rectFill}" stroke="${rectStroke}" stroke-width="${rectStrokeWidth}" rx="${rectRadius}" />
      </svg>`;
      break;

    case 'circle':
      const circleFill = element.fill || 'transparent';
      const circleStroke = element.stroke || '#333';
      const circleStrokeWidth = element.strokeWidth || 2;
      content = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="${circleFill}" stroke="${circleStroke}" stroke-width="${circleStrokeWidth}" />
      </svg>`;
      break;

    case 'line':
      const lineStroke = element.stroke || '#333';
      const lineStrokeWidth = element.strokeWidth || 2;
      content = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="${lineStroke}" stroke-width="${lineStrokeWidth}" />
      </svg>`;
      break;

    default:
      content = `<div>Unknown element type</div>`;
  }

  return `      <div class="element" style="${style}">
        ${content}
      </div>`;
}

/**
 * Get theme CSS variables as a string.
 */
function getThemeVariables(theme: string): string {
  const themes: Record<string, string> = {
    default: `
      --color-bg-primary: #ffffff;
      --color-bg-secondary: #f8f9fa;
      --color-bg-tertiary: #e9ecef;
      --color-text-primary: #1a1a2e;
      --color-text-secondary: #4a4a6a;
      --color-text-tertiary: #6c757d;
      --color-accent: #0066cc;
      --color-accent-hover: #0052a3;
      --color-accent-light: #e6f0ff;
      --color-code-bg: #1e1e2e;
      --color-code-text: #cdd6f4;
      --color-border: #dee2e6;
      --color-border-light: #f1f3f5;
      --font-heading: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-body: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-code: 'Fira Code', 'Courier New', monospace;
      --font-size-xs: 0.75rem;
      --font-size-sm: 0.875rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-2xl: 1.5rem;
      --font-size-3xl: 1.875rem;
      --font-size-4xl: 2.25rem;
      --font-size-5xl: 3rem;
      --space-xs: 0.25rem;
      --space-sm: 0.5rem;
      --space-md: 1rem;
      --space-lg: 1.5rem;
      --space-xl: 2rem;
      --space-2xl: 3rem;
      --space-3xl: 4rem;
      --radius-sm: 0.25rem;
      --radius-md: 0.5rem;
      --radius-lg: 0.75rem;
      --radius-xl: 1rem;
    `,
    dark: `
      --color-bg-primary: #1a1a2e;
      --color-bg-secondary: #16213e;
      --color-bg-tertiary: #0f3460;
      --color-text-primary: #f8f9fa;
      --color-text-secondary: #e9ecef;
      --color-text-tertiary: #ced4da;
      --color-accent: #4d9fff;
      --color-accent-hover: #3d8fe6;
      --color-accent-light: #1a4d7a;
      --color-code-bg: #0d1117;
      --color-code-text: #c9d1d9;
      --color-border: #30363d;
      --color-border-light: #21262d;
      --font-heading: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-body: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-code: 'Fira Code', 'Courier New', monospace;
      --font-size-xs: 0.75rem;
      --font-size-sm: 0.875rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-2xl: 1.5rem;
      --font-size-3xl: 1.875rem;
      --font-size-4xl: 2.25rem;
      --font-size-5xl: 3rem;
      --space-xs: 0.25rem;
      --space-sm: 0.5rem;
      --space-md: 1rem;
      --space-lg: 1.5rem;
      --space-xl: 2rem;
      --space-2xl: 3rem;
      --space-3xl: 4rem;
      --radius-sm: 0.25rem;
      --radius-md: 0.5rem;
      --radius-lg: 0.75rem;
      --radius-xl: 1rem;
    `,
    light: `
      --color-bg-primary: #fffef9;
      --color-bg-secondary: #faf8f3;
      --color-bg-tertiary: #f5f2ea;
      --color-text-primary: #2c2416;
      --color-text-secondary: #5a4d3a;
      --color-text-tertiary: #8b7d6b;
      --color-accent: #d4751e;
      --color-accent-hover: #b85f0f;
      --color-accent-light: #fef3e9;
      --color-code-bg: #2c2416;
      --color-code-text: #f5f2ea;
      --color-border: #e5e0d5;
      --color-border-light: #f0ebe0;
      --font-heading: 'Playfair Display', Georgia, serif;
      --font-body: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-code: 'Fira Code', 'Courier New', monospace;
      --font-size-xs: 0.75rem;
      --font-size-sm: 0.875rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-2xl: 1.5rem;
      --font-size-3xl: 1.875rem;
      --font-size-4xl: 2.25rem;
      --font-size-5xl: 3rem;
      --space-xs: 0.25rem;
      --space-sm: 0.5rem;
      --space-md: 1rem;
      --space-lg: 1.5rem;
      --space-xl: 2rem;
      --space-2xl: 3rem;
      --space-3xl: 4rem;
      --radius-sm: 0.25rem;
      --radius-md: 0.5rem;
      --radius-lg: 0.75rem;
      --radius-xl: 1rem;
    `,
  };

  return `
    :root {
      ${themes[theme] || themes.default}
    }
  `;
}

/**
 * Escape HTML special characters.
 */
function escapeHTML(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Extract YouTube video ID from URL.
 */
function extractYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^&\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return '';
}

/**
 * Export a presentation to HTML and trigger browser download.
 *
 * Creates a self-contained HTML file and downloads it with the
 * presentation title as the filename.
 */
export function downloadHTML(presentation: Presentation, theme?: string): void {
  const html = exportToHTML(presentation, theme);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${presentation.title || 'presentation'}.html`;
  anchor.click();

  URL.revokeObjectURL(url);
}
