import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, fixture, openEditor, editorCanvas, importMarkdown, waitForAutosave } from './support/app';

/**
 * User-reported bug: uploaded images disappear after switching between files.
 * Flow: upload image -> save deck -> load a different deck -> reopen the first
 * deck -> image must display (and still display after a page reload).
 *
 * Save downloads the file and Open uses <input type=file>.
 */

async function uploadImage(page: Page) {
  await page.getByRole('button', { name: 'Add Image' }).click();
  await page.getByLabel(/Drop images here/).setInputFiles(fixture('red-64x48.png'));
  await expectCanvasImageLoaded(page);
}

async function expectCanvasImageLoaded(page: Page) {
  const img = editorCanvas(page).locator('img');
  await expect(img).toHaveCount(1);
  await expect(editorCanvas(page).locator('[data-missing-image]')).toHaveCount(0);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0)), {
      message: 'image should be decoded (naturalWidth > 0)',
    })
    .toBeGreaterThan(0);
}

async function loadOtherDeck(page: Page) {
  await importMarkdown(page, fixture('other-deck.md'));
  await expect(editorCanvas(page).getByRole('heading', { name: 'Other Deck' })).toBeVisible();
  await expect(editorCanvas(page).locator('img')).toHaveCount(0);
}

async function expectFirstDeckWithImage(page: Page) {
  await expect(editorCanvas(page).getByText('Welcome')).toBeVisible();
  await expectCanvasImageLoaded(page);
}

test.describe('images across file switches', () => {
  test('image survives save -> open other deck -> reopen -> reload', async ({ page }, testInfo) => {
    await openEditor(page);
    await uploadImage(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.cuecard\.json$/);
    const savedPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(savedPath);
    // Uploaded images are embedded so the file works on another machine
    expect(fs.readFileSync(savedPath, 'utf8')).toContain('"assets"');

    await loadOtherDeck(page);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await (await chooserPromise).setFiles(savedPath);
    await expectFirstDeckWithImage(page);

    await waitForAutosave(page, 'Welcome');
    await page.reload();
    await expectFirstDeckWithImage(page);
  });
});
