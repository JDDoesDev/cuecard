// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveToFile, setFileHandle } from '../fileStorage';
import { createPresentation } from '@/types/presentation';

function fakeHandle(name = 'deck.cuecard.json') {
  return {
    name,
    createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
  } as unknown as FileSystemFileHandle;
}

describe('save picker starting folder', () => {
  const picker = vi.fn(async () => fakeHandle());

  beforeEach(() => {
    setFileHandle(null);
    picker.mockClear();
    (window as any).showSaveFilePicker = picker;
  });
  afterEach(() => {
    delete (window as any).showSaveFilePicker;
  });

  it("leaves the folder to Chrome (last used) when no file is linked", async () => {
    await saveToFile(createPresentation(), true);
    const opts = (picker.mock.calls[0] as unknown[])[0] as SaveFilePickerOptions;
    expect(opts.startIn).toBeUndefined();
    expect(opts.id).toBeUndefined();
  });

  it('starts next to the open file on Save As', async () => {
    const deck = createPresentation();
    const open = fakeHandle('talk.cuecard.json');
    setFileHandle(open, deck.id);
    await saveToFile(deck, true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ startIn: open }));
  });
});
