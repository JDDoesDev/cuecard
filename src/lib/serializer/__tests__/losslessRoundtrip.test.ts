import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePresentation, parsePresentationSync, parsePresentationWithWarnings } from '../../parser/parsePresentation';
import { serializePresentation } from '../serializePresentation';
import { migratePresentation } from '../../migration/migrateSlide';
import { parseFrontmatter } from '../../parser/frontmatter';
import { parseDirectives } from '../../parser/directives';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { createPresentation, PresentationSchema, type Presentation } from '../../../types/presentation';
import { LAYOUTS, type LayoutPreset, type Slide, type SlideElement } from '../../../types/slide';

// ============================================================================
// Helpers
// ============================================================================

const pos = (x: number, y: number, width = 30, height = 10) => ({ x, y, width, height });
const id = () => crypto.randomUUID();

function slide(elements: SlideElement[], extra: Partial<Slide> = {}): Slide {
  return { id: id(), layout: 'freestyle', transition: 'none', elements, ...extra };
}

function deck(slides: Slide[], extra: Partial<Presentation> = {}): Presentation {
  return { ...createPresentation(), slides, ...extra };
}

/** Strip volatile/runtime-only fields so presentations can be compared. */
function normalize(p: Presentation) {
  return {
    title: p.title,
    theme: p.theme,
    schemaVersion: p.schemaVersion,
    fontHeading: p.fontHeading,
    fontBody: p.fontBody,
    aspectRatio: p.aspectRatio,
    metadata: p.metadata,
    slides: p.slides.map((s) => ({
      layout: s.layout,
      transition: s.transition,
      notes: s.notes,
      elements: s.elements.map((el) => {
        const { id: _id, cachedUrl: _cached, ...rest } = el as SlideElement & { cachedUrl?: string };
        return rest;
      }),
    })),
  };
}

async function roundTrip(p: Presentation) {
  const md = serializePresentation(p);
  const { presentation, warnings } = await parsePresentationWithWarnings(md);
  return { md, parsed: presentation, warnings };
}

/** Asserts app -> md -> app is lossless and md is idempotent. */
async function expectLossless(p: Presentation) {
  const { md, parsed, warnings } = await roundTrip(p);
  expect(warnings).toEqual([]);
  expect(normalize(parsed)).toEqual(normalize(p));
  expect(serializePresentation(parsed)).toBe(md);
  return { md, parsed };
}

/** Asserts md -> app -> md -> app is stable (for hand-written markdown). */
async function expectStableImport(markdown: string) {
  const first = await parsePresentation(markdown);
  const md1 = serializePresentation(first);
  const second = await parsePresentation(md1);
  expect(normalize(second)).toEqual(normalize(first));
  expect(serializePresentation(second)).toBe(md1);
  return first;
}

function allElementTypes(): SlideElement[] {
  return [
    { id: id(), type: 'heading', position: pos(5, 5, 90, 12), content: 'Heading **bold**', level: 3, fontFamily: 'Inter', lineHeight: 1.2, verticalAlign: 'middle', fragment: 2 },
    { id: id(), type: 'text', position: pos(5, 20), content: 'Some *text* with [a link](https://example.com)', fontFamily: 'Lato', lineHeight: 1.5, verticalAlign: 'bottom' },
    { id: id(), type: 'list', position: pos(40, 20), items: ['One', 'Two **b**', 'Three'], ordered: true, fragment: 1, fragmentPerItem: true, lineHeight: 1.4, fontFamily: 'Roboto', verticalAlign: 'top' },
    { id: id(), type: 'code', position: pos(5, 35, 60, 30), code: 'const x = 1;\nconsole.log(x);', language: 'typescript', highlightLines: [1, 2], fragment: 3 },
    { id: id(), type: 'image', position: pos(70, 35, 25, 25), url: 'https://example.com/a.png', alt: 'An image', objectFit: 'contain', cacheKey: 'image:abc123' },
    { id: id(), type: 'video', position: pos(70, 65, 25, 25), url: 'https://www.youtube.com/watch?v=abc', fragment: 4 },
    { id: id(), type: 'rectangle', position: pos(1, 1, 10, 10), fill: '#ff0000', stroke: '#000', strokeWidth: 2, cornerRadius: 4 },
    { id: id(), type: 'circle', position: pos(12, 1, 10, 10), fill: 'blue', stroke: 'red', strokeWidth: 1, fragment: 1 },
    { id: id(), type: 'line', position: pos(25, 1, 20, 0), stroke: '#333', strokeWidth: 3 },
    { id: id(), type: 'html', position: pos(50, 80, 40, 15), htmlContent: '<div class="box">\n\n<span>Hi</span>\n\n</div>' },
  ];
}

// ============================================================================
// App -> markdown -> app (lossless)
// ============================================================================

