import fs from 'node:fs';
import { test, expect, openEditor, importMarkdown, fixture, slidePanelItems } from './support/app';

test('Save downloads a deck that Open loads again', async ({ page, pageErrors }, testInfo) => {
  await openEditor(page);
  await importMarkdown(page, fixture('sync-deck.md'));
  const slideCount = await slidePanelItems(page).count();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.cuecard\.json$/);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  expect(fs.readFileSync(file, 'utf8')).toContain('E2E Sync Deck');

  // Replace the deck, then open the copy through the ordinary file input
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(slidePanelItems(page)).not.toHaveCount(slideCount);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open', exact: true }).click(),
  ]);
  await chooser.setFiles(file);
  await expect(slidePanelItems(page)).toHaveCount(slideCount);
  await expect(page.getByRole('heading', { name: 'Slide One' }).first()).toBeVisible();

  expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
});
