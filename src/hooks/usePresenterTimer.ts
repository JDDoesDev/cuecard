import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// usePresenterTimer Hook
// ============================================================================

export interface PresenterTimerResult {
  elapsed: number;
  formattedTime: string;
  reset: () => void;
  isRunning: boolean;
}

/**
 * Provides an elapsed time timer with reset capability.
 * Uses Date.now() delta to avoid drift from setInterval.
 */
export function usePresenterTimer(): PresenterTimerResult {
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, [startTime]);

  // Reset timer
  const reset = useCallback(() => {
    const now = Date.now();
    setStartTime(now);
    setElapsed(0);
  }, []);

  // Format time as HH:MM:SS
  const formattedTime = formatTime(elapsed);

  return {
    elapsed,
    formattedTime,
    reset,
    isRunning: true,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}
