import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  openEditor,
  editorCanvas,
  canvasElement,
  slideElement,
  waitForAutosave,
  editingElement,
  inlineEditor,
  textElementToolbar,
  bubbleToolbar,
  startInlineEdit,
  exitInlineEdit,
} from './support/app';

/**
 * In-place text editing: heading/text/list elements are edited directly on the
 * slide canvas (no separate edit screen), with a bubble toolbar for inline
 * formatting and an element toolbar in the canvas' top bar.
 * The sample deck's slide 1 has a "Welcome" heading and a
 * "Markdown-First Presentations" text element; slide 2 a 4-item list.
 */

const SUBTITLE = 'Markdown-First Presentations';

type Box = { x: number; y: number; width: number; height: number };

function expectSameBox(actual: Box | null, expected: Box | null, tolerance = 0.5) {
  expect(actual).not.toBeNull();
  expect(expected).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual![key] - expected![key]), `${key}: ${actual![key]} vs ${expected![key]}`).toBeLessThanOrEqual(tolerance);
  }
}

const fontSizeOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);

/** Next slide: click empty canvas (nothing selected), then ArrowRight. */
async function nextSlide(page: Page) {
  await editorCanvas(page).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
}

test.describe('in-place text editing', () => {
  test('double-click edits a heading in place: same position, same font size, no separate screen', async ({ page }) => {
    await openEditor(page);
    const heading = canvasElement(page, 'Welcome');
    const renderedH1 = heading.locator('h1');
    await expect(renderedH1).toBeVisible();

    const canvasBefore = await editorCanvas(page).boundingBox();
    const boxBefore = await heading.boundingBox();
    const textBefore = await renderedH1.boundingBox();
    const fontBefore = await fontSizeOf(renderedH1);

    await startInlineEdit(page, heading);

    // Edited on the canvas, not on a separate screen
    await expect(page.getByRole('button', { name: 'Back to canvas' })).toHaveCount(0);
    await expect(editorCanvas(page)).toBeVisible();
    await expect(canvasElement(page, SUBTITLE)).toBeVisible(); // other elements stay visible
    await expect(textElementToolbar(page)).toBeVisible();

    // WYSIWYG: the editable heading is laid out exactly like the rendered one
    const editingH1 = inlineEditor(page).locator('h1');
    await expect(editingH1).toHaveText('Welcome');
    expect(await fontSizeOf(editingH1)).toBe(fontBefore);
    expectSameBox(await editorCanvas(page).boundingBox(), canvasBefore);
    expectSameBox(await editingElement(page).boundingBox(), boxBefore);
    expectSameBox(await editingH1.boundingBox(), textBefore);

    await exitInlineEdit(page);
    // Focus returns to the canvas and the element stays selected (Enter re-enters editing)
    await expect(editorCanvas(page)).toBeFocused();
    expectSameBox(await editorCanvas(page).boundingBox(), canvasBefore);
    await page.keyboard.press('Enter');
    await expect(inlineEditor(page)).toBeFocused();
  });

  test('list items keep their rendered layout while editing', async ({ page }) => {
    await openEditor(page);
    await nextSlide(page);
    const list = canvasElement(page, 'Theme Support');
    const renderedItem = list.locator('li').nth(1);
    await expect(renderedItem).toHaveText('Theme Support');
    const itemBefore = await renderedItem.boundingBox();
    const fontBefore = await fontSizeOf(renderedItem);

    await startInlineEdit(page, list);
    const editingItem = inlineEditor(page).locator('li').nth(1);
    await expect(editingItem).toHaveText('Theme Support');
    expect(await fontSizeOf(editingItem)).toBe(fontBefore);
    expectSameBox(await editingItem.boundingBox(), itemBefore);
  });

  test('bubble toolbar applies bold to the selection', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, 'Welcome'));
    await page.keyboard.press('ControlOrMeta+a');

    const bubble = bubbleToolbar(page);
    await expect(bubble).toBeVisible();
    const bold = bubble.getByRole('button', { name: 'Bold' });
    await expect(bold).toHaveAttribute('title', 'Bold (Ctrl+B)');
    await bold.click();
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(inlineEditor(page).locator('h1 strong')).toHaveText('Welcome');
    // The editor kept focus and selection
    await expect(inlineEditor(page)).toBeFocused();

    await exitInlineEdit(page);
    await expect(canvasElement(page, 'Welcome').locator('h1 strong')).toHaveText('Welcome');
  });

  test('bubble toolbar adds a link to the selection', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    await bubbleToolbar(page).getByRole('button', { name: 'Add link' }).click();
    const url = bubbleToolbar(page).getByRole('textbox', { name: 'Link URL' });
    await expect(url).toBeFocused();
    await url.fill('example.com');
    await url.press('Enter');
    await expect(inlineEditor(page).locator('a[href="https://example.com"]')).toHaveText(SUBTITLE);

    // Unsafe URLs are rejected with an error, nothing changes
    await page.keyboard.press('ControlOrMeta+a');
    await bubbleToolbar(page).getByRole('button', { name: 'Edit link' }).click();
    await url.fill('javascript:alert(1)');
    await url.press('Enter');
    await expect(bubbleToolbar(page).getByRole('alert')).toBeVisible();
    await expect(inlineEditor(page).locator('a[href="https://example.com"]')).toHaveCount(1);

    // Remove the link
    await bubbleToolbar(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(inlineEditor(page).locator('a')).toHaveCount(0);
    await expect(inlineEditor(page)).toHaveText(SUBTITLE);

    await exitInlineEdit(page);
    await expect(canvasElement(page, SUBTITLE).locator('a')).toHaveCount(0);
  });

  test('bubble toolbar applies a font family', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    await bubbleToolbar(page).getByRole('button', { name: 'Font', exact: true }).click();
    await bubbleToolbar(page).getByRole('menuitem', { name: 'Lato' }).click();
    const span = inlineEditor(page).locator('span[style*="Lato"]');
    await expect(span).toHaveText(SUBTITLE);
    expect(await span.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Lato');

    await exitInlineEdit(page);
    await expect(canvasElement(page, SUBTITLE).locator('span[style*="Lato"]')).toHaveText(SUBTITLE);
  });

  test('insert a table into a text element and add a row', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+End');
    const toolbar = textElementToolbar(page);
    await toolbar.getByRole('button', { name: 'Insert table' }).click();
    await page.getByRole('button', { name: 'Insert 2 by 3 table' }).click();

    const rows = inlineEditor(page).locator('table tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('th, td')).toHaveCount(3);
    await expect(inlineEditor(page)).toBeFocused();

    // The cursor is in the table: table tools appear
    await toolbar.getByRole('button', { name: 'Add row below' }).click();
    await expect(rows).toHaveCount(3);

    await exitInlineEdit(page);
    await expect(canvasElement(page, SUBTITLE).locator('table tr')).toHaveCount(3);
  });

  test('headings have no table tools', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, 'Welcome'));
    await expect(textElementToolbar(page).getByRole('button', { name: 'Bulleted list' })).toBeVisible();
    await expect(textElementToolbar(page).getByRole('button', { name: 'Insert table' })).toHaveCount(0);
  });

  test('indent nests a list item', async ({ page }) => {
    await openEditor(page);
    await nextSlide(page);
    await startInlineEdit(page, canvasElement(page, 'Theme Support'));
    await inlineEditor(page).getByText('Theme Support').click();
    const toolbar = textElementToolbar(page);
    await expect(toolbar.getByRole('button', { name: 'Increase indent' })).toBeEnabled();
    await toolbar.getByRole('button', { name: 'Increase indent' }).click();
    await expect(inlineEditor(page).locator('li li')).toHaveText('Theme Support');
    // Nested item can be outdented again; a top-level item of a list element can't
    await expect(toolbar.getByRole('button', { name: 'Decrease indent' })).toBeEnabled();

    await exitInlineEdit(page);
    await expect(canvasElement(page, 'Theme Support').locator('li li')).toHaveText('Theme Support');
  });

  test('Backspace at the start of the first list item keeps the list intact', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(inlineEditor(page)).toBeFocused();
    await textElementToolbar(page).getByRole('combobox', { name: 'Element type' }).selectOption('list');
    await expect(inlineEditor(page)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('First item');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second item');
    await expect(inlineEditor(page).locator('ul > li')).toHaveCount(2);

    await inlineEditor(page).getByText('First item').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(inlineEditor(page).locator('ul > li')).toHaveText(['First item', 'Second item']);

    await exitInlineEdit(page);
    const list = canvasElement(page, 'First item');
    await expect(list.locator('li')).toHaveText(['First item', 'Second item']);
    await waitForAutosave(page, 'Second item');
    await page.reload();
    await expect(canvasElement(page, 'First item').locator('li')).toHaveText(['First item', 'Second item']);
  });

  test('moving focus out of the editor with Tab ends editing', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, 'Welcome'));
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.keyboard.press('Tab');
    await expect(editingElement(page)).toHaveCount(0);
    await expect(canvasElement(page, 'Welcome!')).toBeVisible();
  });

  test('pasting Google Docs HTML keeps formatting but drops the noise', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    const gdocs =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d">' +
      '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">' +
      '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">Pasted bold</span>' +
      '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;"> and plain</span>' +
      '</p></b>';
    await inlineEditor(page).evaluate((el, html) => {
      const data = new DataTransfer();
      data.setData('text/html', html);
      data.setData('text/plain', 'Pasted bold and plain');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, gdocs);

    await expect(inlineEditor(page)).toHaveText('Pasted bold and plain');
    await expect(inlineEditor(page).locator('strong')).toHaveText('Pasted bold');
    const html = await inlineEditor(page).innerHTML();
    expect(html).not.toContain('docs-internal-guid');
    expect(html).not.toContain('white-space');
    expect(html).not.toContain('Arial');

    await exitInlineEdit(page);
    await expect(canvasElement(page, 'Pasted bold and plain').locator('strong')).toHaveText('Pasted bold');
  });

  test('Escape exits and the typed text persists', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('End');
    await page.keyboard.type(' rock');

    await exitInlineEdit(page);
    // Escape leaves edit mode only; the element stays selected (no deselect)
    await expect(canvasElement(page, `${SUBTITLE} rock`)).toBeVisible();
    await waitForAutosave(page, `${SUBTITLE} rock`);
  });

  test('clicking outside the element exits and persists immediately', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Clicked away');

    // Empty top-left corner of the slide
    const canvas = (await editorCanvas(page).boundingBox())!;
    await page.mouse.click(canvas.x + canvas.width * 0.03, canvas.y + canvas.height * 0.05);

    await expect(editingElement(page)).toHaveCount(0);
    await expect(canvasElement(page, 'Clicked away')).toBeVisible();
    await waitForAutosave(page, 'Clicked away');
  });

  test('canvas shortcuts do not fire while editing', async ({ page }) => {
    await openEditor(page);
    const id = await canvasElement(page, SUBTITLE).getAttribute('data-element-id');
    const subtitle = editorCanvas(page).locator(`[data-element-id="${id}"]`);
    const left = () => subtitle.evaluate((el) => (el as HTMLElement).style.left);
    const leftBefore = await left();

    await startInlineEdit(page, subtitle);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace'); // deletes a character, not the element
    await page.keyboard.press('Delete');
    await exitInlineEdit(page);

    await expect(subtitle).toHaveText('Markdown-First Presentatio');
    expect(await left()).toBe(leftBefore);
  });

  test('a typing burst is undone in a single step (Ctrl+Z inside the editor)', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Hello there friend', { delay: 20 });

    // Undo right away: pending (debounced) text is committed first, then the
    // whole burst is reverted at once
    await page.keyboard.press('ControlOrMeta+z');
    await expect(inlineEditor(page)).toHaveText(SUBTITLE);
    await expect(editingElement(page)).toHaveCount(1); // still editing

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(inlineEditor(page)).toHaveText('Hello there friend');

    await exitInlineEdit(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(canvasElement(page, SUBTITLE)).toBeVisible();
    await expect(canvasElement(page, 'Hello there friend')).toHaveCount(0);
  });

  test('a new text element starts in edit mode with its text selected', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(inlineEditor(page)).toBeFocused();
    await expect(inlineEditor(page)).toHaveText('New text');

    await page.keyboard.type('Fresh idea');
    await expect(inlineEditor(page)).toHaveText('Fresh idea');
    await exitInlineEdit(page);
    await expect(canvasElement(page, 'Fresh idea')).toBeVisible();
    await expect(canvasElement(page, 'New text')).toHaveCount(0);
  });

  test('the element toolbar changes the element type and list style', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    const toolbar = textElementToolbar(page);

    await toolbar.getByRole('combobox', { name: 'Element type' }).selectOption('heading-2');
    await expect(inlineEditor(page).locator('h2')).toHaveText(SUBTITLE);

    await toolbar.getByRole('button', { name: 'Numbered list' }).click();
    await expect(inlineEditor(page).locator('ol > li')).toHaveText(SUBTITLE);
    await expect(toolbar.getByRole('button', { name: 'Numbered list' })).toHaveAttribute('aria-pressed', 'true');

    // Every toolbar button has an accessible name and a tooltip
    for (const button of await toolbar.getByRole('button').all()) {
      expect(await button.getAttribute('aria-label')).toBeTruthy();
      expect(await button.getAttribute('title')).toBeTruthy();
    }

    await toolbar.getByRole('button', { name: 'Done editing' }).click();
    await expect(editingElement(page)).toHaveCount(0);
    await expect(canvasElement(page, SUBTITLE).locator('ol > li')).toHaveText(SUBTITLE);
  });

  test('slide thumbnails update while typing', async ({ page }) => {
    await openEditor(page);
    await startInlineEdit(page, canvasElement(page, SUBTITLE));
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Live thumbnail');

    // Still editing; the slide panel preview (UniversalSlide) already shows the text
    await expect(editingElement(page)).toHaveCount(1);
    await expect(slideElement(page, 'Live thumbnail')).toBeVisible();
  });
});
