import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openEditor, importMarkdown, slidePanelItems, REPO_ROOT } from './support/app';

const DECK = path.join(REPO_ROOT, 'demo', 'test-import.md');

/**
 * Expected slide count derived from the source text: `---` separators outside
 * fenced code blocks, minus the frontmatter fences.
 */
function countSlides(markdown: string): number {
  let inFence = false;
  let separators = 0;
  const lines = markdown.split(/\r?\n/);
  const hasFrontmatter = lines[0] === '---';
  for (const line of lines) {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    else if (!inFence && /^---\s*$/.test(line)) separators++;
  }
  if (hasFrontmatter) separators -= 2;
  return separators + 1;
}

test('hand-written demo deck imports with the expected slide count and a clean console', async ({ page, pageErrors }) => {
  const expected = countSlides(fs.readFileSync(DECK, 'utf8'));
  await openEditor(page);

  const detected = await importMarkdown(page, DECK);
  expect(detected).toBe(expected);
  await expect(slidePanelItems(page)).toHaveCount(expected);

  // Step through the whole deck in present mode (every slide + fragment renders)
  await page.getByRole('button', { name: '▶ Present' }).click();
  const position = page.getByText(new RegExp(`^\\d+ / ${expected}$`));
  await expect(position).toHaveText(`1 / ${expected}`);
  for (let guard = 0; guard < expected * 10; guard++) {
    if ((await position.textContent()) === `${expected} / ${expected}`) break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(position).toHaveText(`${expected} / ${expected}`);

  expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
});
