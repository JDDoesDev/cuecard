import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setFileHandle, getFileHandle, writeToCurrentFile, isFileForPresentation } from '../fileStorage';
import { createPresentation } from '@/types/presentation';

function fakeHandle() {
  const write = vi.fn();
  const handle = {
    name: 'deck.cuecard.json',
    createWritable: vi.fn(async () => ({ write, close: vi.fn() })),
  } as unknown as FileSystemFileHandle;
  return { handle, write };
}

describe('open file belongs to one presentation', () => {
  beforeEach(() => setFileHandle(null));

  it('writes the deck the file was opened/saved with', async () => {
    const deck = createPresentation();
    const { handle, write } = fakeHandle();
    setFileHandle(handle, deck.id);
    expect(isFileForPresentation(deck)).toBe(true);
    expect(await writeToCurrentFile(deck)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('never writes a different deck into the file and detaches instead', async () => {
    const saved = createPresentation();
    const imported = createPresentation();
    const { handle, write } = fakeHandle();
    setFileHandle(handle, saved.id);
    expect(await writeToCurrentFile(imported)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(getFileHandle()).toBeNull();
  });
});
