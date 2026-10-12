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

// Chrome refuses protected folders ("contains system files"), so the picker
// must always be pointed at an allowed starting folder.
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

  it('starts in Documents with a stable picker id when no file is open', async () => {
    await saveToFile(createPresentation(), true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ startIn: 'documents', id: 'cuecard-deck' }));
  });

  it('starts next to the open file on Save As', async () => {
    const deck = createPresentation();
    const open = fakeHandle('talk.cuecard.json');
    setFileHandle(open, deck.id);
    await saveToFile(deck, true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ startIn: open }));
  });
});
