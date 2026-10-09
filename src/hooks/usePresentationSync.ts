import { useEffect, useRef, useState } from 'react';
import {
  SyncMessage,
  SYNC_CHANNEL_NAME,
  SYNC_STORAGE_KEY,
} from '@/types/sync';

// ============================================================================
// usePresentationSync Hook
// ============================================================================

export interface UsePresentationSyncOptions {
  role: 'presenter' | 'audience';
  onNavigate: (slideIndex: number, fragmentIndex?: number) => void;
  onEnd?: () => void;
  presentationId?: string;
}

export function usePresentationSync(options: UsePresentationSyncOptions) {
  const { role, presentationId } = options;
  const [isConnected, setIsConnected] = useState(false);

  // Use ref to avoid stale closures
  const onNavigateRef = useRef(options.onNavigate);
  const onEndRef = useRef(options.onEnd);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const presentationIdRef = useRef(presentationId);

  // Update refs when options change
  useEffect(() => {
    onNavigateRef.current = options.onNavigate;
    onEndRef.current = options.onEnd;
    presentationIdRef.current = presentationId;
  }, [options.onNavigate, options.onEnd, presentationId]);

  useEffect(() => {
    const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

    // Handler for incoming sync messages
    const handleMessage = (message: SyncMessage) => {
      // Only process messages if we're in audience mode (presenter is source of truth)
      if (role !== 'audience') return;

      // Filter by presentation ID if provided
      if (presentationIdRef.current && message.presentationId !== presentationIdRef.current) {
        return;
      }

      // Process navigate and resync messages
      if (message.type === 'navigate' || message.type === 'resync') {
        onNavigateRef.current(message.slideIndex, message.fragmentIndex);
      } else if (message.type === 'end') {
        onEndRef.current?.();
      }
    };

    // BroadcastChannel setup
    if (hasBroadcastChannel) {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        handleMessage(event.data as SyncMessage);
      };

      setIsConnected(true);
    }

    // localStorage fallback (always set up, even if BroadcastChannel exists)
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== SYNC_STORAGE_KEY) return;
      if (!event.newValue) return;

      try {
        const message = JSON.parse(event.newValue) as SyncMessage;
        handleMessage(message);
      } catch (err) {
        console.error('Failed to parse sync message from localStorage:', err);
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    if (!hasBroadcastChannel) {
      setIsConnected(true);
    }

    // On mount, read last sync message from localStorage to restore state after page refresh
    if (role === 'audience') {
      const lastMessage = localStorage.getItem(SYNC_STORAGE_KEY);
      if (lastMessage) {
        try {
          const message = JSON.parse(lastMessage) as SyncMessage;
          if (message.type === 'navigate' || message.type === 'resync') {
            // Filter by presentation ID if provided
            if (!presentationIdRef.current || message.presentationId === presentationIdRef.current) {
              onNavigateRef.current(message.slideIndex, message.fragmentIndex);
            }
          }
        } catch (err) {
          console.error('Failed to restore sync state from localStorage:', err);
        }
      }
    }

    // Cleanup
    return () => {
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [role, presentationId]);

  // Broadcast navigate message
  const broadcastNavigate = (slideIndex: number, fragmentIndex?: number) => {
    const message: SyncMessage = {
      type: 'navigate',
      slideIndex,
      fragmentIndex,
      timestamp: Date.now(),
      presentationId: presentationIdRef.current,
    };

    // Send via BroadcastChannel if available
    if (channelRef.current) {
      channelRef.current.postMessage(message);
    }

    // Always write to localStorage (dual-write for fallback clients and resync)
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(message));
    } catch (err) {
      console.error('Failed to write sync message to localStorage:', err);
    }
  };

  // Broadcast resync message
  const broadcastResync = (slideIndex: number, fragmentIndex?: number) => {
    const message: SyncMessage = {
      type: 'resync',
      slideIndex,
      fragmentIndex,
      timestamp: Date.now(),
      presentationId: presentationIdRef.current,
    };

    // Send via BroadcastChannel if available
    if (channelRef.current) {
      channelRef.current.postMessage(message);
    }

    // Always write to localStorage (dual-write for fallback clients and resync)
    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(message));
    } catch (err) {
      console.error('Failed to write sync message to localStorage:', err);
    }
  };

  // Broadcast end message
  const broadcastEnd = () => {
    const message: SyncMessage = {
      type: 'end',
      timestamp: Date.now(),
      presentationId: presentationIdRef.current,
    };

    if (channelRef.current) {
      channelRef.current.postMessage(message);
    }

    try {
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(message));
    } catch (err) {
      console.error('Failed to write sync message to localStorage:', err);
    }
  };

  return {
    isConnected,
    broadcastNavigate,
    broadcastResync,
    broadcastEnd,
  };
}
