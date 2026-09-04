'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  clearDeferredInstallPrompt,
  dismissInstallPrompt,
  getDeferredInstallPrompt,
  isIosSafari,
  isStandaloneDisplay,
  subscribePwaInstall,
  wasInstallDismissed,
} from '@/lib/pwaInstall';

interface InstallAppPromptProps {
  className?: string;
}

/**
 * Mobile-only “Install app” banner (Synapse-style).
 * Uses the deferred install prompt when available; on iOS Safari shows Add to Home Screen tips.
 */
export default function InstallAppPrompt({ className = '' }: InstallAppPromptProps) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => setMounted(true), []);
  useEffect(() => subscribePwaInstall(() => setTick((n) => n + 1)), []);

  if (!mounted || !isMobile) return null;
  if (isStandaloneDisplay()) return null;
  if (wasInstallDismissed()) return null;

  // Re-read after tick so deferred prompt / dismiss updates UI
  void tick;
  const deferred = getDeferredInstallPrompt();
  const ios = isIosSafari();

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    } finally {
      clearDeferredInstallPrompt();
      setTick((n) => n + 1);
    }
  };

  const dismiss = () => {
    dismissInstallPrompt();
    setTick((n) => n + 1);
  };

  return (
    <div
      className={`rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 px-4 py-3 shadow-sm ${className}`}
      role="region"
      aria-label="Install app"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Install app</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {ios
              ? 'On iPhone/iPad: tap Share in Safari, then Add to Home Screen for a full-screen experience.'
              : deferred
                ? 'Install this app on your phone for a full-screen experience.'
                : 'Use your browser menu to Install app or Add to Home Screen for a full-screen experience.'}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {deferred ? (
          <button
            type="button"
            className="h-9 px-3 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => void install()}
          >
            Install app
          </button>
        ) : null}
        <button
          type="button"
          className="h-9 px-3 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={dismiss}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
