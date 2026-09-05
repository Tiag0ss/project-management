'use client';

import { useEffect, useState } from 'react';

/** Tailwind `md` boundary: viewports at or below this are treated as mobile. */
export const MOBILE_MAX_WIDTH = 767;

const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * True when the viewport is at most {@link MOBILE_MAX_WIDTH}px (Tailwind `md` cutoff).
 * SSR / first paint default is `false` to avoid hydration mismatch.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(media.matches);
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isMobile;
}

export default useIsMobile;
