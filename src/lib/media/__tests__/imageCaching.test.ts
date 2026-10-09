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

import {
  hashImageBlob,
  blobToDataUri,
  dataUriToBlob,
  cacheImageBlob,
  getCachedImage,
  isLiveUrl,
  releaseUnreferencedUrls,
  findCacheKeyByName,
  cacheImage,
  pinImageKeys,
  unpinImageKeys,
} from '../imageCaching';

describe('hashImageBlob', () => {
  it('produces image:<sha256 hex> keys', async () => {
    const key = await hashImageBlob(new Blob(['abc'], { type: 'image/png' }));
    // SHA-256("abc")
    expect(key).toBe('image:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is content-addressed: same bytes share a key, different bytes do not', async () => {
    const a = await hashImageBlob(new Blob(['same'], { type: 'image/png' }));
    const b = await hashImageBlob(new Blob(['same'], { type: 'image/jpeg' }));
    const c = await hashImageBlob(new Blob(['diff'], { type: 'image/png' }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('data URI helpers', () => {
  it('round-trips binary blobs', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const uri = await blobToDataUri(new Blob([bytes], { type: 'image/webp' }));
    expect(uri.startsWith('data:image/webp;base64,')).toBe(true);
    const back = dataUriToBlob(uri);
    expect(back.type).toBe('image/webp');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });

  it('decodes non-base64 data URIs and rejects garbage', async () => {
    const blob = dataUriToBlob('data:image/svg+xml,%3Csvg%2F%3E');
    expect(await blob.text()).toBe('<svg/>');
    expect(() => dataUriToBlob('not a data uri')).toThrow();
  });
});

describe('live URL registry', () => {
  it('reuses one object URL per key and revokes unreferenced keys', async () => {
    const { cacheKey, blobUrl } = await cacheImageBlob(new Blob(['x1'], { type: 'image/png' }), 'Photo.PNG');
    expect(isLiveUrl(cacheKey, blobUrl)).toBe(true);
    expect(await getCachedImage(cacheKey)).toBe(blobUrl);

    // Recently created URLs survive (in-flight uploads)
    releaseUnreferencedUrls(new Set());
    expect(isLiveUrl(cacheKey, blobUrl)).toBe(true);

    // Pinned keys survive past the grace period
    pinImageKeys([cacheKey]);
    releaseUnreferencedUrls(new Set(), Date.now() + 60_000);
    expect(isLiveUrl(cacheKey, blobUrl)).toBe(true);
    unpinImageKeys([cacheKey]);

    releaseUnreferencedUrls(new Set(), Date.now() + 60_000);
    expect(isLiveUrl(cacheKey, blobUrl)).toBe(false);
    const fresh = await getCachedImage(cacheKey);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(blobUrl);
  });

  it('finds cache keys by filename, including legacy name-size keys', async () => {
    const { cacheKey } = await cacheImageBlob(new Blob(['x2'], { type: 'image/png' }), 'diagram.png');
    expect(await findCacheKeyByName('images/Diagram.png')).toBe(cacheKey);

    await cacheImage('image:old.jpg-1234', new Blob(['legacy'], { type: 'image/jpeg' }));
    expect(await findCacheKeyByName('old.jpg')).toBe('image:old.jpg-1234');
    expect(await findCacheKeyByName('nope.png')).toBeNull();
  });
});
