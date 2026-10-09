/**
 * Service worker update notification banner
 *
 * Shows a fixed-position banner when a new version of the PWA is available.
 */

import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.css';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('Service worker registered:', r);
    },
    onRegisterError(error: any) {
      console.error('Service worker registration error:', error);
    },
  });

  if (!needRefresh) {
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
