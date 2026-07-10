'use client';

import { useEffect } from 'react';
import { getApiUrl } from '@/lib/api/config';

export default function BrandingRuntime() {
  useEffect(() => {
    const applyBranding = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/system-settings/public`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = await response.json();
        const companyName = (data.companyName || '').trim();

        if (companyName) {
          document.title = companyName;
        }
      } catch {
      }
    };

    applyBranding();
  }, []);

  return null;
}
