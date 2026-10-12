import { pathToFileURL } from 'node:url';
import type { Locator } from '@playwright/test';
import { test, expect, fixture, openEditor, editorCanvas, importMarkdown, exportHtml } from './support/app';

/** The code <pre>'s scale and whether its text overflows the box. */
function codeFit(pre: Locator) {
  return pre.evaluate((el) => ({
    scale: parseFloat(getComputedStyle(el).getPropertyValue('--code-scale') || '1'),
    overflowX: el.scrollWidth - el.clientWidth,
    overflowY: el.scrollHeight - el.clientHeight,
  }));
}

test.describe('code block fits its element', () => {
  test('long code shrinks to fit in the editor and the HTML export', async ({ page, context, pageErrors }, testInfo) => {
    await openEditor(page);
    await importMarkdown(page, fixture('code-fit-deck.md'));

    const pre = editorCanvas(page).locator('pre').first();
    await expect(pre).toContainText('createdAt');
    await expect.poll(async () => (await codeFit(pre)).scale).toBeLessThan(1);
    const fit = await codeFit(pre);
    expect(fit.overflowX).toBeLessThanOrEqual(0);
    expect(fit.overflowY).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('editor.png') });

    const file = await exportHtml(page, testInfo.outputPath());
    const deck = await context.newPage();
    await deck.goto(pathToFileURL(file).href);
    const exported = deck.locator('section.active pre').first();
    await expect(exported).toContainText('createdAt');
    await expect.poll(async () => (await codeFit(exported)).scale).toBeLessThan(1);
    const exportedFit = await codeFit(exported);
    expect(exportedFit.overflowX).toBeLessThanOrEqual(0);
    expect(exportedFit.overflowY).toBeLessThanOrEqual(0);
    await deck.screenshot({ path: testInfo.outputPath('export.png') });

    expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
  });
});
