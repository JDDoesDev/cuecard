import { describe, it, expect } from 'vitest';
import { shouldAcceptSyncMessage, isSyncMessage, type SyncMessage } from '../sync';

const msg = (over: Partial<SyncMessage> = {}): SyncMessage =>
  ({ type: 'navigate', slideIndex: 1, timestamp: 1000, presentationId: 'p1', ...over }) as SyncMessage;

describe('sync protocol', () => {
  it('ignores messages for other presentations', () => {
    expect(shouldAcceptSyncMessage(msg(), 'p1', 0)).toBe(true);
    expect(shouldAcceptSyncMessage(msg({ presentationId: 'p2' }), 'p1', 0)).toBe(false);
    expect(shouldAcceptSyncMessage(msg({ presentationId: undefined }), 'p1', 0)).toBe(false);
  });

  it('ignores out-of-order messages', () => {
    expect(shouldAcceptSyncMessage(msg({ timestamp: 900 }), 'p1', 1000)).toBe(false);
  });

  it('ignores stale persisted state', () => {
    expect(shouldAcceptSyncMessage(msg({ timestamp: 0 }), 'p1', 0, 10_000, 5_000)).toBe(false);
    expect(shouldAcceptSyncMessage(msg({ timestamp: 8_000 }), 'p1', 0, 10_000, 5_000)).toBe(true);
  });

  it('validates message shape', () => {
    expect(isSyncMessage(msg())).toBe(true);
    expect(isSyncMessage({ type: 'request-state', timestamp: 1 })).toBe(true);
    expect(isSyncMessage({ type: 'navigate', timestamp: 1 })).toBe(false);
    expect(isSyncMessage({ type: 'bogus', timestamp: 1 })).toBe(false);
    expect(isSyncMessage(null)).toBe(false);
  });

  it('validates spotlight messages', () => {
    const spot = (spotlight: unknown) => ({ type: 'spotlight', slideIndex: 0, spotlight, timestamp: 1 });
    expect(isSyncMessage(spot({ elementId: 'c1', line: 3 }))).toBe(true);
    expect(isSyncMessage(spot(null))).toBe(true);
    expect(isSyncMessage(spot({ elementId: 'c1', line: 0 }))).toBe(false);
    expect(isSyncMessage(spot({ elementId: 'c1', line: 1.5 }))).toBe(false);
    expect(isSyncMessage(spot({ line: 2 }))).toBe(false);
    expect(isSyncMessage(spot(undefined))).toBe(false);
    expect(isSyncMessage({ type: 'spotlight', spotlight: null, timestamp: 1 })).toBe(false);
  });
});
