/**
 * One-time move of localStorage data saved under the app's previous key prefix.
 * Imported first in main.tsx so it runs before the store rehydrates.
 * Ephemeral keys (sync messages, session flags) are not carried over.
 */
// Key prefix used before the app was renamed to Cuecard
const LEGACY_PREFIX = 'fldc-';
const PERSISTENT_KEYS = [
  'presentation',
  'custom-themes',
  'preferred-theme',
  'google-fonts-list',
  'theme-in-deck-migrated',
];

export function migrateLegacyStorageKeys(storage: Storage = localStorage): void {
  for (const key of PERSISTENT_KEYS) {
    const legacyKey = LEGACY_PREFIX + key;
    const value = storage.getItem(legacyKey);
    if (value === null) continue;
    if (storage.getItem(`cuecard-${key}`) === null) storage.setItem(`cuecard-${key}`, value);
    storage.removeItem(legacyKey);
  }
}

try {
  migrateLegacyStorageKeys();
} catch {
  // Storage unavailable (private mode, blocked) — nothing to migrate
}
