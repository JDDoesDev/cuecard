import { describe, it, expect } from 'vitest';
import { parsePresentation } from '../parsePresentation';

describe('parsePresentation', () => {
  describe('basic slide parsing', () => {
    it('Case 1: parses single title slide', async () => {
      const markdown = `# Welcome
Subtitle text`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('title');
      expect(result.slides[0].elements).toHaveLength(2);

      const heading = result.slides[0].elements[0];
      expect(heading.type).toBe('heading');
      if (heading.type === 'heading') {
        expect(heading.content).toBe('Welcome');
        expect(heading.level).toBe(1);
      }

      const subtitle = result.slides[0].elements[1];
      expect(subtitle.type).toBe('text');
      if (subtitle.type === 'text') {
        expect(subtitle.content).toBe('Subtitle text');
      }

      expect(result.slides[0].id).toBeTruthy();
      expect(result.slides[0].transition).toBe('none');
    });

    it('Case 2: parses multiple slides with --- separator', async () => {
      const markdown = `# Title Slide
Subtitle

---

## Slide Two
- Item 1
- Item 2`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(2);

      // First slide - title
      expect(result.slides[0].layout).toBe('title');
      expect(result.slides[0].elements[0].type).toBe('heading');

      // Second slide - title-list
      expect(result.slides[1].layout).toBe('title-list');
      expect(result.slides[1].elements[0].type).toBe('heading');
      expect(result.slides[1].elements[1].type).toBe('list');
      if (result.slides[1].elements[1].type === 'list') {
        expect(result.slides[1].elements[1].items).toEqual(['Item 1', 'Item 2']);
      }
    });

    it('Case 9: handles empty markdown', async () => {
      const markdown = '';

      const result = await parsePresentation(markdown);

      expect(result.slides).toEqual([]);
      expect(result.schemaVersion).toBe('1.1');
      expect(result.id).toBeTruthy();
    });
  });

  describe('code block handling', () => {
    it('Case 3: parses code block slide', async () => {
      const markdown = `## Code Example

\`\`\`typescript
const x = 1;
\`\`\``;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('code-block');

      const codeEl = result.slides[0].elements.find((el) => el.type === 'code');
      expect(codeEl).toBeDefined();
      if (codeEl?.type === 'code') {
        expect(codeEl.code).toBe('const x = 1;');
        expect(codeEl.language).toBe('typescript');
      }

      const headingEl = result.slides[0].elements.find((el) => el.type === 'heading');
      expect(headingEl).toBeDefined();
      if (headingEl?.type === 'heading') {
        expect(headingEl.content).toBe('Code Example');
      }
    });

    it('Case 4: code block containing --- does NOT split slides', async () => {
      const markdown = `## Example

\`\`\`yaml
---
key: value
---
\`\`\``;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('code-block');
      const codeEl = result.slides[0].elements.find((el) => el.type === 'code');
      if (codeEl?.type === 'code') {
        expect(codeEl.code).toBe('---\nkey: value\n---');
        expect(codeEl.language).toBe('yaml');
      }
    });
  });

  describe('frontmatter extraction', () => {
    it('Case 5: extracts frontmatter as presentation metadata', async () => {
      const markdown = `---
title: My Presentation
theme: dark
---

# First Slide`;

      const result = await parsePresentation(markdown);

      expect(result.title).toBe('My Presentation');
      expect(result.theme).toBe('dark');
      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('title');
    });
  });

  describe('speaker notes', () => {
    it('Case 6: parses speaker notes from ??? separator', async () => {
      const markdown = `# Title
Content

???

These are my speaker notes`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].notes).toBe('These are my speaker notes');
    });

    it('Case 6b: parses multi-line speaker notes with lists', async () => {
      const markdown = `# Title
Content

???

- Remember to mention X
- Don't forget **Y**

More detailed notes here`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].notes).toContain('Remember to mention X');
      expect(result.slides[0].notes).toContain("Don't forget **Y**");
      expect(result.slides[0].notes).toContain('More detailed notes here');
    });

    it('Case 6c: backward compat - parses speaker notes from HTML comments', async () => {
      const markdown = `# Title
Content

<!-- notes: Legacy speaker notes -->`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].notes).toBe('Legacy speaker notes');
    });
  });

  describe('media detection', () => {
    it('Case 8a: detects single image as full-bleed-media', async () => {
      const markdown = `![alt text](image.jpg)`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('full-bleed-media');
      const imageEl = result.slides[0].elements.find((el) => el.type === 'image');
      expect(imageEl).toBeDefined();
      if (imageEl?.type === 'image') {
        expect(imageEl.url).toBe('image.jpg');
      }
    });

    it('Case 8b: detects image with text as media-anywhere', async () => {
      const markdown = `## My Slide

Some text content here.

![diagram](diagram.png)

More text below.`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('media-anywhere');
    });
  });

  describe('layout inference', () => {
    it('Case 10: infers title-list layout', async () => {
      const markdown = `# My Title
- First item
- Second item
- Third item`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('title-list');

      const listEl = result.slides[0].elements.find((el) => el.type === 'list');
      if (listEl?.type === 'list') {
        expect(listEl.items).toEqual(['First item', 'Second item', 'Third item']);
      }
    });

    it('infers freestyle for complex mixed content', async () => {
      const markdown = `Some paragraph.

Another paragraph.

A third paragraph.`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('freestyle');
    });
  });

  describe('explicit layout directive', () => {
    it('explicit <!-- layout: code-block --> overrides inference', async () => {
      // A slide with only a heading would normally be inferred as 'title',
      // but the explicit directive forces 'code-block'
      const markdown = `<!-- layout: code-block -->
# My Heading`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('code-block');
    });

    it('invalid <!-- layout: invalid --> falls back to inference', async () => {
      const markdown = `<!-- layout: invalid -->
# My Title
Subtitle`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      // Should fall back to normal inference (title layout for H1 + paragraph)
      expect(result.slides[0].layout).toBe('title');
    });

    it('explicit <!-- layout: freestyle --> overrides title inference', async () => {
      const markdown = `<!-- layout: freestyle -->
# Heading
Some text`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].layout).toBe('freestyle');
    });

    it('explicit layout works with multiple slides', async () => {
      const markdown = `<!-- layout: blank -->
# Slide 1

---

<!-- layout: two-column -->
# Slide 2`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(2);
      expect(result.slides[0].layout).toBe('blank');
      expect(result.slides[1].layout).toBe('two-column');
    });
  });

  describe('fragment directives', () => {
    it('parses <!-- fragment: 2 --> and sets fragment on the next element', async () => {
      const markdown = `<!-- fragment: 2 -->
## Delayed Heading`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      const heading = result.slides[0].elements.find((el) => el.type === 'heading');
      expect(heading).toBeDefined();
      expect(heading!.fragment).toBe(2);
    });

    it('parses <!-- fragment-items --> and sets fragmentPerItem on a list', async () => {
      const markdown = `# Title
<!-- fragment: 1 -->
<!-- fragment-items -->
- Item A
- Item B
- Item C`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      const list = result.slides[0].elements.find((el) => el.type === 'list');
      expect(list).toBeDefined();
      if (list?.type === 'list') {
        expect(list.fragment).toBe(1);
        expect(list.fragmentPerItem).toBe(true);
      }
    });

    it('elements without fragment comments have no fragment property', async () => {
      const markdown = `# Normal Title
Some text`;

      const result = await parsePresentation(markdown);

      expect(result.slides).toHaveLength(1);
      for (const el of result.slides[0].elements) {
        expect(el.fragment).toBeUndefined();
      }
    });
  });

  describe('validation', () => {
    it('returns valid Presentation object structure', async () => {
      const markdown = `# Test`;

      const result = await parsePresentation(markdown);

      expect(result.schemaVersion).toBe('1.1');
      expect(result.id).toBeTruthy();
      expect(result.title).toBeTruthy();
      expect(result.theme).toBeTruthy();
      expect(result.slides).toBeInstanceOf(Array);
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();

      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
      expect(new Date(result.updatedAt).toISOString()).toBe(result.updatedAt);
    });
  });
});
