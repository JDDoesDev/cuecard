import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => void idb.set(k, v),
  del: async (k: string) => void idb.delete(k),
  keys: async () => [...idb.keys()],
}));

import type { Presentation } from '@/types/presentation';
import type { ImageElement } from '@/types/slide';
import {
  buildPresentationFile,
  contentSignature,
  serializePresentationFile,
  parsePresentationFile,
  formatValidationError,
  PresentationFileError,
} from '../fileStorage';
import { cacheImageBlob, hashImageBlob } from '@/lib/media/imageCaching';
import { PresentationSchema } from '@/types/presentation';
import { computeImageRestoreUpdates } from '@/lib/media/imageRestore';

function makePresentation(cacheKey: string, cachedUrl: string): Presentation {
  return {
    id: 'p1',
    title: 'Pics',
    theme: 'default',
    aspectRatio: '4:3',
    slides: [
      {
        id: 's1',
        layout: 'freestyle',
        elements: [
          { id: 'i1', type: 'image', position: { x: 0, y: 0, width: 50, height: 50 }, url: 'cat.png', cacheKey, cachedUrl },
        ],
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Presentation;
}

describe('presentation file assets', () => {
  beforeEach(() => idb.clear());

  it('embeds image blobs as data URIs and strips blob: cachedUrls', async () => {
    const { cacheKey, blobUrl } = await cacheImageBlob(new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }));
    const file = await buildPresentationFile(makePresentation(cacheKey, blobUrl));
    expect(file.assets).toEqual({ [cacheKey]: 'data:image/png;base64,CQgH' });
    const el = file.slides[0].elements[0] as ImageElement;
    expect(el.cachedUrl).toBeUndefined();
    expect(el.cacheKey).toBe(cacheKey);
  });

  it('round-trips: opening on a "fresh browser" re-imports assets into IndexedDB', async () => {
    const { cacheKey, blobUrl } = await cacheImageBlob(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }));
    const json = await serializePresentationFile(makePresentation(cacheKey, blobUrl));

    idb.clear(); // simulate another machine / cleared site data
    const opened = await parsePresentationFile(json);

    const el = opened.slides[0].elements[0] as ImageElement;
    expect(el.cacheKey).toBe(cacheKey);
    expect(el.cachedUrl).toBeUndefined();
    expect(opened.aspectRatio).toBe('4:3');
    expect((opened as unknown as Record<string, unknown>).assets).toBeUndefined();
    const restored = idb.get(cacheKey) as Blob;
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('opens legacy files without assets (demo file)', async () => {
    const text = readFileSync(path.resolve(__dirname, '../../../../demo/Test Presentation.cuecard.json'), 'utf8');
    const opened = await parsePresentationFile(text);
    expect(opened.title).toBe('Test Presentation');
    expect(opened.slides.length).toBeGreaterThan(0);
  });

  it('throws friendly errors for bad files', async () => {
    await expect(parsePresentationFile('{oops')).rejects.toBeInstanceOf(PresentationFileError);
    await expect(parsePresentationFile('[]')).rejects.toThrow('does not contain a presentation');

    // Errors thrown inside migratePresentation become friendly PresentationFileErrors
    const bad = { id: 'x', title: 'x', theme: 'default', slides: [{ id: 's', layout: 'freestyle', elements: [{ id: 'e', type: 'bogus' }] }] };
    const migrateErr = await parsePresentationFile(JSON.stringify(bad)).catch((e) => e);
    expect(migrateErr).toBeInstanceOf(PresentationFileError);
    expect(migrateErr.message).not.toMatch(/"code"/);

    // Zod errors are summarised, not dumped
    const zodResult = PresentationSchema.safeParse({ id: 'x', title: 'x', theme: 'default', createdAt: '', updatedAt: '', slides: [{ id: 's', layout: 'freestyle', elements: [{ id: 'e', type: 'bogus' }] }] });
    expect(zodResult.success).toBe(false);
    const message = formatValidationError(zodResult.error);
    expect(message).toMatch(/^The presentation has invalid content — slide 1 > element 1/);
    expect(message).not.toMatch(/"code"/);
    const err = new PresentationFileError(message);
    expect(formatValidationError(err)).toBe(err.message);
  });

  it('ignores non-image asset keys', async () => {
    idb.set('image-names', { 'a.png': 'image:keep' });
    const file = { ...makePresentation('image:k', ''), assets: { 'image-names': 'data:text/plain,evil', 'image:k': 'data:image/png;base64,AQ==' } };
    await parsePresentationFile(JSON.stringify(file));
    expect(idb.get('image-names')).toEqual({ 'a.png': 'image:keep' });
    expect(idb.get('image:k')).toBeInstanceOf(Blob);
  });

  it('retries keys previously marked missing once a file embeds them', async () => {
    // Key never cached in this document (no live URL)
    const cacheKey = await hashImageBlob(new Blob([new Uint8Array([5, 5, 5])], { type: 'image/png' }));
    const withAssets = JSON.stringify({ ...makePresentation(cacheKey, ''), id: 'old', assets: { [cacheKey]: 'data:image/png;base64,BQUF' } });

    // 1) Old file without assets: key is missing
    const old = { ...makePresentation(cacheKey, ''), id: 'old' };
    const openedOld = await parsePresentationFile(JSON.stringify(old));
    const u1 = await computeImageRestoreUpdates(openedOld);
    expect(u1).toEqual([{ slideIndex: 0, elementId: 'i1', cachedUrl: '' }]);

    // 2) Newer file (same presentation id, so no id-based reset) embeds the key
    const openedNew = await parsePresentationFile(withAssets);
    const u2 = await computeImageRestoreUpdates(openedNew);
    expect(u2).toHaveLength(1);
    expect(u2[0].cachedUrl).toMatch(/^blob:/);
  });

  it('content signature ignores session cachedUrl changes', () => {
    const a = makePresentation('image:k', 'blob:one');
    const b = makePresentation('image:k', 'blob:two');
    expect(contentSignature(a)).toBe(contentSignature(b));
    expect(contentSignature(a)).not.toBe(contentSignature({ ...a, title: 'changed' }));
  });
});
