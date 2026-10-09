/**
 * Minimal, dependency-free YAML frontmatter support.
 *
 * Parsing handles the subset that presentation frontmatter uses:
 * - `key: value` pairs (keys may contain `-`, `.`, or be quoted)
 * - plain, 'single-quoted' and "double-quoted" scalars (values may contain colons)
 * - flow collections written as JSON (`[1, 2]`, `{"a": 1}`)
 * - booleans, null and numbers
 * - nested block mappings and sequences (indentation based)
 * - block scalars (`|`, `>`, with `-` / `+` chomping)
 * - `#` comments
 * Anything else (anchors, aliases, tags, complex keys) is kept as the raw
 * string with a warning, never silently corrupted.
 *
 * Serialization quotes any value that would not read back identically, and
 * writes objects/arrays as JSON flow collections (valid YAML), so a value can
 * never inject extra keys.
 *
 * All patterns are linear-time (no nested/overlapping quantifiers).
 */

const NUMBER_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const RESERVED_RE = /^(?:true|false|yes|no|on|off|null|~)$/i;
const PLAIN_KEY_RE = /^[A-Za-z_][\w.-]*$/;
const BLOCK_SCALAR_RE = /^([|>])([+-]?)\d?([+-]?)$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface Line {
  indent: number;
  /** Content after indentation */
  text: string;
}

function stripComment(value: string): string {
  // A `#` preceded by whitespace starts a comment in a plain scalar.
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '#' && (value[i - 1] === ' ' || value[i - 1] === '\t')) return value.slice(0, i).trimEnd();
  }
  return value.startsWith('#') ? '' : value;
}

function findClosingDoubleQuote(value: string): number {
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '\\') i++;
    else if (value[i] === '"') return i;
  }
  return -1;
}

function findClosingSingleQuote(value: string): number {
  for (let i = 1; i < value.length; i++) {
    if (value[i] === "'") {
      if (value[i + 1] === "'") i++;
      else return i;
    }
  }
  return -1;
}

export function parseYamlScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === '') return null;

  if (value.startsWith('"')) {
    const end = findClosingDoubleQuote(value);
    const quoted = end === -1 ? value : value.slice(0, end + 1);
    try {
      return JSON.parse(quoted);
    } catch {
      return quoted.slice(1, end === -1 ? undefined : -1);
    }
  }

  if (value.startsWith("'")) {
    const end = findClosingSingleQuote(value);
    return value.slice(1, end === -1 ? undefined : end).replace(/''/g, "'");
  }

  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      // Fall through to plain scalar handling
    }
  }

  const plain = stripComment(value);
  if (plain === '') return null;
  if (/^true$/i.test(plain)) return true;
  if (/^false$/i.test(plain)) return false;
  if (/^(?:null|~)$/i.test(plain)) return null;
  if (NUMBER_RE.test(plain)) {
    const num = Number(plain);
    if (Number.isFinite(num)) return num;
  }
  return plain;
}

/**
 * Split `key: value` (key may be quoted). Returns null if the text is not a
 * mapping entry. Linear scan, no regex backtracking.
 */
function splitKeyValue(text: string): { key: string; value: string } | null {
  let keyEnd: number;
  let key: string;
  if (text.startsWith('"') || text.startsWith("'")) {
    const close = text.startsWith('"') ? findClosingDoubleQuote(text) : findClosingSingleQuote(text);
    if (close === -1) return null;
    const rawKey = text.slice(0, close + 1);
    key = String(parseYamlScalar(rawKey) ?? '');
    keyEnd = close + 1;
    while (text[keyEnd] === ' ' || text[keyEnd] === '\t') keyEnd++;
    if (text[keyEnd] !== ':') return null;
  } else {
    keyEnd = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ':' && (i + 1 === text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) {
        keyEnd = i;
        break;
      }
      if (text[i] === '#' && i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) return null;
    }
    if (keyEnd <= 0) return null;
    key = text.slice(0, keyEnd).trim();
    if (key === '' || key.startsWith('#')) return null;
  }
  return { key, value: text.slice(keyEnd + 1).trim() };
}

class YamlReader {
  private lines: Array<Line | null>;
  private rawLines: string[];
  constructor(
    text: string,
    private warnings: string[],
  ) {
    this.rawLines = text.replace(/\r\n?/g, '\n').split('\n');
    this.lines = this.rawLines.map((raw) => {
      const trimmed = raw.trimStart();
      if (trimmed === '' || trimmed.startsWith('#')) return null; // blank / comment
      return { indent: raw.length - trimmed.length, text: trimmed.trimEnd() };
    });
  }

  private nextContent(i: number): number {
    while (i < this.lines.length && this.lines[i] === null) i++;
    return i;
  }

  parseDocument(): Record<string, unknown> {
    const [value] = this.parseMapping(this.nextContent(0), 0);
    return value;
  }

  private parseMapping(i: number, indent: number): [Record<string, unknown>, number] {
    const result: Record<string, unknown> = {};
    i = this.nextContent(i);
    while (i < this.lines.length) {
      const line = this.lines[i]!;
      if (line.indent < indent) break;
      if (line.indent > indent) {
        this.warnings.push(`Frontmatter: unexpected indentation ignored ("${line.text.slice(0, 40)}").`);
        i = this.nextContent(i + 1);
        continue;
      }
      if (line.text === '-' || line.text.startsWith('- ')) break;
      const entry = splitKeyValue(line.text);
      if (!entry) {
        this.warnings.push(`Frontmatter: unrecognized line ignored ("${line.text.slice(0, 40)}").`);
        i = this.nextContent(i + 1);
        continue;
      }
      const [value, next] = this.parseValue(entry.value, i, indent, entry.key);
      if (UNSAFE_KEYS.has(entry.key)) {
        this.warnings.push(`Frontmatter key "${entry.key}" ignored.`);
      } else {
        result[entry.key] = value;
      }
      i = this.nextContent(next);
    }
    return [result, i];
  }

