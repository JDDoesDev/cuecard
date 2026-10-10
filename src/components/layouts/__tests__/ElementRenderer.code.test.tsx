// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementRenderer } from '../ElementRenderer';
import { parsePresentationSync } from '@/lib/parser/parsePresentation';
import type { CodeElement } from '@/types/slide';

// One Dark keyword purple — its presence means grammar-aware highlighting ran.
const KEYWORD = 'style="color:#c678dd"';
const span = (color: string, text: string) => `<span style="color:${color}">${text}</span>`;

function renderFence(lang: string, code: string): string {
  const { presentation } = parsePresentationSync(`## Example\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`);
  const el = presentation.slides[0].elements.find((e) => e.type === 'code') as CodeElement;
  expect(el.language).toBe(lang);
  // Drop leftover token classes (e.g. hljs-function) so assertions match on color alone.
  return renderToStaticMarkup(<ElementRenderer element={el} />).replace(/ class="hljs-[^"]*"/g, '');
}

describe('fenced code block highlighting', () => {
  it('highlights ```php with the PHP grammar', () => {
    const html = renderFence('php', '<?php\nfunction greet($name) { return "Hi"; }');
    expect(html).toContain('class="language-php"');
    expect(html).toContain(`<span ${KEYWORD}>function</span>`);
    expect(html).toContain('$name</span>');
  });

  it('highlights ```javascript and its ```js alias the same way', () => {
    const code = 'const x = async () => await fetch(url);';
    const full = renderFence('javascript', code);
    const alias = renderFence('js', code);
    expect(full).toContain(`<span ${KEYWORD}>const</span>`);
    expect(alias.replace('language-javascript', '')).toBe(full.replace('language-javascript', ''));
  });

  it.each([
    ['ts', 'interface A { x: number }', 'interface'],
    ['PHP', 'echo $x;', 'echo'],
    ['java', 'public class A {}', 'public'],
    ['csharp', 'public class A {}', 'public'],
    ['ruby', 'def hi; end', 'def'],
    ['yml', 'key: true', 'true'],
    ['sh', 'if [ -f x ]; then echo; fi', 'if'],
  ])('highlights ```%s', (lang, code, keyword) => {
    expect(renderFence(lang, code)).toMatch(new RegExp(`<span style="color:#[0-9a-f]{6}">${keyword}</span>`));
  });

  it('colors tokens like VS Code One Dark Pro', () => {
    const php = renderFence('php', '<?php\nclass User extends Model {\n  function greet($name) { return "Hi"; } // c\n}');
    expect(php).toContain('background:#282c34');
    expect(php).toContain("font-family:&#x27;Fira Code iScript&#x27;, &#x27;Fira Code&#x27;");
    expect(php).toContain(span('#be5046', '&lt;?php'));
    expect(php).toContain(span('#e5c07b', 'User'));
    expect(php).toContain(span('#61afef', 'greet'));
    expect(php).toContain(span('#e06c75', '$name'));
    expect(php).toContain(span('#98c379', '&quot;Hi&quot;'));
    expect(php).toContain('<span style="color:#7f848e;font-style:italic">// c</span>');

    const json = renderFence('json', '{"key": 1}');
    expect(json).toContain(span('#e06c75', '&quot;key&quot;'));
    expect(json).toContain(span('#d19a66', '1'));
    const html = renderFence('html', '<a href="x">');
    expect(html).toContain(span('#d19a66', 'href'));
  });

  it('renders unknown languages as plain text instead of guessing', () => {
    const html = renderFence('brainfuck', 'const x = function() {}');
    expect(html).not.toContain(KEYWORD);
    expect(html).toContain('const x = function() {}');
  });
});
