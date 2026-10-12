/**
 * Auto-save configuration for Zustand persist middleware
 *
 * - Persists presentation data to localStorage, throttled (writes are debounced
 *   and flushed on page hide/unload) so large decks aren't re-serialized on
 *   every keystroke or drag frame.
 * - Only the editor window writes. Presenter/audience windows (?mode=...) are
 *   read-only and live-update when the editor saves.
 * - Write failures (e.g. QuotaExceededError) are reported via a status handler
 *   instead of silently stopping autosave.
 */

import type { PersistOptions, PersistStorage, StorageValue } from 'zustand/middleware';
import { CURRENT_SCHEMA_VERSION, type Presentation } from '@/types/presentation';
import type { PresentationState } from '@/store/presentationStore';
import { migrateLegacyTextContent } from '@/lib/editor/legacyTextContent';
import { normalizeNestedListItems } from '@/lib/migration/migrateSlide';

export const AUTOSAVE_KEY = 'cuecard-presentation';
export const AUTOSAVE_VERSION = 2;

const WRITE_DELAY_MS = 500;
const EDITOR_CHANNEL = 'cuecard-editor-presence';

type PersistedState = { presentation: Presentation | null };

export interface StorageStatusPatch {
  saveError?: string | null;
  storageNotice?: string | null;
  storageConflict?: boolean;
}

// ============================================================================
// Environment helpers
// ============================================================================

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True when this window is the editor (not ?mode=presenter / ?mode=audience). */
export function isEditorWindow(): boolean {
  if (typeof window === 'undefined') return true;
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode !== 'presenter' && mode !== 'audience';
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!(err instanceof Error) && !(typeof DOMException !== 'undefined' && err instanceof DOMException)) {
    return false;
  }
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

// ============================================================================
// Status reporting
// ============================================================================

let statusHandler: ((patch: StorageStatusPatch) => void) | null = null;
let lastSaveError: string | null = null;

export function setStorageStatusHandler(handler: ((patch: StorageStatusPatch) => void) | null) {
  statusHandler = handler;
}

function reportSaveError(message: string | null) {
  if (message === lastSaveError) return;
  lastSaveError = message;
  statusHandler?.({ saveError: message });
}

function reportNotice(message: string | null) {
  statusHandler?.({ storageNotice: message });
}

// ============================================================================
// Throttled storage with cross-tab conflict detection
// ============================================================================

/** Identifies this tab's writes (last-writer stamp in the payload). */
const TAB_ID = Math.random().toString(36).slice(2, 10);
let revCounter = 0;

let pending: { name: string; value: StorageValue<PersistedState> } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
/** Raw string last read from or written to storage (ignores our own storage echoes). */
let lastSerialized: string | null = null;
/** Serialized state+version last read/written (skips writes that change nothing). */
let lastCore: string | null = null;
/** Writer stamp of the version this tab last loaded or wrote. */
let knownStamp: string | null = null;
/** Another tab saved over the version we loaded while we had unsaved edits. */
let conflict = false;

const META_RE = /^\{"meta":\{"tab":"([^"]*)","rev":(\d+)\}/;

