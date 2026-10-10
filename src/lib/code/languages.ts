import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/light';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/hljs/c';
import clojure from 'react-syntax-highlighter/dist/esm/languages/hljs/clojure';
import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/hljs/csharp';
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css';
import dart from 'react-syntax-highlighter/dist/esm/languages/hljs/dart';
import diff from 'react-syntax-highlighter/dist/esm/languages/hljs/diff';
import dockerfile from 'react-syntax-highlighter/dist/esm/languages/hljs/dockerfile';
import elixir from 'react-syntax-highlighter/dist/esm/languages/hljs/elixir';
import erlang from 'react-syntax-highlighter/dist/esm/languages/hljs/erlang';
import fsharp from 'react-syntax-highlighter/dist/esm/languages/hljs/fsharp';
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go';
import groovy from 'react-syntax-highlighter/dist/esm/languages/hljs/groovy';
import haskell from 'react-syntax-highlighter/dist/esm/languages/hljs/haskell';
import ini from 'react-syntax-highlighter/dist/esm/languages/hljs/ini';
import java from 'react-syntax-highlighter/dist/esm/languages/hljs/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/hljs/kotlin';
import less from 'react-syntax-highlighter/dist/esm/languages/hljs/less';
import lua from 'react-syntax-highlighter/dist/esm/languages/hljs/lua';
import makefile from 'react-syntax-highlighter/dist/esm/languages/hljs/makefile';
import markdown from 'react-syntax-highlighter/dist/esm/languages/hljs/markdown';
import nginx from 'react-syntax-highlighter/dist/esm/languages/hljs/nginx';
import objectivec from 'react-syntax-highlighter/dist/esm/languages/hljs/objectivec';
import perl from 'react-syntax-highlighter/dist/esm/languages/hljs/perl';
import php from 'react-syntax-highlighter/dist/esm/languages/hljs/php';
import powershell from 'react-syntax-highlighter/dist/esm/languages/hljs/powershell';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import r from 'react-syntax-highlighter/dist/esm/languages/hljs/r';
import ruby from 'react-syntax-highlighter/dist/esm/languages/hljs/ruby';
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust';
import scala from 'react-syntax-highlighter/dist/esm/languages/hljs/scala';
import scss from 'react-syntax-highlighter/dist/esm/languages/hljs/scss';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import swift from 'react-syntax-highlighter/dist/esm/languages/hljs/swift';
import twig from 'react-syntax-highlighter/dist/esm/languages/hljs/twig';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml';
import yaml from 'react-syntax-highlighter/dist/esm/languages/hljs/yaml';

export interface CodeLanguage {
  /** Canonical id — the name registered with the highlighter. */
  id: string;
  /** Display name in the editor's language picker. */
  label: string;
  /** Other fence names that select this language (```js, ```sh, ...). */
  aliases: string[];
}

type Grammar = Parameters<typeof SyntaxHighlighter.registerLanguage>[1];

