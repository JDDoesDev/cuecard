import type { CSSProperties } from 'react';

/**
 * Code block theme matching VS Code's One Dark Pro: palette, token colors and
 * the "Fira Code iScript, Menlo, Monaco, 'Courier New', monospace" font stack
 * (with bundled Fira Code standing in when the iScript variant isn't installed).
 */

export const ONE_DARK = {
  background: '#282c34',
  foreground: '#abb2bf',
  comment: '#7f848e',
  lineNumber: '#495162',
  lineHighlight: '#3e4451',
  cursor: '#528bff',
  red: '#e06c75',
  darkRed: '#be5046',
  green: '#98c379',
  yellow: '#e5c07b',
  orange: '#d19a66',
  blue: '#61afef',
  purple: '#c678dd',
  cyan: '#56b6c2',
} as const;

export const CODE_FONT_FAMILY = "'Fira Code iScript', 'Fira Code', Menlo, Monaco, 'Courier New', monospace";

type Stylesheet = Record<string, CSSProperties>;

const c = ONE_DARK;

// Keys joined with '.' match a token nested inside another (react-syntax-highlighter
// flattens the token tree and matches class combinations, applied after singles).
const BASE: Stylesheet = {
  hljs: { display: 'block', overflowX: 'auto', color: c.foreground, background: c.background },
  'hljs-comment': { color: c.comment, fontStyle: 'italic' },
  'hljs-quote': { color: c.comment, fontStyle: 'italic' },
  'hljs-doctag': { color: c.purple },
  'hljs-keyword': { color: c.purple },
  'hljs-meta-keyword': { color: c.purple },
  'hljs-selector-pseudo': { color: c.purple },
  'hljs-string': { color: c.green },
  'hljs-meta-string': { color: c.green },
  'hljs-addition': { color: c.green },
  'hljs-regexp': { color: c.cyan },
  'hljs-symbol': { color: c.cyan },
  'hljs-number': { color: c.orange },
  'hljs-literal': { color: c.orange },
  'hljs-attr': { color: c.orange },
  'hljs-selector-class': { color: c.orange },
  'hljs-selector-attr': { color: c.orange },
  'hljs-strong': { color: c.orange, fontWeight: 'bold' },
  'hljs-built_in': { color: c.yellow },
  'hljs-type': { color: c.yellow },
  'hljs-title': { color: c.blue },
  'hljs-selector-id': { color: c.blue },
  'hljs-meta': { color: c.blue },
  'hljs-link': { color: c.blue, textDecoration: 'underline' },
  'hljs-variable': { color: c.red },
  'hljs-template-variable': { color: c.red },
  'hljs-subst': { color: c.red },
  'hljs-name': { color: c.red },
  'hljs-section': { color: c.red },
  'hljs-selector-tag': { color: c.red },
  'hljs-deletion': { color: c.red },
  'hljs-tag': { color: c.foreground },
  'hljs-attribute': { color: c.foreground },
  'hljs-params': { color: c.foreground },
  'hljs-bullet': { color: c.foreground },
  'hljs-emphasis': { fontStyle: 'italic' },
  // Class names are yellow, function names blue.
  'hljs-class.hljs-title': { color: c.yellow },
};

// Where VS Code colors a token differently than the cross-language default.
const LANGUAGE_OVERRIDES: Record<string, Stylesheet> = {
  // Object keys are red in JSON, YAML and JS/TS object literals; HTML attributes stay orange.
  json: { 'hljs-attr': { color: c.red } },
  yaml: { 'hljs-attr': { color: c.red } },
  javascript: { 'hljs-attr': { color: c.red } },
  typescript: { 'hljs-attr': { color: c.red } },
  // <?php ?> tags.
  php: { 'hljs-meta': { color: c.darkRed } },
  // Preprocessor directives (#include, #define).
  c: { 'hljs-meta': { color: c.purple } },
  cpp: { 'hljs-meta': { color: c.purple } },
  objectivec: { 'hljs-meta': { color: c.purple } },
  csharp: { 'hljs-meta': { color: c.purple } },
};

const cache = new Map<string, Stylesheet>();

/** The One Dark stylesheet for a resolved language id. */
export function oneDarkStyle(language: string): Stylesheet {
  const overrides = LANGUAGE_OVERRIDES[language];
  if (!overrides) return BASE;
  let sheet = cache.get(language);
  if (!sheet) {
    sheet = { ...BASE, ...overrides };
    cache.set(language, sheet);
  }
  return sheet;
}
