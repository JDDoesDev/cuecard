import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SyncMessage,
  SYNC_CHANNEL_NAME,
  SYNC_STORAGE_KEY,
  SYNC_REQUEST_STORAGE_KEY,
  SYNC_SPOTLIGHT_STORAGE_KEY,
  SYNC_STALE_MS,
  type CodeSpotlight,
  isSyncMessage,
  shouldAcceptSyncMessage,
} from '@/types/sync';

// ============================================================================
// usePresentationSync Hook
// ============================================================================
//
// Protocol:
// - Presenter broadcasts 'navigate' only when slide/fragment actually changes.
// - Audience sends 'request-state' when it mounts (or its presentation id
//   becomes known); the presenter replies with 'resync' carrying current state.
//   This keeps late-joining / reloaded audience windows in sync without the
//   presenter re-broadcasting periodically.
// - Presenter broadcasts 'spotlight' when the hovered code line changes.
// - Every message carries presentationId + timestamp. Receivers ignore
//   messages for other presentations and messages older than the last one
//   applied. Persisted state in localStorage is only restored when it belongs
//   to the same presentation and is recent (SYNC_STALE_MS).

export interface PresenterSyncState {
  slideIndex: number;
  fragmentIndex?: number;
}

export interface UsePresentationSyncOptions {
  role: 'presenter' | 'audience';
  onNavigate?: (slideIndex: number, fragmentIndex?: number) => void;
  onEnd?: () => void;
  /** Audience only: the presenter's hovered code line changed (null clears it). */
  onSpotlight?: (slideIndex: number, spotlight: CodeSpotlight | null) => void;
  presentationId?: string;
  /** Presenter only: returns current state, used to answer audience 'request-state'. */
  getState?: () => PresenterSyncState;
}

function writeStorage(key: string, message: SyncMessage) {
  try {
    localStorage.setItem(key, JSON.stringify(message));
  } catch (err) {
    console.error('Failed to write sync message to localStorage:', err);
  }
}

function parseMessage(raw: string | null): SyncMessage | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSyncMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Identity of a message for de-duplication across transports. */
function messageKey(message: SyncMessage): string {
  const nav = message.type === 'navigate' || message.type === 'resync'
    ? `:${message.slideIndex}:${message.fragmentIndex ?? ''}`
    : message.type === 'spotlight'
      ? `:${message.slideIndex}:${message.spotlight?.elementId ?? ''}:${message.spotlight?.line ?? ''}`
      : '';
  return `${message.type}:${message.presentationId ?? ''}:${message.timestamp}${nav}`;
}

