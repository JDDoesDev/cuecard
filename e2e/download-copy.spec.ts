import fs from 'node:fs';
import { test, expect, openEditor } from './support/app';

test('Download saves a .cuecard.json copy through the browser downloads', async ({ page, pageErrors }, testInfo) => {
  await openEditor(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.cuecard\.json$/);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json).toBeTruthy();
  expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
});
