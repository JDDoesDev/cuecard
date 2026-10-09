// ============================================================================
// Cross-Tab Sync Types
// ============================================================================

export const SYNC_CHANNEL_NAME = 'cuecard-presentation-sync';
/** Presenter -> audience messages (also used to restore state after reload). */
export const SYNC_STORAGE_KEY = 'cuecard-sync-msg';
/** Audience -> presenter messages (localStorage fallback when BroadcastChannel is unavailable). */
export const SYNC_REQUEST_STORAGE_KEY = 'cuecard-sync-request';
/** Persisted presenter state older than this is ignored on audience mount. */
export const SYNC_STALE_MS = 6 * 60 * 60 * 1000;

// ============================================================================
// Sync Message Types
// ============================================================================

export type SyncMessageType = 'navigate' | 'resync' | 'end' | 'request-state';

export type SyncMessage =
  | {
      type: 'navigate';
      slideIndex: number;
      fragmentIndex?: number;
      timestamp: number;
      presentationId?: string;
    }
  | {
      type: 'resync';
      slideIndex: number;
      fragmentIndex?: number;
      timestamp: number;
      presentationId?: string;
    }
  | {
      type: 'end';
      timestamp: number;
      presentationId?: string;
    }
  | {
      /** Sent by an audience window on mount; the presenter replies with 'resync'. */
      type: 'request-state';
      timestamp: number;
      presentationId?: string;
    };

export function isSyncMessage(value: unknown): value is SyncMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.timestamp !== 'number') return false;
  if (msg.presentationId !== undefined && typeof msg.presentationId !== 'string') return false;
  switch (msg.type) {
    case 'navigate':
    case 'resync':
      return typeof msg.slideIndex === 'number' &&
        (msg.fragmentIndex === undefined || typeof msg.fragmentIndex === 'number');
    case 'end':
    case 'request-state':
      return true;
    default:
      return false;
  }
}

/**
 * Decide whether a received message applies to this window.
 * - Must be scoped to the same presentation (when both sides know their id).
 * - Must not be older than the last message already applied (out-of-order / stale).
 * - When `maxAgeMs` is given (restoring from localStorage), must be recent.
 */
export function shouldAcceptSyncMessage(
  message: SyncMessage,
  presentationId: string | undefined,
  lastTimestamp: number,
  now: number = Date.now(),
  maxAgeMs?: number,
): boolean {
  if (presentationId && message.presentationId !== presentationId) return false;
  if (message.timestamp < lastTimestamp) return false;
  if (maxAgeMs !== undefined && now - message.timestamp > maxAgeMs) return false;
  return true;
}
