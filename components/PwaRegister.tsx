'use client';

import { useEffect } from 'react';
import { initPwaInstallCapture, registerPmServiceWorker } from '@/lib/pwaInstall';

/** Registers the service worker and captures `beforeinstallprompt` once. */
export default function PwaRegister() {
  useEffect(() => {
    initPwaInstallCapture();
    void registerPmServiceWorker();
  }, []);
  return null;
}
