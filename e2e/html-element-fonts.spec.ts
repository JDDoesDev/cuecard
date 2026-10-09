import { pathToFileURL } from 'node:url';
import type { Locator } from '@playwright/test';
import { test, expect, fixture, openEditor, importMarkdown, exportHtml } from './support/app';

/**
 * `html` elements render in <iframe sandbox=""> (opaque origin), so the app's
 * bundled @fontsource files are unreachable from inside; the fonts they use
 * are inlined as data: URIs (src/lib/fonts/fontInline.ts, HtmlFrame.tsx).
 * Fixture deck: one html element using font-family Lato (a bundled font).
 *
 * Note: document.fonts.check() returns true when *no* face matches, so the
 * tests look for a Lato FontFace whose status is 'loaded' instead.
 */

async function latoStatus(iframe: Locator): Promise<string[]> {
  const frame = await (await iframe.elementHandle())!.contentFrame();
  if (!frame) return [];
  return frame.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((f) => f.family.replace(/["']/g, '') === 'Lato' && f.weight === '400')
      .map((f) => f.status);
  });
}

async function expectLatoLoaded(iframe: Locator) {
  await expect.poll(() => latoStatus(iframe), { message: 'Lato 400 loaded inside the iframe' }).toContain('loaded');
  const probeFont = await iframe.contentFrame().locator('.probe').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(probeFont).toMatch(/^"?Lato"?,/);
}

test.describe('html element fonts (sandboxed iframe, inlined fonts)', () => {
  test.beforeEach(async ({ context }) => {
    // Never let Google Fonts satisfy the font: it must come from data: URIs
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  });

  test('Lato renders inside the html element iframe while offline', async ({ page, context, pageErrors }) => {
    await openEditor(page);
    await importMarkdown(page, fixture('html-font-deck.md'));
    await expect(page.locator('[data-slide-container][data-aspect] iframe')).toHaveCount(1);

    // Before fonts are inlined (<= FONT_WAIT_MS) frames use Google Fonts links,
    // which this spec aborts on purpose; only judge what happens offline.
    const errorsBefore = pageErrors.messages.length;
    await context.setOffline(true);
    // Present mode mounts a fresh iframe with no network available
    await page.getByRole('button', { name: '▶ Present' }).click();
    const iframe = page.locator('[data-slide-container]:visible iframe');
    await expect(iframe).toHaveCount(1);
    await expectLatoLoaded(iframe);

    const srcdoc = (await iframe.getAttribute('srcdoc')) ?? '';
    expect(srcdoc).toMatch(/@font-face\{font-family:"?Lato"?[^}]*data:font\//);
    expect(srcdoc).not.toContain('family=Lato');
    expect(pageErrors.messages.slice(errorsBefore), 'console/page errors while offline').toEqual([]);
  });

  test('Lato renders inside the html element iframe of the exported deck opened offline', async ({ page, context }, testInfo) => {
    await openEditor(page);
    await importMarkdown(page, fixture('html-font-deck.md'));
    const file = await exportHtml(page, testInfo.outputPath());

    await context.setOffline(true);
    const deck = await context.newPage();
    await deck.goto(pathToFileURL(file).href);
    const iframe = deck.locator('section.active iframe');
    await expect(iframe).toHaveCount(1);
    await expectLatoLoaded(iframe);
  });

  // KNOWN BUG: the export inlines html-element fonts from a shared pool
  // (data-xfonts + FRAME_FONTS_MARKER), but htmlFrameMarkup
  // (src/lib/export/exportToHTML.ts, buildHtmlSrcdoc(..., { css: FRAME_FONTS_MARKER, inlined: [] }))
  // passes an empty `inlined` list, so every frame still links Google Fonts for
  // all of its families (here Lato and Source Sans 3, 400 + 700). Offline that
  // is 4 failed requests + console errors per frame; online it is needless
  // third-party requests. Fix: pass the pooled families as `inlined`.
  test('exported html element frame makes no network font requests when its fonts are inlined', async ({ page, context, pageErrors }, testInfo) => {
    test.fail(true, 'Known bug: exported html frames link Google Fonts even for families inlined from the font pool');
    await openEditor(page);
    await importMarkdown(page, fixture('html-font-deck.md'));
    const file = await exportHtml(page, testInfo.outputPath());

    const errorsBefore = pageErrors.messages.length;
    await context.setOffline(true);
    const deck = await context.newPage();
    await deck.goto(pathToFileURL(file).href);
    const iframe = deck.locator('section.active iframe');
    await expectLatoLoaded(iframe);
    expect(pageErrors.messages.slice(errorsBefore), 'console/page errors in the offline export').toEqual([]);
  });
});
