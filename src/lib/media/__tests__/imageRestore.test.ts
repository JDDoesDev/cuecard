import { describe, it, expect, vi } from 'vitest';

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => void store.set(k, v),
    del: async (k: string) => void store.delete(k),
    keys: async () => [...store.keys()],
  };
});

import type { Presentation } from '@/types/presentation';
import type { ImageElement } from '@/types/slide';
import {
  findImagesNeedingRestore,
  computeImageRestoreUpdates,
  resolveImageReferences,
  findUnresolvedImageRefs,
  embedImagesForExport,
} from '../imageRestore';
import { cacheImageBlob } from '../imageCaching';

function img(id: string, extra: Partial<ImageElement> = {}): ImageElement {
  return { id, type: 'image', position: { x: 0, y: 0, width: 10, height: 10 }, url: 'a.png', ...extra };
}

function pres(elements: ImageElement[][]): Presentation {
  return {
    id: 'p1',
    title: 't',
    theme: 'default',
    slides: elements.map((els, i) => ({ id: `s${i}`, layout: 'freestyle', elements: els })) as Presentation['slides'],
    createdAt: '',
    updatedAt: '',
  } as Presentation;
}

describe('findImagesNeedingRestore', () => {
  it('flags images whose cachedUrl is not the live URL for their key', () => {
    const live = new Map([['image:a', 'blob:live-a']]);
    const p = pres([
      [img('ok', { cacheKey: 'image:a', cachedUrl: 'blob:live-a' })],
      [
        img('stale', { cacheKey: 'image:a', cachedUrl: 'blob:dead' }),
        img('noUrl', { cacheKey: 'image:b' }),
        img('noKey', { cachedUrl: 'blob:whatever' }),
      ],
    ]);
    expect(findImagesNeedingRestore(p, live)).toEqual([
      { slideIndex: 1, elementId: 'stale', cacheKey: 'image:a' },
      { slideIndex: 1, elementId: 'noUrl', cacheKey: 'image:b' },
    ]);
  });

  it('skips keys known to be missing once cachedUrl was cleared', () => {
    const p = pres([[img('m1', { cacheKey: 'image:gone', cachedUrl: '' }), img('m2', { cacheKey: 'image:gone', cachedUrl: 'blob:dead' })]]);
    expect(findImagesNeedingRestore(p, new Map(), new Set(['image:gone']))).toEqual([
      { slideIndex: 0, elementId: 'm2', cacheKey: 'image:gone' },
    ]);
  });
});

describe('computeImageRestoreUpdates', () => {
  it('produces live URLs for cached keys and empty strings for missing ones', async () => {
    const { cacheKey, blobUrl } = await cacheImageBlob(new Blob(['r1'], { type: 'image/png' }));
    const p = pres([[img('a', { cacheKey, cachedUrl: 'blob:old' }), img('b', { cacheKey: 'image:missing' })]]);
    const updates = await computeImageRestoreUpdates(p);
    expect(updates).toEqual([
      { slideIndex: 0, elementId: 'a', cachedUrl: blobUrl },
      { slideIndex: 0, elementId: 'b', cachedUrl: '' },
    ]);
    // Applying the updates converges: nothing left to restore
    p.slides[0].elements = [img('a', { cacheKey, cachedUrl: blobUrl }), img('b', { cacheKey: 'image:missing', cachedUrl: '' })];
    expect(await computeImageRestoreUpdates(p)).toEqual([]);
  });
});

describe('resolveImageReferences', () => {
  it('strips blob URLs, caches data URIs, and links filenames', async () => {
    const { cacheKey } = await cacheImageBlob(new Blob(['f1'], { type: 'image/png' }), 'logo.png');
    const p = pres([[
      img('file', { url: './assets/logo.png', cachedUrl: 'blob:stale' }),
      img('data', { url: 'data:image/png;base64,AAEC' }),
      img('remote', { url: 'https://example.com/x.png' }),
      img('unknown', { url: 'missing.png' }),
    ]]);
    await resolveImageReferences(p);
    const [file, data, remote, unknown] = p.slides[0].elements as ImageElement[];
    expect(file.cacheKey).toBe(cacheKey);
    expect(file.cachedUrl).toBeUndefined();
    expect(data.cacheKey).toMatch(/^image:[0-9a-f]{64}$/);
    expect(data.url).toMatch(/^embedded-[0-9a-f]{8}\.png$/);
    expect(remote.cacheKey).toBeUndefined();
    expect(unknown.cacheKey).toBeUndefined();
    expect(findUnresolvedImageRefs(p)).toEqual(['missing.png']);
  });
});

describe('embedImagesForExport', () => {
  it('inlines cached blobs as data URIs on a clone', async () => {
    const { cacheKey } = await cacheImageBlob(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const p = pres([[img('a', { cacheKey, cachedUrl: 'blob:x' })]]);
    const out = await embedImagesForExport(p);
    const el = out.slides[0].elements[0] as ImageElement;
    expect(el.url).toBe('data:image/png;base64,AQID');
    expect(el.cachedUrl).toBeUndefined();
    expect((p.slides[0].elements[0] as ImageElement).url).toBe('a.png');
  });
});
