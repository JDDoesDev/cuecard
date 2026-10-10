import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  openEditor,
  canvasElement,
  slideElement,
  waitForAutosave,
  inlineEditor,
  textElementToolbar,
  exitInlineEdit,
} from './support/app';

/**
 * User-reported bug: centering a text box in the rich-text editor did not
 * stick / did not render centered. Each test starts from a fresh "New text"
 * element (which opens in in-place edit mode) centered via the element toolbar.
 */

const TEXT = 'New text';

async function addTextAndCenterIt(page: Page) {
  await openEditor(page);
  await page.getByRole('button', { name: 'Add Text' }).click();
  const box = canvasElement(page, TEXT);
  await expect(box).toBeVisible();

  // A new text element starts in in-place edit mode
  await expect(inlineEditor(page)).toBeFocused();
  const center = textElementToolbar(page).getByRole('button', { name: 'Align center' });
  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await exitInlineEdit(page);
}

/** The rendered text block (paragraph) of an element. */
function textBlock(scope: Locator): Locator {
  return scope.getByText(TEXT, { exact: true });
}

function textAlignOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).textAlign);
}

/** Vertical offset between the text's center and its container's center, as a fraction of container height. */
async function verticalOffset(container: Locator, text: Locator): Promise<number> {
  const c = (await container.boundingBox())!;
  const t = (await text.boundingBox())!;
  return Math.abs(t.y + t.height / 2 - (c.y + c.height / 2)) / c.height;
}

test.describe('text alignment', () => {
  test('center align from text edit mode renders centered on the editor canvas', async ({ page }) => {
    await addTextAndCenterIt(page);
    await expect.poll(() => textAlignOf(textBlock(canvasElement(page, TEXT)))).toBe('center');
  });

  test('centered text stays centered in present mode', async ({ page }) => {
    await addTextAndCenterIt(page);
    await page.getByRole('button', { name: '▶ Present' }).click();
    const el = slideElement(page, TEXT);
    await expect(el).toBeVisible();
    await expect.poll(() => textAlignOf(textBlock(el))).toBe('center');
  });

  test('vertical align middle centers the text in the editor and in present mode', async ({ page }) => {
    await addTextAndCenterIt(page);
    const box = canvasElement(page, TEXT);
    await box.click();
    await page.getByTitle('Vertical text alignment').selectOption('middle');

    await expect.poll(() => verticalOffset(box, textBlock(box))).toBeLessThan(0.1);
    await expect.poll(() => textAlignOf(textBlock(box))).toBe('center');

    await page.getByRole('button', { name: '▶ Present' }).click();
    const el = slideElement(page, TEXT);
    await expect.poll(() => verticalOffset(el, textBlock(el))).toBeLessThan(0.1);
    await expect.poll(() => textAlignOf(textBlock(el))).toBe('center');
  });

  test('undo reverts the centering and redo restores it', async ({ page }) => {
    await addTextAndCenterIt(page);
    const block = textBlock(canvasElement(page, TEXT));
    await expect.poll(() => textAlignOf(block)).toBe('center');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => textAlignOf(textBlock(canvasElement(page, TEXT)))).not.toBe('center');
    // The element itself must survive the single undo
    await expect(canvasElement(page, TEXT)).toBeVisible();

    await page.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => textAlignOf(textBlock(canvasElement(page, TEXT)))).toBe('center');
  });

  test('centering survives a page reload (autosave)', async ({ page }) => {
    await addTextAndCenterIt(page);
    await waitForAutosave(page, 'center');
    await page.reload();
    await expect(canvasElement(page, TEXT)).toBeVisible();
    await expect.poll(() => textAlignOf(textBlock(canvasElement(page, TEXT)))).toBe('center');
  });
});
