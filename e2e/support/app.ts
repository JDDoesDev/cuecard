import { test as base, expect, type Locator, type Page, type ConsoleMessage } from '@playwright/test';
import path from 'node:path';

// package.json has no "type": "module", so Playwright loads specs as CJS
const here = __dirname;
export const FIXTURES = path.resolve(here, '../fixtures');
export const REPO_ROOT = path.resolve(here, '../..');
export const fixture = (name: string) => path.join(FIXTURES, name);

/** localStorage key used by zustand persist (src/lib/storage/autosave.ts). */
export const AUTOSAVE_KEY = 'cuecard-presentation';

export interface PageErrors {
  /** console.error messages and uncaught page errors, per page, in order. */
  messages: string[];
}

/** Console noise that is not an app error. */
const IGNORED_CONSOLE = [
  /\[vite\]/i,
  /Download the React DevTools/i,
  // Emitted by Playwright itself when a test evaluates inside an
  // <iframe sandbox=""> (html elements); not caused by the app.
  /Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/,
];

function watchErrors(page: Page, sink: string[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    // Reported with its URL by the 'requestfailed' listener below
    if (/^Failed to load resource/.test(text)) return;
    sink.push(`[console.error ${page.url()}] ${text}`);
  });
  page.on('pageerror', (err) => sink.push(`[pageerror ${page.url()}] ${err.message}`));
  page.on('requestfailed', (req) => {
    // Gives "Failed to load resource" console errors a URL
    sink.push(`[requestfailed ${page.url()}] ${req.url().slice(0, 160)} ${req.failure()?.errorText ?? ''}`);
  });
}

/**
 * - Remote demo images (picsum.photos) are served from a local fixture so tests
 *   never depend on the network.
 * - Every page in the context records console errors / page errors into
 *   `pageErrors.messages`; tests that require a clean console assert on it.
 */
export const test = base.extend<{ pageErrors: PageErrors }>({
  context: async ({ context }, use) => {
    await context.route(/^https:\/\/picsum\.photos\//, (route) =>
      route.fulfill({ path: fixture('red-64x48.png'), contentType: 'image/png' }),
    );
    await use(context);
  },
  pageErrors: async ({ context }, use) => {
    const errors: PageErrors = { messages: [] };
    for (const p of context.pages()) watchErrors(p, errors.messages);
    context.on('page', (p) => watchErrors(p, errors.messages));
    await use(errors);
  },
});

export { expect };

// ---------------------------------------------------------------------------
// Editor helpers
// ---------------------------------------------------------------------------

/** Open the editor and wait for the first slide to render on the canvas. */
export async function openEditor(page: Page) {
  await page.goto('/');
  await expect(editorCanvas(page)).toBeVisible();
}

/** The editor's slide canvas (SlideEditor `.slideCanvas`). */
export function editorCanvas(page: Page): Locator {
  return page.locator('[data-slide-container][data-aspect]');
}

/**
 * A positioned element on the editor canvas (SelectableElement root), found by
 * its text. Note: canvas elements have no role/label/test-id of their own.
 */
export function canvasElement(page: Page, text: string): Locator {
  return editorCanvas(page).locator(':scope > div', { hasText: text });
}

/** Wrapper of a rendered slide element (UniversalSlide) inside `scope`. */
export function slideElement(scope: Locator | Page, text: string): Locator {
  // :visible skips PrintView's off-screen copy of every slide
  return scope.locator('[data-element-type]:visible', { hasText: text });
}

/** Import a markdown deck through the Import dialog. Returns the detected slide count. */
export async function importMarkdown(page: Page, files: string | string[]): Promise<number> {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Markdown Presentation' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Select markdown file and images').setInputFiles(files);
  const detected = dialog.getByText(/^\d+ slides? detected$/);
  await expect(detected).toBeVisible();
  const count = parseInt((await detected.textContent()) ?? '0', 10);
  await dialog.getByRole('button', { name: 'Import Presentation' }).click();
  await expect(dialog).toBeHidden();
  return count;
}

/** Wait until the autosave in localStorage contains `needle` (autosave is debounced). */
export async function waitForAutosave(page: Page, needle: string) {
  await expect
    .poll(
      () => page.evaluate((key) => localStorage.getItem(key) ?? '', AUTOSAVE_KEY),
      { message: `autosave to contain ${JSON.stringify(needle)}` },
    )
    .toContain(needle);
}

/** Computed opacity of an element (fragments are hidden with opacity: 0 + transition). */
export function opacityOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).opacity);
}

export async function expectShown(locator: Locator) {
  await expect.poll(() => opacityOf(locator), { message: 'element should be revealed' }).toBe('1');
}

export async function expectHiddenFragment(locator: Locator) {
  await expect.poll(() => opacityOf(locator), { message: 'fragment should be hidden' }).toBe('0');
}

/** Number of slides listed in the editor's slide panel. */
export function slidePanelItems(page: Page): Locator {
  return page.getByRole('button', { name: 'Delete slide' });
}

/** Export the current deck as HTML and return the downloaded file path. */
export async function exportHtml(page: Page, outDir: string): Promise<string> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export Presentation' });
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export as HTML' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const target = `${outDir}/${download.suggestedFilename()}`;
  await download.saveAs(target);
  await expect(dialog).toBeHidden();
  return target;
}

// ---------------------------------------------------------------------------
// In-place text editing helpers
// ---------------------------------------------------------------------------

/** The canvas element currently edited in place (SelectableElement with data-editing). */
export function editingElement(page: Page): Locator {
  return editorCanvas(page).locator('[data-editing]');
}

/** The in-place rich-text surface (Tiptap/ProseMirror root) of the edited element. */
export function inlineEditor(page: Page): Locator {
  return editingElement(page).getByRole('textbox', { name: 'Slide text' });
}

/** Contextual element toolbar shown in the top bar while editing text in place. */
export function textElementToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Text element' });
}

/** Floating inline-format toolbar shown over a text selection. */
export function bubbleToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Text formatting' });
}

/** Double-click a canvas element to edit its text in place; waits for the editor to take focus. */
export async function startInlineEdit(page: Page, element: Locator) {
  await element.dblclick();
  await expect(inlineEditor(page)).toBeFocused();
}

/** Leave in-place editing with Escape. */
export async function exitInlineEdit(page: Page) {
  await page.keyboard.press('Escape');
  await expect(editingElement(page)).toHaveCount(0);
}
