import { test, expect, openEditor, canvasElement, editorCanvas } from './support/app';

test('dragging an element across the canvas is undone by a single Ctrl+Z', async ({ page }) => {
  await openEditor(page);
  const heading = canvasElement(page, 'Welcome'); // sample deck, slide 1
  await expect(heading).toBeVisible();

  const styleOf = () => heading.evaluate((el) => ({ left: (el as HTMLElement).style.left, top: (el as HTMLElement).style.top }));
  const original = await styleOf();

  const canvasBox = (await editorCanvas(page).boundingBox())!;
  const box = (await heading.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Many intermediate mousemove events, like a real drag
  await page.mouse.move(startX + canvasBox.width * 0.1, startY + canvasBox.height * 0.2, { steps: 25 });
  await page.mouse.up();

  await expect.poll(styleOf).not.toEqual(original);

  await page.keyboard.press('Control+z');
  await expect.poll(styleOf).toEqual(original);
});
