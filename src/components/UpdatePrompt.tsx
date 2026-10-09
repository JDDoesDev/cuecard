/**
 * Service worker update notification banner
 *
 * Shows a fixed-position banner when a new version of the PWA is available.
 * Never shown in audience mode (the projected window must stay clean).
 * Checks for updates periodically so long-running sessions notice new versions.
 */

import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import styles from './UpdatePrompt.module.css';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function UpdatePrompt() {
  const { isAudience } = usePresentationMode();
  const intervalRef = useRef<number | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;
      window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        if (registration.installing || !navigator.onLine) return;
        registration.update().catch((err) => console.warn('Service worker update check failed:', err));
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error: unknown) {
      console.error('Service worker registration error:', error);
    },
  });

  useEffect(() => () => window.clearInterval(intervalRef.current), []);

  if (isAudience || !needRefresh) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <strong>New version available!</strong>
        <p>An update is ready to install.</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.updateButton} onClick={() => updateServiceWorker(true)}>
          Update & Reload
        </button>
        <button className={styles.dismissButton} onClick={() => setNeedRefresh(false)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