  /** Parse the value of an entry on line `i` (value text may be empty → nested block). */
  private parseValue(valueText: string, i: number, indent: number, key: string): [unknown, number] {
    const header = stripComment(valueText);
    const block = header.match(BLOCK_SCALAR_RE);
    if (block) return this.parseBlockScalar(i + 1, indent, block[1] as '|' | '>', block[2] || block[3]);

    if (header === '') {
      const j = this.nextContent(i + 1);
      const child = this.lines[j];
      if (child && child.indent > indent) {
        return child.text === '-' || child.text.startsWith('- ')
          ? this.parseSequence(j, child.indent)
          : this.parseMapping(j, child.indent);
      }
      if (child && child.indent === indent && (child.text === '-' || child.text.startsWith('- '))) {
        return this.parseSequence(j, indent);
      }
      return [null, i + 1];
    }

    if (/^[&*!]/.test(header) || header.startsWith('? ')) {
      this.warnings.push(`Frontmatter value for "${key}" uses unsupported YAML syntax; kept as text.`);
      return [valueText, i + 1];
    }
    if ((header.startsWith('[') || header.startsWith('{')) && !isJson(header)) {
      this.warnings.push(`Frontmatter value for "${key}" is not a JSON-style flow collection; kept as text.`);
      return [header, i + 1];
    }
    return [parseYamlScalar(valueText), i + 1];
  }

  private parseSequence(i: number, indent: number): [unknown[], number] {
    const items: unknown[] = [];
    i = this.nextContent(i);
    while (i < this.lines.length) {
      const line = this.lines[i]!;
      if (line.indent !== indent || !(line.text === '-' || line.text.startsWith('- '))) break;
      const rest = line.text === '-' ? '' : line.text.slice(2).trimStart();
      const restIndent = indent + (line.text.length - rest.length);
      if (rest !== '' && splitKeyValue(rest) && !/^["'[{]/.test(rest)) {
        // "- key: value" starts a mapping item; re-read this line as the mapping's first entry
        this.lines[i] = { indent: restIndent, text: rest };
        const [map, next] = this.parseMapping(i, restIndent);
        items.push(map);
        i = this.nextContent(next);
        continue;
      }
      const [value, next] = this.parseValue(rest, i, indent, `item ${items.length + 1}`);
      items.push(value);
      i = this.nextContent(next);
    }
    return [items, i];
  }

  private parseBlockScalar(i: number, parentIndent: number, style: '|' | '>', chomp: string): [string, number] {
    const collected: string[] = [];
    let contentIndent = -1;
    let j = i;
    for (; j < this.rawLines.length; j++) {
      const raw = this.rawLines[j];
      if (raw.trim() === '') {
        collected.push('');
        continue;
      }
      const ind = raw.length - raw.trimStart().length;
      if (ind <= parentIndent) break;
      if (contentIndent === -1) contentIndent = ind;
      if (ind < contentIndent) break;
      collected.push(raw.slice(contentIndent));
    }
    // Trailing blank lines belong to chomping, not to following content
    let trailing = 0;
    while (collected.length > 0 && collected[collected.length - 1] === '') {
      collected.pop();
      trailing++;
    }
    let text: string;
    if (style === '|') {
      text = collected.join('\n');
    } else {
      text = '';
      collected.forEach((line, k) => {
        if (k === 0) text = line;
        else if (line === '' || collected[k - 1] === '' || /^\s/.test(line)) text += '\n' + line;
        else text += ' ' + line;
      });
    }
    if (chomp === '-') {
      // strip
    } else if (chomp === '+') {
      text += '\n'.repeat(trailing + 1);
    } else if (collected.length > 0) {
      text += '\n';
    }
    return [text, j - trailing];
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a frontmatter YAML block into a plain object.
 * Unrecognized constructs produce warnings rather than throwing.
 */
export function parseFrontmatter(yaml: string, warnings: string[] = []): Record<string, unknown> {
  return new YamlReader(yaml, warnings).parseDocument();
}

function formatKey(key: string): string {
  return PLAIN_KEY_RE.test(key) ? key : JSON.stringify(key);
}

/**
 * Format a value so that `parseYamlScalar` reads it back identically.
 */
export function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    const isPlainSafe =
      value !== '' &&
      value === value.trim() &&
      /^[A-Za-z0-9_(][^\n\r\t#:"'\\[\]{}]*$/.test(value) &&
      !/[,&*!|>%@`]$/.test(value) &&
      !RESERVED_RE.test(value) &&
      !NUMBER_RE.test(value);
    return isPlainSafe ? value : JSON.stringify(value);
  }
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return String(value);
  // Arrays/objects are written as JSON, which is valid YAML flow syntax
  return JSON.stringify(value) ?? 'null';
}

export function serializeFrontmatter(entries: Array<[string, unknown]>): string {
  return entries
    .filter(([k, v]) => v !== undefined && !UNSAFE_KEYS.has(k))
    .map(([k, v]) => `${formatKey(k)}: ${formatYamlValue(v)}`)
    .join('\n');
}