describe('Lossless round-trip from Presentation objects', () => {
  for (const layout of LAYOUTS) {
    it(`preserves every element type and property in a ${layout} slide`, async () => {
      const p = deck([
        slide(allElementTypes(), { layout, transition: 'zoom', notes: 'Notes for ' + layout }),
        slide(allElementTypes().reverse(), { layout }),
      ]);
      const { md } = await expectLossless(p);
      // Markdown stays readable for other renderers
      expect(md).toContain('### Heading **bold**');
      expect(md).toContain('[a link](https://example.com)');
      expect(md).toContain('1. One');
      expect(md).toContain('```typescript\nconst x = 1;');
      expect(md).toContain('![An image](https://example.com/a.png)');
    });
  }

  it('preserves an element-type-only slide for each layout (template slots)', async () => {
    const slides = (LAYOUTS as readonly LayoutPreset[]).flatMap((layout) =>
      allElementTypes().map((el) => slide([el], { layout })),
    );
    await expectLossless(deck(slides));
  });

  it('keeps element order exactly (no layout reordering)', async () => {
    const p = deck([
      slide(
        [
          { id: id(), type: 'heading', position: pos(1, 1), content: 'H1', level: 1 },
          { id: id(), type: 'heading', position: pos(1, 20), content: 'H2', level: 2 },
          { id: id(), type: 'text', position: pos(1, 40), content: 'text' },
        ],
        { layout: 'title' },
      ),
      slide(
        [
          { id: id(), type: 'image', position: pos(1, 1), url: 'a.png' },
          { id: id(), type: 'text', position: pos(50, 1), content: 'after image' },
          { id: id(), type: 'image', position: pos(1, 50), url: 'b.png' },
        ],
        { layout: 'media-anywhere' },
      ),
    ]);
    await expectLossless(p);
  });

  it('preserves heading levels in every layout', async () => {
    const slides = (LAYOUTS as readonly LayoutPreset[]).flatMap((layout) =>
      ([1, 2, 3, 4, 5, 6] as const).map((level) =>
        slide(
          [
            { id: id(), type: 'heading', position: pos(1, 1), content: `Level ${level}`, level },
            { id: id(), type: 'list', position: pos(1, 30), items: ['a'], ordered: false },
          ],
          { layout },
        ),
      ),
    );
    await expectLossless(deck(slides));
  });

  it('preserves two-column slides with lists and multiple elements per column', async () => {
    const p = deck([
      slide(
        [
          { id: id(), type: 'heading', position: pos(5, 5, 90, 12), content: 'Compare', level: 1 },
          { id: id(), type: 'list', position: pos(3, 20, 45, 30), items: ['Left A', 'Left B'], ordered: false },
          { id: id(), type: 'text', position: pos(3, 55, 45, 20), content: 'Left text' },
          { id: id(), type: 'list', position: pos(52, 20, 45, 30), items: ['Right A'], ordered: true },
          { id: id(), type: 'code', position: pos(52, 55, 45, 30), code: 'x', language: 'js' },
        ],
        { layout: 'two-column' },
      ),
    ]);
    await expectLossless(p);
  });

  it('preserves presentation-level fields (fonts, aspect ratio, metadata)', async () => {
    const p = deck([slide([{ id: id(), type: 'text', position: pos(1, 1), content: 'x' }])], {
      title: 'Deck: "Quoted" # hash',
      theme: 'dark',
      fontHeading: 'Playfair Display',
      fontBody: 'Source Sans 3',
      aspectRatio: '4:3',
      metadata: {
        author: 'Ada Lovelace',
        'event-name': 'Conf: 2026',
        version: '1.0',
        count: 5,
        draft: true,
        tags: ['a', 'b'],
        nested: { k: 'v' },
        evil: 'x\ntheme: hacked\n---',
        yes: 'yes',
        empty: '',
      },
    });
    const { md, parsed } = await expectLossless(p);
    expect(parsed.theme).toBe('dark');
    expect(md).not.toMatch(/^theme: hacked/m);
  });

  it('round-trips each aspect ratio and default presentation', async () => {
    for (const aspectRatio of ['16:9', '4:3', '16:10'] as const) {
      await expectLossless(deck([], { aspectRatio }));
    }
    await expectLossless(deck([]));
    await expectLossless(deck([slide([])]));
  });

  it('preserves textAlign on heading/text/list and inline text-align styles in HTML text', async () => {
    const p = deck([
      slide([
        { id: id(), type: 'heading', position: pos(1, 1), content: 'Centered', level: 2, textAlign: 'center' },
        { id: id(), type: 'text', position: pos(1, 20), content: 'Justified', textAlign: 'justify' },
        { id: id(), type: 'list', position: pos(1, 40), items: ['a', 'b'], ordered: false, textAlign: 'right' },
        {
          id: id(),
          type: 'text',
          position: pos(1, 60),
          content: '<p style="text-align: center">Mid</p><p style="text-align: right"><strong>Right</strong></p>',
        },
        { id: id(), type: 'text', position: pos(1, 80), content: 'Left (unset)' },
        { id: id(), type: 'text', position: pos(1, 90), content: '<p style="text-align:center">Tight</p>\nplain line', textAlign: 'left' },
      ] as SlideElement[]),
    ]);
    const { md, parsed } = await expectLossless(p);
    expect(md).toContain('"textAlign":"center"');
    expect(md).toContain('<p style="text-align: center">Mid</p>');
    expect((parsed.slides[0].elements[4] as any).textAlign).toBeUndefined();
  });

  it('does not export runtime-only cachedUrl but keeps cacheKey', async () => {
    const p = deck([
      slide([
        { id: id(), type: 'image', position: pos(1, 1), url: 'photo.png', cacheKey: 'image:deadbeef', cachedUrl: 'blob:http://x/123' },
      ]),
    ]);
    const { md, parsed } = await roundTrip(p);
    expect(md).not.toContain('blob:');
    const img = parsed.slides[0].elements[0];
    expect(img.type === 'image' && img.cacheKey).toBe('image:deadbeef');
  });

  describe('tricky content stays verbatim and idempotent', () => {
    const textContents = [
      '[Link](https://x)',
      '**b** and *i* and ~~s~~ and `code`',
      'line1  \nline2',
      'line1\\\nline2',
      'para one\n\npara two\n\n\npara three',
      '---',
      'before\n\n---\n\nafter',
      '***',
      '___',
      '???',
      'a\n\n???\n\nb',
      '<!-- fragment: 1 -->',
      '<!-- element: {"type":"text"} -->',
      '<!-- layout: blank -->',
      '<!-- column-break -->',
      '```\nunclosed fence',
      '<pre>\nunclosed pre',
      '<!-- unclosed comment',
      '# not a heading',
      '- not a list',
      '1. not ordered',
      '| a | b |\n|---|---|\n| x \\| y | `p|q` |',
      '  leading spaces',
      '    indented code',
      'trailing newline\n',
      '\nleading newline',
      'tab\tinside',
      'unicode ✓ — “quotes” 日本語',
      'arrow --> inside',
      'escaped \\*not em\\*',
      '&amp; entity',
      '<span>inline</span> html',
      '<p>Tiptap</p><p>HTML</p>',
      '[ref]: https://example.com',
      '> quote',
      '',
    ];
    for (const content of textContents) {
      it(`text: ${JSON.stringify(content)}`, async () => {
        await expectLossless(
          deck([slide([{ id: id(), type: 'text', position: pos(1, 1), content }, { id: id(), type: 'text', position: pos(1, 50), content: 'next' }])]),
        );
      });
    }

    const headingContents = ['Plain', '**Bold** `code`', 'Has # hash #', '', ' leading', 'multi\nline', '<em>html</em>', '---'];
    for (const content of headingContents) {
      it(`heading: ${JSON.stringify(content)}`, async () => {
        await expectLossless(deck([slide([{ id: id(), type: 'heading', position: pos(1, 1), content, level: 2 }])]));
      });
    }

    const listItemSets = [
      ['plain', '**bold**', '[link](https://x)'],
      ['multi\nline item', 'second'],
      ['', 'empty first'],
      ['para\n\nsplit'],
      ['text<ul><li>nested</li></ul>'],
      ['- dash start', '1. number start', '# hash start'],
      ['[ ] looks like task'],
      ['---'],
      [],
    ];
    for (const items of listItemSets) {
      for (const ordered of [false, true]) {
        it(`list (${ordered ? 'ordered' : 'unordered'}): ${JSON.stringify(items)}`, async () => {
          await expectLossless(deck([slide([{ id: id(), type: 'list', position: pos(1, 1), items, ordered }])]));
        });
      }
    }

    const codeCases: Array<[string, string]> = [
      ['a ``` b\n```\nstill code', 'md'],
      ['', 'text'],
      ['x', ''],
      ['\nleading blank', 'js'],
      ['trailing blank\n', 'js'],
      ['---\n???\n<!-- x -->', 'yaml'],
      ['x', 'lang with spaces'],
    ];
    for (const [code, language] of codeCases) {
      it(`code: ${JSON.stringify(code)} (${JSON.stringify(language)})`, async () => {
        await expectLossless(deck([slide([{ id: id(), type: 'code', position: pos(1, 1), code, language }])]));
      });
    }

    const mediaCases: Array<[string, string | undefined]> = [
      ['https://example.com/a.png', undefined],
      ['path with spaces/a (1).png', 'alt [brackets]'],
      ['', ''],
      ['data:image/png;base64,iVBORw0KGgo=', 'data'],
      ['video.mp4', 'looks like video'],
    ];
    for (const [url, alt] of mediaCases) {
      it(`image: ${JSON.stringify(url)} alt=${JSON.stringify(alt)}`, async () => {
        const el: SlideElement = { id: id(), type: 'image', position: pos(1, 1), url };
        if (alt !== undefined) el.alt = alt;
        await expectLossless(deck([slide([el])]));
      });
      it(`video: ${JSON.stringify(url)}`, async () => {
        await expectLossless(deck([slide([{ id: id(), type: 'video', position: pos(1, 1), url }])]));
      });
    }

    const htmlContents = [
      '<div>\n\n<p>blank lines</p>\n\n</div>',
      '<span>inline start</span>',
      '<!-- just a comment -->',
      '<!-- fragment: 2 -->',
      '<!-- transition: zoom -->',
      'plain text not html',
      '<pre>\n---\n</pre>',
      '<style>.a{color:red}</style>\n<div class="a">x</div>',
    ];
    for (const htmlContent of htmlContents) {
      it(`html: ${JSON.stringify(htmlContent)}`, async () => {
        await expectLossless(
          deck([slide([{ id: id(), type: 'html', position: pos(1, 1), htmlContent }, { id: id(), type: 'text', position: pos(1, 50), content: 'after' }])]),
        );
      });
    }

    const notesCases = [
      'Simple notes',
      'Line one\n---\nLine three',
      'para\n\n---\n\nafter break',
      '***',
      'Raw <b>html</b> and \\< escapes',
      '- dash item\n* star item',
      '???\nmore',
      '```\nunclosed',
      '  leading spaces',
      'trailing\n\n',
      '<!-- notes: nested -->',
      '<!-- transition: zoom -->',
    ];
    for (const notes of notesCases) {
      it(`notes: ${JSON.stringify(notes)}`, async () => {
        await expectLossless(
          deck([
            slide([{ id: id(), type: 'text', position: pos(1, 1), content: 'body' }], { notes }),
            slide([{ id: id(), type: 'text', position: pos(1, 1), content: 'next slide' }]),
          ]),
        );
      });
    }

    it('notes are written readably after ??? when safe', async () => {
      const notes = '- Remember X\n- Raw <b>html</b> stays';
      const { md } = await expectLossless(deck([slide([], { notes })]));
      expect(md).toContain(`???\n\n${notes}`);
    });
  });
});