const LANGUAGES: Array<CodeLanguage & { grammar: Grammar }> = [
  { id: 'bash', label: 'Bash / Shell', aliases: ['sh', 'shell', 'zsh', 'console', 'shellsession'], grammar: bash },
  { id: 'c', label: 'C', aliases: ['h'], grammar: c },
  { id: 'clojure', label: 'Clojure', aliases: ['clj', 'cljs'], grammar: clojure },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], grammar: cpp },
  { id: 'csharp', label: 'C#', aliases: ['c#', 'cs'], grammar: csharp },
  { id: 'css', label: 'CSS', aliases: [], grammar: css },
  { id: 'dart', label: 'Dart', aliases: [], grammar: dart },
  { id: 'diff', label: 'Diff', aliases: ['patch'], grammar: diff },
  { id: 'dockerfile', label: 'Dockerfile', aliases: ['docker'], grammar: dockerfile },
  { id: 'elixir', label: 'Elixir', aliases: ['ex', 'exs'], grammar: elixir },
  { id: 'erlang', label: 'Erlang', aliases: ['erl'], grammar: erlang },
  { id: 'fsharp', label: 'F#', aliases: ['f#', 'fs'], grammar: fsharp },
  { id: 'go', label: 'Go', aliases: ['golang'], grammar: go },
  { id: 'groovy', label: 'Groovy', aliases: ['gradle'], grammar: groovy },
  { id: 'haskell', label: 'Haskell', aliases: ['hs'], grammar: haskell },
  { id: 'html', label: 'HTML / XML', aliases: ['xml', 'xhtml', 'svg', 'vue'], grammar: xml },
  { id: 'ini', label: 'INI / TOML', aliases: ['toml', 'properties'], grammar: ini },
  { id: 'java', label: 'Java', aliases: ['jsp'], grammar: java },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'cjs', 'node'], grammar: javascript },
  { id: 'json', label: 'JSON', aliases: ['jsonc', 'json5'], grammar: json },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt', 'kts'], grammar: kotlin },
  { id: 'less', label: 'Less', aliases: [], grammar: less },
  { id: 'lua', label: 'Lua', aliases: [], grammar: lua },
  { id: 'makefile', label: 'Makefile', aliases: ['make', 'mk', 'mak'], grammar: makefile },
  { id: 'markdown', label: 'Markdown', aliases: ['md', 'mkdown', 'mkd'], grammar: markdown },
  { id: 'nginx', label: 'Nginx', aliases: ['nginxconf'], grammar: nginx },
  { id: 'objectivec', label: 'Objective-C', aliases: ['objc', 'obj-c', 'mm'], grammar: objectivec },
  { id: 'perl', label: 'Perl', aliases: ['pl', 'pm'], grammar: perl },
  { id: 'php', label: 'PHP', aliases: ['php3', 'php4', 'php5', 'php7', 'php8', 'phtml'], grammar: php },
  { id: 'powershell', label: 'PowerShell', aliases: ['ps1', 'pwsh'], grammar: powershell },
  { id: 'python', label: 'Python', aliases: ['py', 'py3', 'ipython'], grammar: python },
  { id: 'r', label: 'R', aliases: [], grammar: r },
  { id: 'ruby', label: 'Ruby', aliases: ['rb', 'gemspec', 'podspec', 'thor', 'irb'], grammar: ruby },
  { id: 'rust', label: 'Rust', aliases: ['rs'], grammar: rust },
  { id: 'scala', label: 'Scala', aliases: ['sc'], grammar: scala },
  { id: 'scss', label: 'SCSS / Sass', aliases: ['sass'], grammar: scss },
  { id: 'sql', label: 'SQL', aliases: ['mysql', 'postgresql', 'postgres', 'psql', 'sqlite', 'plsql', 'tsql'], grammar: sql },
  { id: 'swift', label: 'Swift', aliases: [], grammar: swift },
  { id: 'twig', label: 'Twig', aliases: ['craftcms'], grammar: twig },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx', 'mts', 'cts'], grammar: typescript },
  { id: 'yaml', label: 'YAML', aliases: ['yml'], grammar: yaml },
];

for (const { id, grammar } of LANGUAGES) {
  SyntaxHighlighter.registerLanguage(id, grammar);
}

/** Languages offered in the editor's picker, in display order. */
export const CODE_LANGUAGES: CodeLanguage[] = LANGUAGES.map(({ id, label, aliases }) => ({ id, label, aliases }));

const BY_NAME = new Map<string, string>();
for (const { id, aliases } of LANGUAGES) {
  BY_NAME.set(id, id);
  for (const alias of aliases) BY_NAME.set(alias, id);
}

/**
 * Map a fence info string (```php, ```JS, ```c++) to a registered language id,
 * or 'text' when the language is unknown. Unknown names must not reach the
 * highlighter — it would auto-detect and could color code as the wrong language.
 */
export function resolveCodeLanguage(language: string | null | undefined): string {
  if (!language) return 'text';
  return BY_NAME.get(language.trim().toLowerCase()) ?? 'text';
}

const PLAIN_TEXT = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'none']);

/**
 * The language picker's value for a stored language: the resolved id, 'text'
 * for plain-text names, or the raw name when it isn't one we can highlight
 * (so the picker shows it instead of silently snapping to another option).
 */
export function codeLanguagePickerValue(language: string | null | undefined): string {
  const resolved = resolveCodeLanguage(language);
  if (resolved !== 'text') return resolved;
  const raw = (language ?? '').trim();
  return PLAIN_TEXT.has(raw.toLowerCase()) ? 'text' : raw;
}

export { SyntaxHighlighter };