function readStamp(raw: string | null): string | null {
  const m = raw ? META_RE.exec(raw) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * JSON replacer: drop `blob:` cachedUrl values. They only work inside the tab
 * that created them; persisting them would make two editor tabs overwrite each
 * other's (identical-content) saves forever. With them stripped, a change that
 * only touches cachedUrl serializes identically and is skipped.
 */
function stripSessionOnlyValues(key: string, val: unknown): unknown {
  if (key === 'cachedUrl' && typeof val === 'string' && val.startsWith('blob:')) return undefined;
  return val;
}

function serializeCore(value: StorageValue<PersistedState>): string {
  return JSON.stringify({ state: value.state, version: value.version }, stripSessionOnlyValues);
}

export function hasPendingSave(): boolean {
  return pending !== null;
}

export function hasStorageConflict(): boolean {
  return conflict;
}

function setConflict(next: boolean) {
  if (conflict === next) return;
  conflict = next;
  statusHandler?.({ storageConflict: next });
}

/**
 * Write any pending autosave immediately. If another tab saved a newer version
 * than the one this tab loaded, nothing is overwritten: the conflict is
 * reported and the edits stay pending until resolveStorageConflict().
 */
export function flushPendingSave(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pending) return;
  const ls = getLocalStorage();
  if (!ls) {
    pending = null;
    return;
  }
  const { name, value } = pending;

  let core: string;
  try {
    core = serializeCore(value);
  } catch (err) {
    pending = null;
    console.error('Autosave failed to serialize presentation:', err);
    reportSaveError('Autosave failed: the presentation could not be serialized.');
    return;
  }
  if (core === lastCore) {
    pending = null;
    return;
  }

  const storedStamp = readStamp(ls.getItem(name));
  if (conflict || (storedStamp !== null && storedStamp !== knownStamp && !storedStamp.startsWith(`${TAB_ID}:`))) {
    setConflict(true);
    return; // keep `pending`
  }
  pending = null;

  const stamp = `${TAB_ID}:${Date.now() * 1000 + (revCounter++ % 1000)}`;
  const [tab, rev] = stamp.split(':');
  const serialized = `{"meta":{"tab":"${tab}","rev":${rev}},${core.slice(1)}`;

  try {
    ls.setItem(name, serialized);
    lastSerialized = serialized;
    lastCore = core;
    knownStamp = stamp;
    reportSaveError(null);
  } catch (err) {
    console.error('Autosave to localStorage failed:', err);
    reportSaveError(
      isQuotaExceededError(err)
        ? 'Autosave failed: browser storage is full. Save to a file (Ctrl+S) to keep your work, or remove large embedded media.'
        : 'Autosave failed: changes are not being saved to browser storage. Save to a file (Ctrl+S) to keep your work.'
    );
  }
}

export const autosaveStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    const ls = getLocalStorage();
    if (!ls) return null;
    const str = ls.getItem(name);
    if (str === null) return null;
    try {
      const parsed = JSON.parse(str) as StorageValue<PersistedState>;
      lastSerialized = str;
      knownStamp = readStamp(str);
      // Cheap, idempotent cleanup of nested list items from older editor versions
      // (before lastCore, so a no-op load never looks like an unsaved change)
      normalizeNestedListItems(parsed.state?.presentation?.slides);
      lastCore = serializeCore(parsed);
      return { state: parsed.state, version: parsed.version };
    } catch (err) {
      console.error('Failed to parse autosaved presentation:', err);
      return null;
    }
  },
  setItem: (name, value) => {
    // Presenter/audience windows never write: they would clobber the editor's data
    if (!isEditorWindow()) return;
    if (!getLocalStorage()) return;
    pending = { name, value };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushPendingSave, WRITE_DELAY_MS);
  },
  removeItem: (name) => {
    pending = null;
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    lastSerialized = null;
    lastCore = null;
    knownStamp = null;
    setConflict(false);
    getLocalStorage()?.removeItem(name);
  },
};

/**
 * Migrate older persisted shapes. Keeps the presentation instead of discarding
 * saved data when AUTOSAVE_VERSION is bumped.
 * - v1 -> v2: text element content moves to the current rendering rule
 *   (see migrateLegacyTextContent).
 */
export function migratePersistedState(persisted: unknown, version: number): PersistedState {
  if (!persisted || typeof persisted !== 'object' || !('presentation' in persisted)) {
    return { presentation: null };
  }
  let presentation = (persisted as PersistedState).presentation ?? null;
  if (presentation && version < 2 && Array.isArray(presentation.slides)) {
    presentation = {
      ...presentation,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      slides: presentation.slides.map((slide) => ({
        ...slide,
        elements: slide.elements.map((el) =>
          el.type === 'text' ? { ...el, content: migrateLegacyTextContent(el.content) } : el
        ),
      })),
    };
  }
  return { presentation };
}

