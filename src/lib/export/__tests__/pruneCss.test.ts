// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Presentation } from '@/types/presentation';
import type { SlideElement } from '@/types/slide';
import universalStyles from '@/components/layouts/UniversalSlide.module.css';
import { pruneCss, splitSelectors, staticSelector } from '../pruneCss';
import { exportToHTML } from '../exportToHTML';

describe('pruneCss helpers', () => {
  it('splits selector lists on top-level commas only', () => {
    expect(splitSelectors('a, :is(b, c) d, [x="1,2"]')).toEqual(['a', ':is(b, c) d', '[x="1,2"]']);
  });

  it('strips pseudo-elements and state pseudo-classes', () => {
    expect(staticSelector('.a:hover::before')).toBe('.a');
    expect(staticSelector('.a > :focus-visible')).toBe('.a > *');
    expect(staticSelector(':hover')).toBe('*');
    expect(staticSelector('li:first-child:after')).toBe('li:first-child');
  });
});

describe('pruneCss', () => {
  const markup = '<section class="slide" data-slide-container data-theme="default"><div class="el"><h2>Hi</h2></div></section>';

  it('keeps matching rules, variable scopes and referenced keyframes; drops the rest', () => {
    const css = `
      :root { --x: 1px; }
      [data-theme='dark'] { --color-bg: #000; }
      [data-slide-container] { --font-size-base: 2cqw; }
      .el { color: red; animation: pop 1s ease; }
      .el h2::after { content: 'x'; }
      .el:hover { color: blue; }
      .toolbar { display: flex; animation: spin 1s; }
      .toolbar:hover, .panel::before { color: green; }
      @keyframes pop { from { opacity: 0; } to { opacity: 1; } }
      @keyframes spin { to { transform: rotate(1turn); } }
      @media (max-width: 600px) { .el { color: pink; } .toolbar { display: none; } }
      @media print { .sidebar { display: none; } }
      @font-face { font-family: 'Inter'; src: url(a.woff2); }
      @font-face { font-family: 'Lato'; src: url(b.woff2); }
    `;
    const out = pruneCss(css, markup, { theme: 'default', usedFamilies: new Set(['inter']) });
    expect(out).toContain('--x');
    expect(out).toContain('--color-bg');
    expect(out).toContain('--font-size-base');
    expect(out).toMatch(/\.el\s*\{[^}]*color: red/);
    expect(out).toContain('.el h2::after');
    expect(out).toContain('.el:hover');
    expect(out).toContain('@keyframes pop');
    expect(out).toContain('pink');
    expect(out).toContain('Inter');
    expect(out).not.toContain('.toolbar');
    expect(out).not.toContain('.panel');
    expect(out).not.toContain('spin');
    expect(out).not.toContain('.sidebar');
    expect(out).not.toContain('@media print');
    expect(out).not.toContain('Lato');
  });

  it('keeps all @keyframes when a kept rule animates via var()', () => {
    const css = '.el { animation: var(--anim); } @keyframes a { to { opacity: 1; } } @keyframes b { to { opacity: 0; } }';
    const out = pruneCss(css, markup);
    expect(out).toContain('@keyframes a');
    expect(out).toContain('@keyframes b');
  });

  it('returns the CSS unchanged when it has no parseable rules', () => {
    expect(pruneCss('   ', markup)).toBe('   ');
  });
});

// ---------------------------------------------------------------------------
// Sample deck: the app's real stylesheets (CSS modules with the same class
// names the exporter emits under vitest) pruned against an exported deck.
// ---------------------------------------------------------------------------

const srcDir = path.resolve(__dirname, '../../..');
const moduleProxies = import.meta.glob<{ default: Record<string, string> }>('/src/**/*.module.css', { eager: true });

function hashModuleCss(css: string, mod: Record<string, string>): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/([^{};]*)\{/g, (m, pre: string) =>
      pre.trim().startsWith('@') ? m : pre.replace(/\.([A-Za-z_][\w-]*)/g, (_c, name: string) => `.${mod[name]}`) + '{');
}

function appCss(): string {
  let css = fs.readFileSync(path.join(srcDir, 'styles/global.css'), 'utf8').replace(/@import[^;]+;/g, '');
  for (const [file, mod] of Object.entries(moduleProxies)) {
    css += '\n' + hashModuleCss(fs.readFileSync(path.join(srcDir, '..', file), 'utf8'), mod.default);
  }
  return css;
}

describe('exported app CSS', () => {
  it('is substantially smaller but keeps slide rendering rules and theme vars', async () => {
    const pos = { x: 10, y: 10, width: 50, height: 20 };
    const elements: SlideElement[] = [
      { id: 'h', type: 'heading', position: pos, content: 'Title', level: 1 },
      { id: 't', type: 'text', position: pos, content: 'Hello **bold**' },
      { id: 'l', type: 'list', position: pos, items: ['one', 'two'], ordered: false },
      { id: 'c', type: 'code', position: pos, code: 'const a = 1;', language: 'javascript' },
      { id: 'r', type: 'rectangle', position: pos, fill: '#ff0000' },
      { id: 'x', type: 'html', position: pos, htmlContent: '<b>hi</b>' },
    ];
    const deck = { title: 'Deck', slides: [{ id: 's1', layout: 'freestyle', transition: 'none', elements }] } as Presentation;
    const css = appCss();
    const html = await exportToHTML(deck, { collectedCss: { css, fontFaces: [], links: [], themeBlocks: {} } });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pruned = doc.getElementById('xdeck-app-css')!.textContent!;

    console.log(`[pruneCss] sample deck app CSS: ${css.length} -> ${pruned.length} bytes`);
    expect(pruned.length).toBeLessThan(css.length * 0.4);
    // slide rendering: element/container classes and the slide scaling vars
    expect(pruned).toContain(`.${universalStyles.element}`);
    expect(pruned).toContain(`.${universalStyles.container}`);
    expect(pruned).toContain('[data-slide-container]');
    expect(pruned).toContain('--font-size-base');
    // editor UI is gone
    const editorLayout = Object.entries(moduleProxies).find(([f]) => f.endsWith('/EditorLayout.module.css'))![1].default;
    const editorClass = fs.readFileSync(path.join(srcDir, 'components/editor/EditorLayout.module.css'), 'utf8').match(/\.([A-Za-z_][\w-]*)/)![1];
    expect(css).toContain(`.${editorLayout[editorClass]}`);
    expect(pruned).not.toContain(`.${editorLayout[editorClass]}`);
  });
});
