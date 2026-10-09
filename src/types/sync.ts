// ============================================================================
// Cross-Tab Sync Types
// ============================================================================

export const SYNC_CHANNEL_NAME = 'fldc-presentation-sync';
export const SYNC_STORAGE_KEY = 'fldc-sync-msg';

// ============================================================================
// Sync Message Types
// ============================================================================

export type SyncMessageType = 'navigate' | 'resync' | 'end' | 'ping' | 'pong';

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
      type: 'ping';
      timestamp: number;
      presentationId?: string;
    }
  | {
      type: 'pong';
      timestamp: number;
      presentationId?: string;
    };
