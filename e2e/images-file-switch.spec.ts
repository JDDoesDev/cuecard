import type { Page } from '@playwright/test';
import { test, expect, fixture, openEditor, editorCanvas, importMarkdown, waitForAutosave } from './support/app';

/**
 * User-reported bug: uploaded images disappear after switching between files.
 * Flow: upload image -> save deck -> load a different deck -> reopen the first
 * deck -> image must display (and still display after a page reload).
 *
 * Two variants, because Chromium users take the File System Access API path
 * while other browsers use download + <input type=file>:
 *  - "download fallback": showSaveFilePicker/showOpenFilePicker removed.
 *  - "File System Access": pickers replaced by in-memory file handles.
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

test.describe('images across file switches (download / file-input fallback)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Force the non-File-System-Access code path
      delete (window as any).showSaveFilePicker;
      delete (window as any).showOpenFilePicker;
    });
  });

  test('image survives save -> open other deck -> reopen -> reload', async ({ page }, testInfo) => {
    await openEditor(page);
    await uploadImage(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.cuecard\.json$/);
    const savedPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(savedPath);

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

test.describe('images across file switches (File System Access API)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // In-memory stand-in for the native file pickers. Files live on window
      // for the lifetime of the document.
      const contents = new Map<string, string>();
      const handles = new Map<string, any>();
      class FakeFileHandle {
        kind = 'file' as const;
        constructor(public name: string) {}
        async createWritable() {
          const parts: BlobPart[] = [];
          return {
            write: async (data: any) => { parts.push(data?.data ?? data); },
            close: async () => { contents.set(this.name, await new Blob(parts).text()); },
          };
        }
        async getFile() {
          return new File([contents.get(this.name) ?? ''], this.name, { type: 'application/json' });
        }
        async queryPermission() { return 'granted'; }
        async requestPermission() { return 'granted'; }
        async isSameEntry(other: unknown) { return other === this; }
      }
      const handleFor = (name: string) => {
        if (!handles.has(name)) handles.set(name, new FakeFileHandle(name));
        return handles.get(name);
      };
      const w = window as any;
      w.__fakeFs = { contents, nextSaveName: null as string | null, nextOpenName: null as string | null };
      w.showSaveFilePicker = async (opts?: { suggestedName?: string }) =>
        handleFor(w.__fakeFs.nextSaveName ?? opts?.suggestedName ?? 'untitled.cuecard.json');
      w.showOpenFilePicker = async () => {
        const name = w.__fakeFs.nextOpenName;
        if (!name || !contents.has(name)) throw new DOMException('No file chosen', 'AbortError');
        return [handleFor(name)];
      };
    });
  });

  const fakeFile = (page: Page, name: string) =>
    page.evaluate((n) => (window as any).__fakeFs.contents.get(n) as string | undefined, name);

  async function saveAs(page: Page, name: string) {
    await page.evaluate((n) => { (window as any).__fakeFs.nextSaveName = n; }, name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fakeFile(page, name)).toBeTruthy();
  }

  async function open(page: Page, name: string) {
    await page.evaluate((n) => { (window as any).__fakeFs.nextOpenName = n; }, name);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
  }

  test('image survives save -> open other deck -> reopen -> reload', async ({ page }) => {
    await openEditor(page);
    await uploadImage(page);
    await saveAs(page, 'first.cuecard.json');
    expect(await fakeFile(page, 'first.cuecard.json')).toContain('"assets"');

    await loadOtherDeck(page);
    await open(page, 'first.cuecard.json');
    await expectFirstDeckWithImage(page);

    await waitForAutosave(page, 'Welcome');
    await page.reload();
    await expectFirstDeckWithImage(page);
  });

  // KNOWN BUG (data loss): after Save/Open via the File System Access API the
  // file handle stays active (module state in src/lib/storage/fileStorage.ts).
  // Importing markdown (MarkdownImportDialog.handleImport -> setPresentation)
  // and "New" (EditorToolbar only calls setCurrentFileName(null)) never clear
  // it, so setupFileAutoSave/scheduleFileWrite (src/lib/storage/autosave.ts)
  // writes the *other* deck into the previously saved file ~2s later. Reopening
  // that file then shows the wrong deck and its images are gone.
  // Remove test.fail() once deck switches call setFileHandle(null).
  test('importing another deck does not overwrite the previously saved file', async ({ page }) => {
    test.fail(true, 'Known bug: active file handle is not cleared on markdown import; autosave overwrites the saved file');
    await openEditor(page);
    await uploadImage(page);
    await saveAs(page, 'first.cuecard.json');

    await loadOtherDeck(page);
    // File autosave is debounced by 2s (FILE_WRITE_DELAY_MS); give it time to fire
    await page.waitForTimeout(3000);
    const saved = await fakeFile(page, 'first.cuecard.json');
    expect(saved).not.toContain('E2E Other Deck');
    expect(saved).toContain('Welcome');
  });

  test('starting a New presentation does not overwrite the previously saved file', async ({ page }) => {
    test.fail(true, 'Known bug: "New" does not clear the active file handle; autosave overwrites the saved file');
    await openEditor(page);
    await uploadImage(page);
    await saveAs(page, 'first.cuecard.json');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'New', exact: true }).click();
    // A new deck has no slides (and therefore no canvas)
    await expect(editorCanvas(page)).toHaveCount(0);
    // File autosave is debounced by 2s (FILE_WRITE_DELAY_MS); give it time to fire
    await page.waitForTimeout(3000);
    const saved = await fakeFile(page, 'first.cuecard.json');
    expect(saved).toContain('Welcome');
    expect(saved).toContain('"assets"');
  });
});