export function usePresentationSync(options: UsePresentationSyncOptions) {
  const { role, presentationId } = options;
  const [isConnected, setIsConnected] = useState(false);

  // Refs avoid stale closures and keep the returned callbacks stable
  const onNavigateRef = useRef(options.onNavigate);
  const onEndRef = useRef(options.onEnd);
  const onSpotlightRef = useRef(options.onSpotlight);
  const getStateRef = useRef(options.getState);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const presentationIdRef = useRef(presentationId);
  const lastTimestampRef = useRef(0);
  /** Keys of recently handled messages: each message arrives via both BroadcastChannel and storage. */
  const seenRef = useRef<string[]>([]);

  onNavigateRef.current = options.onNavigate;
  onEndRef.current = options.onEnd;
  onSpotlightRef.current = options.onSpotlight;
  getStateRef.current = options.getState;
  presentationIdRef.current = presentationId;

  /** Send a message over BroadcastChannel and mirror it to localStorage. */
  const send = useCallback((message: SyncMessage, storageKey: string) => {
    // Presenter messages without a deck id would be rejected by audiences that
    // already know theirs; the presenter rebroadcasts once the id is known.
    if (message.type !== 'request-state' && !message.presentationId) return;
    channelRef.current?.postMessage(message);
    writeStorage(storageKey, message);
  }, []);

  const broadcastResync = useCallback((slideIndex: number, fragmentIndex?: number) => {
    send(
      { type: 'resync', slideIndex, fragmentIndex, timestamp: Date.now(), presentationId: presentationIdRef.current },
      SYNC_STORAGE_KEY,
    );
  }, [send]);

  const broadcastNavigate = useCallback((slideIndex: number, fragmentIndex?: number) => {
    send(
      { type: 'navigate', slideIndex, fragmentIndex, timestamp: Date.now(), presentationId: presentationIdRef.current },
      SYNC_STORAGE_KEY,
    );
  }, [send]);

  const broadcastSpotlight = useCallback((slideIndex: number, spotlight: CodeSpotlight | null) => {
    send(
      { type: 'spotlight', slideIndex, spotlight, timestamp: Date.now(), presentationId: presentationIdRef.current },
      SYNC_SPOTLIGHT_STORAGE_KEY,
    );
  }, [send]);

  const broadcastEnd = useCallback(() => {
    send({ type: 'end', timestamp: Date.now(), presentationId: presentationIdRef.current }, SYNC_STORAGE_KEY);
  }, [send]);

  useEffect(() => {
    const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';
    lastTimestampRef.current = 0;

    const handleMessage = (message: SyncMessage) => {
      const key = messageKey(message);
      if (seenRef.current.includes(key)) return;
      seenRef.current = [...seenRef.current.slice(-31), key];

      if (role === 'presenter') {
        // Presenter is the source of truth; it only answers state requests.
        if (message.type !== 'request-state') return;
        if (presentationIdRef.current && message.presentationId && message.presentationId !== presentationIdRef.current) return;
        const state = getStateRef.current?.();
        if (state) broadcastResync(state.slideIndex, state.fragmentIndex);
        return;
      }

      if (message.type === 'request-state') return;
      if (!shouldAcceptSyncMessage(message, presentationIdRef.current, lastTimestampRef.current)) return;
      lastTimestampRef.current = message.timestamp;

      if (message.type === 'navigate' || message.type === 'resync') {
        onNavigateRef.current?.(message.slideIndex, message.fragmentIndex);
      } else if (message.type === 'spotlight') {
        onSpotlightRef.current?.(message.slideIndex, message.spotlight);
      } else if (message.type === 'end') {
        onEndRef.current?.();
      }
    };

    if (hasBroadcastChannel) {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (isSyncMessage(event.data)) handleMessage(event.data);
      };
    }
    setIsConnected(true);

    // localStorage fallback (always set up, even if BroadcastChannel exists)
    const listenKeys = role === 'audience' ? [SYNC_STORAGE_KEY, SYNC_SPOTLIGHT_STORAGE_KEY] : [SYNC_REQUEST_STORAGE_KEY];
    const handleStorageEvent = (event: StorageEvent) => {
      if (!event.key || !listenKeys.includes(event.key)) return;
      const message = parseMessage(event.newValue);
      if (message) handleMessage(message);
    };
    window.addEventListener('storage', handleStorageEvent);

    if (role === 'audience' && presentationId) {
      // Restore last known state (e.g. after audience reload), only if it is
      // for this presentation and recent; then ask the presenter for the
      // authoritative current state.
      const stored = parseMessage(localStorage.getItem(SYNC_STORAGE_KEY));
      if (
        stored &&
        (stored.type === 'navigate' || stored.type === 'resync') &&
        shouldAcceptSyncMessage(stored, presentationId, 0, Date.now(), SYNC_STALE_MS)
      ) {
        lastTimestampRef.current = stored.timestamp;
        onNavigateRef.current?.(stored.slideIndex, stored.fragmentIndex);
      }
      send({ type: 'request-state', timestamp: Date.now(), presentationId }, SYNC_REQUEST_STORAGE_KEY);
    }

    return () => {
      channelRef.current?.close();
      channelRef.current = null;
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [role, presentationId, send, broadcastResync]);

  return {
    isConnected,
    broadcastNavigate,
    broadcastResync,
    broadcastSpotlight,
    broadcastEnd,
  };
}