// ============================================================================
// Hand-written markdown repros
// ============================================================================

describe('Markdown import repros', () => {
  it('bug 1: freestyle import keeps images and code', async () => {
    const p = await expectStableImport(`<!-- layout: freestyle -->

# Title

![pic](a.png)

\`\`\`js
x()
\`\`\`

- item`);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'image', 'code', 'list']);
  });

  it('bug 2: legacy shape directives become shape elements', async () => {
    const p = await expectStableImport(`<!-- shape: {"type":"rectangle","fill":"#f00","cornerRadius":3} -->

<!-- position: {"x":1,"y":2,"width":3,"height":4} -->

<!-- shape: {"type":"circle","stroke":"blue"} -->

<!-- shape: {"type":"line","strokeWidth":2} -->`);
    const els = p.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(['rectangle', 'circle', 'line']);
    expect(els[0]).toMatchObject({ fill: '#f00', cornerRadius: 3, position: { x: 1, y: 2, width: 3, height: 4 } });
  });

  it('bug 3: legacy video image syntax imports as video', async () => {
    const p = await expectStableImport(`![](clip.mp4)\n\n---\n\n![](https://youtu.be/abc)`);
    expect(p.slides[0].elements[0].type).toBe('video');
    expect(p.slides[1].elements[0].type).toBe('video');
  });

  it('bug 4: explicit title-list keeps everything and heading level', async () => {
    const p = await expectStableImport(`<!-- layout: title-list -->

### Agenda

intro

- a
- b

outro

1. x
2. y`);
    const els = p.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(['heading', 'text', 'list', 'text', 'list']);
    expect(els[0].type === 'heading' && els[0].level).toBe(3);
  });

  it('bug 4: plain "## Agenda / intro / list / outro / list2" keeps all content', async () => {
    const p = await expectStableImport(`## Agenda\n\nintro\n\n- list\n\noutro\n\n1. list2`);
    expect(p.slides[0].layout).toBe('title-list');
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'text', 'list', 'text', 'list']);
  });

  it('bug 4: code-block keeps paragraphs before code, all code blocks, heading level', async () => {
    const p = await expectStableImport(`<!-- layout: code-block -->

# Big Title

Before the code

\`\`\`js
one()
\`\`\`

\`\`\`py
two()
\`\`\`

Caption`);
    const els = p.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(['heading', 'text', 'code', 'code', 'text']);
    expect(els[0].type === 'heading' && els[0].level).toBe(1);
  });

  it('bug 4: full-bleed-media keeps caption; title keeps images/lists; blank keeps content', async () => {
    const p = await expectStableImport(`<!-- layout: full-bleed-media -->

![bg](bg.jpg)

Caption text

---

<!-- layout: title -->

# Title

![logo](logo.png)

- a list

---

<!-- layout: blank -->

Some content on a blank slide`);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['image', 'text']);
    expect(p.slides[1].elements.map((e) => e.type)).toEqual(['heading', 'image', 'list']);
    expect(p.slides[2].layout).toBe('blank');
    expect(p.slides[2].elements).toHaveLength(1);
  });

  it('bug 4: tables under headings are kept', async () => {
    const p = await expectStableImport(`## Data\n\n| a | b |\n|---|---|\n| 1 | 2 |`);
    const els = p.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(['heading', 'text']);
    expect(els[1].type === 'text' && els[1].content).toBe('| a | b |\n|---|---|\n| 1 | 2 |');
  });

  it('bug 6: element order is preserved (title and media-anywhere)', async () => {
    const p = await expectStableImport(`# H1\n\n## H2\n\ntext\n\n---\n\n![i](i.png)\n\ntext after image`);
    expect(p.slides[0].elements.map((e) => (e as any).content)).toEqual(['H1', 'H2', 'text']);
    expect(p.slides[1].elements.map((e) => e.type)).toEqual(['image', 'text']);
  });

  it('bug 6: legacy position comments attach to the element they follow', async () => {
    const p = await expectStableImport(`# H1

<!-- position: {"x":1,"y":1,"width":10,"height":10} -->

## H2

<!-- position: {"x":2,"y":2,"width":20,"height":20} -->

text

<!-- position: {"x":3,"y":3,"width":30,"height":30} -->`);
    expect(p.slides[0].elements.map((e) => e.position.x)).toEqual([1, 2, 3]);
  });

  it('bug 7: inline formatting is stable across repeated round trips', async () => {
    const md = `Text with [Link](https://x), **b**, ~~s~~ and \`c\`\n\nline1  \nline2\n\n- item [L](https://y) **b**\n\n  second paragraph`;
    let p = await parsePresentation(md);
    const firstContents = JSON.stringify(normalize(p).slides);
    for (let i = 0; i < 3; i++) {
      p = await parsePresentation(serializePresentation(p));
    }
    expect(JSON.stringify(normalize(p).slides)).toBe(firstContents);
    const [text, hard, list] = p.slides[0].elements as any[];
    expect(text.content).toBe('Text with [Link](https://x), **b**, ~~s~~ and `c`');
    expect(hard.content).toBe('line1  \nline2');
    expect(list.items).toEqual(['item [L](https://y) **b**\nsecond paragraph']);
    const out = serializePresentation(p);
    expect(out).not.toContain('\\*\\*');
    expect(out).not.toContain('[https://x]');
  });

  it('bug 8: notes containing --- do not split slides and stay verbatim', async () => {
    const md = `# Slide\n\n???\n\nNotes <b>raw</b>\n\n- dash\n\n\`\`\`\n---\n\`\`\`\n\n---\n\n# Next`;
    const p = await expectStableImport(md);
    expect(p.slides).toHaveLength(2);
    expect(p.slides[0].notes).toBe('Notes <b>raw</b>\n\n- dash\n\n```\n---\n```');
  });

  it('bug 9: CRLF input and robust frontmatter', async () => {
    const md = [
      '---',
      'title: "Quoted: Title \\"x\\""',
      "theme: 'dark'",
      'event-name: Conf 2026',
      'url: https://example.com/a:b',
      'fontHeading: Inter # comment',
      'aspectRatio: 16:10',
      'tags:',
      '  - one',
      '  - two',
      '---',
      '',
      '# Hello',
      '',
      'World',
    ].join('\r\n');
    const p = await parsePresentation(md);
    expect(p.title).toBe('Quoted: Title "x"');
    expect(p.theme).toBe('dark');
    expect(p.fontHeading).toBe('Inter');
    expect(p.aspectRatio).toBe('16:10');
    expect(p.metadata).toEqual({ 'event-name': 'Conf 2026', url: 'https://example.com/a:b', tags: ['one', 'two'] });
    expect(p.slides[0].elements.map((e) => (e as any).content)).toEqual(['Hello', 'World']);
    expect(JSON.stringify(p)).not.toContain('\r');
    await expectLossless(p);
  });

  it('bug 9: title with newline cannot inject keys', async () => {
    const p = deck([], { title: 'Evil\ntheme: hacked', theme: 'light' });
    const parsed = await parsePresentation(serializePresentation(p));
    expect(parsed.title).toBe('Evil\ntheme: hacked');
    expect(parsed.theme).toBe('light');
  });

  it('bug 11: invalid directive values are ignored with warnings, not fatal', async () => {
    const md = `<!-- transition: spin -->
<!-- layout: nope -->

<!-- fragment: abc -->

# Title

<!-- position: {"x": "bad"} -->

<!-- element: {not json} -->

text

<!-- element: {"type":"image","position":{"x":1,"y":1,"width":1,"height":1},"objectFit":"stretch","bogus":1} -->

![a](a.png)

<!-- element: {"type":"spaceship"} -->

kept anyway`;
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    expect(warnings.length).toBeGreaterThanOrEqual(6);
    const s = presentation.slides[0];
    expect(s.transition).toBe('none');
    expect(s.elements.map((e) => e.type)).toEqual(['heading', 'text', 'image', 'text']);
    expect((s.elements[2] as any).objectFit).toBeUndefined();
    expect((s.elements[3] as any).content).toBe('kept anyway');
    await expect(parsePresentation(md)).resolves.toBeDefined();
  });

  it('bug 12: title layout without heading does not duplicate the paragraph', async () => {
    const p = await expectStableImport(`<!-- layout: title -->\n\nJust a paragraph`);
    expect(p.slides[0].elements).toHaveLength(1);
    expect(p.slides[0].elements[0].type).toBe('text');
  });

  it('bug 13: raw html blocks import as html elements', async () => {
    const p = await expectStableImport(`<div class="a">x</div>\n\n<section>\n<p>y</p>\n</section>`);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['html', 'html']);
  });

  it('bug 14: media-anywhere keeps headings, lists and every image; images-only has no empty text', async () => {
    const p = await expectStableImport(`## Heading\n\n- a\n- b\n\n![1](1.png)\n\n![2](2.png)\n\n---\n\n![1](1.png)\n\n![2](2.png)`);
    expect(p.slides[0].layout).toBe('media-anywhere');
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'list', 'image', 'image']);
    expect(p.slides[1].elements.map((e) => e.type)).toEqual(['image', 'image']);
  });

  it('bug 15: table cells with escaped pipes / pipes in code keep their columns', async () => {
    const table = '| a | b |\n|---|---|\n| x \\| y | `p\\|q` |';
    const p = await expectStableImport(table);
    expect((p.slides[0].elements[0] as any).content).toBe(table);
  });

  it('bug 16: column-break accepts whitespace variants', async () => {
    for (const marker of ['<!--column-break-->', '<!--   column-break   -->', '<!-- Column-Break -->']) {
      const p = await expectStableImport(`# T\n\nleft\n\n${marker}\n\nright`);
      expect(p.slides[0].layout).toBe('two-column');
      expect(p.slides[0].elements.map((e) => e.position.x)).toEqual([12, 12, 52]);
    }
  });

  it('bug 18: two-column heading level is preserved', async () => {
    const p = await expectStableImport(`## Two\n\n- l1\n\n<!-- column-break -->\n\n- r1`);
    const h = p.slides[0].elements[0];
    expect(h.type === 'heading' && h.level).toBe(2);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'list', 'list']);
  });

  it('plain HTML comments (author notes, Marp directives) are not slide content', async () => {
    const p = await expectStableImport(`<!-- _class: lead -->\n\n# T\n\n<!-- author comment -->\n\n<!-- fragment: 1 -->\n\n<!-- just a note -->\n\ntext`);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'text']);
    expect(p.slides[0].elements[1].fragment).toBe(1);
  });
});