/**
 * Persist configuration for Zustand persist middleware
 */
export const persistConfig: PersistOptions<PresentationState, PersistedState> = {
  name: AUTOSAVE_KEY,
  version: AUTOSAVE_VERSION,
  storage: autosaveStorage,

  // Only persist the presentation data, not currentSlideIndex, status, or temporal history
  partialize: (state: PresentationState) => ({ presentation: state.presentation }),

  migrate: migratePersistedState,

  onRehydrateStorage: () => {
    return (_state, error) => {
      if (error) {
        console.error('Failed to rehydrate presentation from localStorage:', error);
      }
    };
  },
};

// ============================================================================
// Cross-window sync
// ============================================================================

interface SyncableStore {
  persist: { rehydrate: () => Promise<void> | void };
  temporal: { getState: () => { clear: () => void } };
}

interface SyncHooks {
  /** Called before replacing the deck from storage (e.g. end/discard a drag batch). */
  beforeExternalRehydrate?: () => void;
}

let storageSyncInstalled = false;
let syncStore: (SyncableStore & SyncHooks) | null = null;
let remoteNoticeShown = false;

/** Replace this tab's deck with the stored one (another tab's save). */
function loadFromStorage(store: SyncableStore & SyncHooks, editor: boolean) {
  store.beforeExternalRehydrate?.();
  void store.persist.rehydrate();
  if (editor) {
    // Undo history refers to the pre-sync deck; don't let undo resurrect it
    store.temporal.getState().clear();
  }
}

/**
 * Resolve a cross-tab save conflict.
 * - 'mine': overwrite storage with this tab's deck.
 * - 'theirs': drop this tab's unsaved edits and load the other tab's deck.
 */
export function resolveStorageConflict(choice: 'mine' | 'theirs'): void {
  if (choice === 'mine') {
    knownStamp = readStamp(getLocalStorage()?.getItem(AUTOSAVE_KEY) ?? null);
    setConflict(false);
    flushPendingSave();
    return;
  }
  pending = null;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  setConflict(false);
  if (syncStore) loadFromStorage(syncStore, true);
}

/**
 * Wire up flush-on-hide, cross-window live updates, and second-editor detection.
 * Call once after store creation.
 */
export function setupStorageSync(store: SyncableStore, hooks: SyncHooks = {}): void {
  if (storageSyncInstalled || typeof window === 'undefined') return;
  storageSyncInstalled = true;
  syncStore = { persist: store.persist, temporal: store.temporal, ...hooks };
  const synced = syncStore;

  const editor = isEditorWindow();

  if (editor) {
    window.addEventListener('beforeunload', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingSave();
      });
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== AUTOSAVE_KEY || e.newValue === null) return;
    if (e.newValue === lastSerialized) return;

    if (editor && (hasPendingSave() || conflict)) {
      // Both tabs changed the deck: let the user choose instead of clobbering
      setConflict(true);
      return;
    }

    loadFromStorage(synced, editor);
    if (editor && !remoteNoticeShown) {
      remoteNoticeShown = true;
      reportNotice('This presentation was updated from another editor tab.');
    }
  });

  if (editor && typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(EDITOR_CHANNEL);
      const tabId = Math.random().toString(36).slice(2);
      const warn = () =>
        reportNotice(
          'This presentation is open in another editor tab. Edits sync between tabs, but editing in both at once can overwrite changes.'
        );
      channel.onmessage = (event: MessageEvent<{ type: string; from: string }>) => {
        const msg = event.data;
        if (!msg || msg.from === tabId) return;
        if (msg.type === 'hello') {
          channel.postMessage({ type: 'here', from: tabId });
          warn();
        } else if (msg.type === 'here') {
          warn();
        }
      };
      channel.postMessage({ type: 'hello', from: tabId });
    } catch {
      // BroadcastChannel unavailable — storage events still keep tabs in sync
    }
  }
}
