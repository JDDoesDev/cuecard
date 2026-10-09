import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLegacyStorageKeys } from '../migrateLegacyStorageKeys';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

const legacy = (key: string) => 'fldc-' + key;

describe('migrateLegacyStorageKeys', () => {
  let storage: Storage;
  beforeEach(() => { storage = memoryStorage(); });

  it('moves saved data to the new keys and removes the old ones', () => {
    storage.setItem(legacy('presentation'), '{"state":1}');
    storage.setItem(legacy('custom-themes'), '[]');
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem('cuecard-presentation')).toBe('{"state":1}');
    expect(storage.getItem('cuecard-custom-themes')).toBe('[]');
    expect(storage.getItem(legacy('presentation'))).toBeNull();
  });

  it('never overwrites data already under the new key', () => {
    storage.setItem(legacy('presentation'), 'old');
    storage.setItem('cuecard-presentation', 'new');
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem('cuecard-presentation')).toBe('new');
    expect(storage.getItem(legacy('presentation'))).toBeNull();
  });

  it('ignores ephemeral keys', () => {
    storage.setItem(legacy('sync-msg'), 'x');
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem('cuecard-sync-msg')).toBeNull();
  });
});