describe('Review fixes', () => {
  it('prototype-named keys in directives never crash the import', async () => {
    const md = `<!-- element: {"type":"text","constructor":1,"toString":"x","__proto__":{"a":1},"hasOwnProperty":2,"valueOf":3} -->

hello

<!-- shape: {"type":"rectangle","constructor":{},"__proto__":{"fill":"red"}} -->

<!-- element: {"type":"constructor"} -->

x

<!-- element: {"type":"toString"} -->`;
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    expect(presentation.slides[0].elements.map((e) => e.type)).toEqual(['text', 'rectangle', 'text']);
    expect((presentation.slides[0].elements[0] as any).content).toBe('hello');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('frontmatter: prototype keys are skipped', async () => {
    const p = await parsePresentation(`---\n__proto__: x\nconstructor: y\nprototype: z\nok: 1\n---\n\n# T`);
    expect(p.metadata).toEqual({ ok: 1 });
    expect(Object.getPrototypeOf(p.metadata)).toBe(Object.prototype);
  });

  it('frontmatter: block scalars and nested maps are parsed and written back intact', async () => {
    const md = [
      '---',
      'title: Deck',
      'style: |',
      '  h1 { color: red; }',
      '',
      '  p: { margin: 0 }',
      'folded: >-',
      '  one',
      '  two',
      'nested:',
      '  a: 1',
      '  b:',
      '    - x',
      '    - key: v',
      '      other: w',
      'list:',
      '- p',
      '- q',
      '---',
      '',
      '# T',
    ].join('\n');
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    expect(warnings).toEqual([]);
    expect(presentation.metadata).toEqual({
      style: 'h1 { color: red; }\n\np: { margin: 0 }\n',
      folded: 'one two',
      nested: { a: 1, b: ['x', { key: 'v', other: 'w' }] },
      list: ['p', 'q'],
    });
    await expectLossless(presentation);
  });

  it('frontmatter: unsupported YAML is kept as text with a warning', async () => {
    const { presentation, warnings } = await parsePresentationWithWarnings(`---\nanchor: &a value\nflow: [a, b\n---\n\n# T`);
    expect(presentation.metadata).toEqual({ anchor: '&a value', flow: '[a, b' });
    expect(warnings.length).toBe(2);
    await expectLossless(presentation);
  });

  it('pathological 50KB lines add <100ms on top of the markdown parser itself', () => {
    const big = 50_000;
    const best = (fn: () => void) => {
      let min = Infinity;
      for (let r = 0; r < 3; r++) {
        const t0 = performance.now();
        fn();
        min = Math.min(min, performance.now() - t0);
      }
      return min;
    };
    const cases = [
      `---\ntitle: ${'1'.repeat(big)}x\n${'k'.repeat(big)} x\nn: ${'1'.repeat(big)}.${'1'.repeat(big)}e\n---\n\n# T`,
      `# T\n\n???\n\n${' '.repeat(big)}x${' \t'.repeat(big / 2)}`,
      `${'<!--'.repeat(big / 4)}`,
      `<div>${'<!-- a -->'.repeat(big / 10)}x</div>`,
      `- a\n  - ${'['.repeat(big)}\n  - ${'**'.repeat(big / 2)}`,
      `![v](${'.'.repeat(big)}mp4x)`,
    ];
    for (const md of cases) {
      const remarkOnly = best(() => unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).parse(md));
      const full = best(() => parsePresentationSync(md));
      expect(full - remarkOnly).toBeLessThan(100);
    }
    // Our own parsers, without remark
    const fmText = `title: ${'1'.repeat(big)}x\n${'k'.repeat(big)}\nv: "${'\\'.repeat(big)}\n${'- '.repeat(big)}`;
    expect(best(() => parseFrontmatter(fmText))).toBeLessThan(100);
    expect(best(() => parseDirectives('<!--'.repeat(big)))).toBeLessThan(100);
  });

  it('??? followed directly by notes (no blank line) keeps notes off the slide', async () => {
    const p = await parsePresentation(`# Title\n\n???\nThese are notes\nmore notes\n\n- list note`);
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading']);
    expect(p.slides[0].notes).toBe('These are notes\nmore notes\n\n- list note');
  });

  it('many elements never overflow the slide', async () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    for (const prefix of ['', '# Title\n\n', '<!-- layout: title-list -->\n\n## H\n\n', '<!-- layout: two-column -->\n\n']) {
      const p = await parsePresentation(prefix + paragraphs);
      for (const el of p.slides[0].elements) {
        expect(el.position.y).toBeGreaterThanOrEqual(0);
        expect(el.position.y + el.position.height).toBeLessThanOrEqual(100.01);
        expect(el.position.height).toBeGreaterThan(0);
      }
    }
  });

  it('title layout keeps source order top-to-bottom', async () => {
    const p = await expectStableImport(`# T\n\n## Subtitle\n\nbyline`);
    const ys = p.slides[0].elements.map((e) => e.position.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(p.slides[0].elements.map((e) => e.type)).toEqual(['heading', 'heading', 'text']);
  });

  it('legacy position before the first element applies to that element', async () => {
    const p = await expectStableImport(`<!-- position: {"x":5,"y":6,"width":7,"height":8} -->\n\n# H\n\ntext\n\n<!-- position: {"x":1,"y":2,"width":3,"height":4} -->`);
    expect(p.slides[0].elements.map((e) => e.position.x)).toEqual([5, 1]);
  });

  it('content hand-added after an element block becomes separate elements', async () => {
    const md = `<!-- layout: freestyle -->

<!-- element: {"type":"heading","position":{"x":1,"y":1,"width":50,"height":10}} -->

# Title

Added paragraph

- added list

<!-- element: {"type":"text","position":{"x":1,"y":50,"width":50,"height":10}} -->

kept`;
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    const els = presentation.slides[0].elements;
    expect(els.map((e) => e.type)).toEqual(['heading', 'text', 'list', 'text']);
    expect((els[0] as any).content).toBe('Title');
    expect(els[0].position).toEqual({ x: 1, y: 1, width: 50, height: 10 });
    expect(warnings.some((w) => w.includes('separate element'))).toBe(true);
  });

  it('hand-written decks export without element directives', async () => {
    const md = `# Welcome\n\nSubtitle\n\n---\n\n## Agenda\n\n- One\n- Two\n\n---\n\n## Code\n\n\`\`\`js\nx()\n\`\`\``;
    const out = serializePresentation(await parsePresentation(md));
    expect(out).not.toContain('<!-- element:');
    const demo = readFileSync(resolve(__dirname, '../../../../demo/test-import.md'), 'utf8');
    const demoOut = serializePresentation(await parsePresentation(demo));
    expect(demoOut).not.toContain('<!-- element:');
    expect(demoOut).toContain('<!-- column-break -->');
  });
});

// ============================================================================
// Demo files & migration
// ============================================================================

describe('Demo files', () => {
  const demoDir = resolve(__dirname, '../../../../demo');

  it('test-import.md imports without warnings and round-trips', async () => {
    const md = readFileSync(resolve(demoDir, 'test-import.md'), 'utf8');
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    expect(warnings).toEqual([]);
    expect(presentation.fontHeading).toBe('Raleway');
    expect(presentation.fontBody).toBe('Source Sans 3');
    expect(presentation.slides).toHaveLength(md.split(/\n---\n/).length - 1);
    // Fragment slide keeps its paragraph AND list
    const multi = presentation.slides.find((s) => s.elements.some((e) => (e as any).content === 'Multiple Fragment Groups'))!;
    expect(multi.elements.map((e) => [e.type, e.fragment])).toEqual([
      ['heading', undefined],
      ['text', 1],
      ['list', 2],
    ]);
    // Notes are complete (no nested-comment truncation)
    expect(presentation.slides.some((s) => s.notes?.includes('Each click reveals the next item.'))).toBe(true);
    // No element has lost its content
    for (const s of presentation.slides) {
      for (const e of s.elements) {
        if (e.type === 'text' || e.type === 'heading') expect(e.content).not.toBe('');
      }
    }
    await expectStableImport(md);
  });

  it('Sample presentation imports with positions and round-trips', async () => {
    const md = readFileSync(resolve(demoDir, 'Sample Presentation.md'), 'utf8');
    const { presentation, warnings } = await parsePresentationWithWarnings(md);
    expect(warnings).toEqual([]);
    expect(presentation.slides[0].elements[0].position).toEqual({ x: 10, y: 30, width: 80, height: 20 });
    // Full-bleed image slide keeps its caption
    const fb = presentation.slides.find((s) => s.elements.some((e) => e.type === 'image' && e.url.includes('1920')))!;
    expect(fb.elements.map((e) => e.type)).toEqual(['image', 'text']);
    await expectStableImport(md);
  });

  it('Test Presentation.cuecard.json migrates and round-trips losslessly', async () => {
    const raw = JSON.parse(readFileSync(resolve(demoDir, 'Test Presentation.cuecard.json'), 'utf8'));
    const p = migratePresentation(raw);
    expect(p.slides.length).toBe(raw.slides.length);
    await expectLossless(p);
  });
});

describe('migratePresentation', () => {
  it('converts legacy slides, fills defaults and leaves element validation to the caller', () => {
    const warnings: string[] = [];
    const p = migratePresentation(
      {
        title: 'Old',
        slides: [
          { id: 's1', layout: 'title', transition: 'fade', title: 'Hello', subtitle: 'World' },
          { id: 's2', layout: 'title-list', title: 'List', items: ['a', 'b'] },
          { layout: 'weird', elements: [{ type: 'text', position: pos(1, 1), content: 'no id' }] },
        ],
        aspectRatio: '16:10',
      },
      warnings,
    );
    expect(PresentationSchema.safeParse(p).success).toBe(true);
    expect(p.slides.map((s) => s.elements.length)).toEqual([2, 2, 1]);
    expect(p.slides[2].layout).toBe('freestyle');
    expect(p.slides[2].elements[0].id).toBeTruthy();
    expect(p.aspectRatio).toBe('16:10');
    expect(warnings.length).toBeGreaterThan(0);

    const bogus = migratePresentation({ slides: [{ id: 's', layout: 'freestyle', elements: [{ id: 'e', type: 'bogus' }] }] });
    expect(PresentationSchema.safeParse(bogus).success).toBe(false);
  });

  it('returns a valid empty presentation for garbage input', () => {
    const p = migratePresentation(null);
    expect(p.slides).toEqual([]);
    expect(PresentationSchema.safeParse(p).success).toBe(true);
  });
});
