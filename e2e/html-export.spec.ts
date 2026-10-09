import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  test,
  expect,
  fixture,
  openEditor,
  importMarkdown,
  waitForAutosave,
  expectShown,
  expectHiddenFragment,
  AUTOSAVE_KEY,
  exportHtml,
} from './support/app';

test.describe('HTML export', () => {
  test('exported HTML is a working standalone deck with slides and fragments', async ({ page, context, pageErrors }, testInfo) => {
    await openEditor(page);
    await importMarkdown(page, fixture('sync-deck.md'));

    const file = await exportHtml(page, testInfo.outputPath());
    expect(fs.readFileSync(file, 'utf8')).toContain('E2E Sync Deck');

    const deck = await context.newPage();
    await deck.goto(pathToFileURL(file).href);

    await expect(deck.locator('section[aria-roledescription="slide"]')).toHaveCount(3);
    const counter = deck.getByText(/^\d+ \/ 3$/);
    const active = deck.locator('section.active');
    // Computed opacity, not just the class: the runtime-toggled .xf-hidden
    // rule must survive CSS pruning (it matches nothing at export time).
    const alpha = active.locator('[data-fragment]', { hasText: 'Fragment Alpha' });
    const bravo = active.locator('[data-fragment]', { hasText: 'Fragment Bravo' });

    await expect(counter).toHaveText('1 / 3');
    await expect(active.getByRole('heading', { name: 'Slide One' })).toBeVisible();

    await deck.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 3');
    await expectHiddenFragment(alpha);
    await expectHiddenFragment(bravo);

    await deck.keyboard.press('ArrowRight');
    await expectShown(alpha);
    await expectHiddenFragment(bravo);

    await deck.keyboard.press('ArrowRight');
    await expectShown(bravo);

    await deck.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('3 / 3');
    await expect(active.getByRole('heading', { name: 'Slide Three' })).toBeVisible();

    // Going back lands on the previous slide with all fragments revealed
    await deck.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('2 / 3');
    await expectShown(alpha);
    await expectShown(bravo);

    expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
  });

  test('pruned export CSS keeps layout, scaling and the theme background', async ({ page, context, pageErrors }, testInfo) => {
    await openEditor(page);
    await importMarkdown(page, fixture('sync-deck.md'));
    await waitForAutosave(page, 'E2E Sync Deck');

    // Reference values from the app itself
    const headingPos = await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      const el = saved.state.presentation.slides[0].elements.find((e: any) => e.type === 'heading');
      return el.position as { x: number; y: number; width: number; height: number };
    }, AUTOSAVE_KEY);
    await page.getByRole('button', { name: '▶ Present' }).click();
    const appSlide = page.locator('[data-slide-container]:visible').first();
    const appBg = await appSlide.evaluate((el) => getComputedStyle(el).backgroundColor);
    const appFontRatio = await appSlide.evaluate((el) => {
      const h = el.querySelector('h1')!;
      return parseFloat(getComputedStyle(h).fontSize) / (el as HTMLElement).offsetWidth;
    });
    await page.getByRole('button', { name: '✎ Edit Mode' }).click();

    const file = await exportHtml(page, testInfo.outputPath());
    const deck = await context.newPage();
    await deck.setViewportSize({ width: 1440, height: 900 });
    await deck.goto(pathToFileURL(file).href);

    const active = deck.locator('section.active');
    await expect(active.getByRole('heading', { name: 'Slide One' })).toBeVisible();

    // 16:9 stage on a 1440x900 viewport: 1440x810, vertically centered
    const stage = (await active.boundingBox())!;
    expect(stage.width).toBeCloseTo(1440, 0);
    expect(stage.height).toBeCloseTo(810, 0);
    expect(stage.y).toBeCloseTo(45, 0);

    const box = (await active.locator('[data-element-type="heading"]').boundingBox())!;
    const tol = 2;
    expect(Math.abs(box.x - (stage.x + (headingPos.x / 100) * stage.width))).toBeLessThan(tol);
    expect(Math.abs(box.y - (stage.y + (headingPos.y / 100) * stage.height))).toBeLessThan(tol);
    expect(Math.abs(box.width - (headingPos.width / 100) * stage.width)).toBeLessThan(tol);
    expect(box.height).toBeGreaterThanOrEqual((headingPos.height / 100) * stage.height - tol);

    // Container-query scaling: heading size relative to slide width matches the app
    const exportFontRatio = await active.evaluate((el) => {
      const h = el.querySelector('h1')!;
      return parseFloat(getComputedStyle(h).fontSize) / (el as HTMLElement).offsetWidth;
    });
    expect(exportFontRatio).toBeCloseTo(appFontRatio, 3);

    // Theme background applied to the slide (not the black deck backdrop)
    const exportBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(exportBg).toBe(appBg);
    expect(exportBg).not.toBe('rgba(0, 0, 0, 0)');

    expect(pageErrors.messages, 'console errors / page errors').toEqual([]);
  });
});
