/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type AutosaveModule = typeof import('../autosave');

async function load(search = ''): Promise<AutosaveModule> {
  vi.resetModules();
  window.history.replaceState(null, '', `/${search}`);
  return import('../autosave');
}

const value = (title: string) => ({
  state: { presentation: { title } as never },
  version: 1,
});

describe('autosave storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces writes and only writes on flush', async () => {
    const m = await load();
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('A'));
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('B'));
    expect(localStorage.getItem(m.AUTOSAVE_KEY)).toBeNull();
    expect(m.hasPendingSave()).toBe(true);

    m.flushPendingSave();
    expect(JSON.parse(localStorage.getItem(m.AUTOSAVE_KEY)!).state.presentation.title).toBe('B');
    expect(m.hasPendingSave()).toBe(false);
  });

  it('reports QuotaExceededError instead of failing silently', async () => {
    const m = await load();
    const statuses: Array<string | null | undefined> = [];
    m.setStorageStatusHandler((patch) => statuses.push(patch.saveError));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('A'));
    expect(() => m.flushPendingSave()).not.toThrow();
    expect(statuses.at(-1)).toMatch(/storage is full/);

    vi.restoreAllMocks();
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('B'));
    m.flushPendingSave();
    expect(statuses.at(-1)).toBeNull();
  });

  it('presenter and audience windows never write', async () => {
    for (const mode of ['presenter', 'audience']) {
      const m = await load(`?mode=${mode}`);
      expect(m.isEditorWindow()).toBe(false);
      m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('stale'));
      m.flushPendingSave();
      expect(localStorage.getItem(m.AUTOSAVE_KEY)).toBeNull();
    }
  });

  it('skips writing a value identical to what was last read', async () => {
    const m = await load();
    localStorage.setItem(m.AUTOSAVE_KEY, JSON.stringify(value('A')));
    m.autosaveStorage.getItem(m.AUTOSAVE_KEY);

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('A'));
    m.flushPendingSave();
    expect(spy).not.toHaveBeenCalled();
  });

  it('migrate keeps the saved presentation across version bumps', async () => {
    const m = await load();
    const presentation = { title: 'Saved' };
    expect(m.migratePersistedState({ presentation }, 0)).toEqual({ presentation });
    expect(m.migratePersistedState(null, 0)).toEqual({ presentation: null });
    expect(m.persistConfig.onRehydrateStorage).toBeTypeOf('function');
  });
});

describe('session-only values', () => {
  it('strips blob: cachedUrl and skips writes that only change it', async () => {
    localStorage.clear();
    const m = await load();
    const deck = (cachedUrl?: string) => ({
      state: {
        presentation: {
          title: 'D',
          slides: [{ elements: [{ id: 'i', type: 'image', url: 'idb://x', ...(cachedUrl && { cachedUrl }) }] }],
        } as never,
      },
      version: 1,
    });
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, deck());
    m.flushPendingSave();
    const first = localStorage.getItem(m.AUTOSAVE_KEY);

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, deck('blob:http://localhost/abc'));
    m.flushPendingSave();
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(m.AUTOSAVE_KEY)).toBe(first);
    expect(first).not.toContain('blob:');
    spy.mockRestore();
  });
});

describe('v1 -> v2 migration', () => {
  it('migrates legacy text content so paragraphs stay paragraphs', async () => {
    const m = await load();
    const presentation = {
      title: 'x',
      slides: [{ elements: [
        { id: 't', type: 'text', content: 'A\nB' },
        { id: 'h', type: 'heading', content: 'H\nI', level: 1 },
      ] }],
    };
    const out = m.migratePersistedState({ presentation }, 1) as { presentation: typeof presentation };
    expect(out.presentation.slides[0].elements[0].content).toBe('A\n\nB');
    expect(out.presentation.slides[0].elements[1].content).toBe('H\nI');
    expect(m.AUTOSAVE_VERSION).toBe(2);
  });
});

describe('cross-tab conflicts', () => {
  it('does not overwrite a newer save from another tab; resolves with Keep mine', async () => {
    localStorage.clear();
    const m = await load();
    const conflicts: boolean[] = [];
    m.setStorageStatusHandler((p) => { if (p.storageConflict !== undefined) conflicts.push(p.storageConflict); });

    // This tab loads the deck written by tab "other"
    localStorage.setItem(m.AUTOSAVE_KEY, '{"meta":{"tab":"other","rev":1},"state":{"presentation":{"title":"A"}},"version":2}');
    m.autosaveStorage.getItem(m.AUTOSAVE_KEY);

    // The other tab saves again; then we try to flush our own edit
    localStorage.setItem(m.AUTOSAVE_KEY, '{"meta":{"tab":"other","rev":2},"state":{"presentation":{"title":"B"}},"version":2}');
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('mine'));
    m.flushPendingSave();
    expect(JSON.parse(localStorage.getItem(m.AUTOSAVE_KEY)!).state.presentation.title).toBe('B');
    expect(m.hasStorageConflict()).toBe(true);
    expect(m.hasPendingSave()).toBe(true);
    expect(conflicts).toEqual([true]);

    m.resolveStorageConflict('mine');
    expect(JSON.parse(localStorage.getItem(m.AUTOSAVE_KEY)!).state.presentation.title).toBe('mine');
    expect(m.hasStorageConflict()).toBe(false);
  });

  it('writes normally when storage still holds the version we loaded', async () => {
    localStorage.clear();
    const m = await load();
    localStorage.setItem(m.AUTOSAVE_KEY, '{"meta":{"tab":"other","rev":1},"state":{"presentation":{"title":"A"}},"version":2}');
    m.autosaveStorage.getItem(m.AUTOSAVE_KEY);
    m.autosaveStorage.setItem(m.AUTOSAVE_KEY, value('mine'));
    m.flushPendingSave();
    expect(JSON.parse(localStorage.getItem(m.AUTOSAVE_KEY)!).state.presentation.title).toBe('mine');
    expect(m.hasStorageConflict()).toBe(false);
  });
});
