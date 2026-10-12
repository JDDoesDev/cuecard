// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadCopy, getFileHandle, setFileHandle, parsePresentationFile } from '../fileStorage';
import { createPresentation } from '@/types/presentation';

// jsdom's Blob has no .text()
const readBlob = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(b);
  });

describe('downloadCopy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads the deck as .cuecard.json without touching the open file', async () => {
    let blob: Blob | undefined;
    // jsdom lacks these, so stub them for this test only
    vi.stubGlobal('URL', Object.assign(Object.create(URL), {
      createObjectURL: (b: Blob) => ((blob = b), 'blob:x'),
      revokeObjectURL: () => {},
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const handle = { name: 'talk.cuecard.json' } as FileSystemFileHandle;
    const deck = { ...createPresentation(), title: 'The Hook Migration' };
    setFileHandle(handle, deck.id);

    const name = await downloadCopy(deck);

    expect(name).toBe('The Hook Migration.cuecard.json');
    expect(click).toHaveBeenCalledTimes(1);
    expect(getFileHandle()).toBe(handle);
    const reopened = await parsePresentationFile(await readBlob(blob!));
    expect(reopened.title).toBe('The Hook Migration');
    setFileHandle(null);
  });
});
