'use client';

import { useEffect } from 'react';
import GlobalGridEnhancer from '@/components/old/GlobalGridEnhancer';
import AIAssistantWidget from '@/components/old/AIAssistantWidget';

/** Legacy UI under `/old/*` — frozen; do not add features here. */
export default function OldLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.legacyUi = 'true';
    return () => {
      delete document.documentElement.dataset.legacyUi;
    };
  }, []);

  return (
    <div className="min-h-screen w-full" data-legacy-shell="">
      <div className="sticky top-0 z-[100] border-b border-amber-500/40 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/80 dark:text-amber-100">
        Legacy UI (<code className="font-mono">/old</code>) — frozen during rebuild. Prefer the new shell when available.
      </div>
      <GlobalGridEnhancer />
      {children}
      <AIAssistantWidget />
    </div>
  );
}
