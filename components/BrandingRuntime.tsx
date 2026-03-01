'use client';

import { useEffect } from 'react';
import { getApiUrl } from '@/lib/api/config';

export default function BrandingRuntime() {
  useEffect(() => {
    const applyBranding = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (!response.ok) return;

        const data = await response.json();
        const companyName = (data.companyName || '').trim();
        const faviconUrl = (data.faviconUrl || '').trim();

        if (companyName) {
          document.title = companyName;
        }

        if (faviconUrl) {
          let iconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
          if (!iconLink) {
            iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            document.head.appendChild(iconLink);
          }
          iconLink.href = faviconUrl;

          let shortcutIconLink = document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");
          if (!shortcutIconLink) {
            shortcutIconLink = document.createElement('link');
            shortcutIconLink.rel = 'shortcut icon';
            document.head.appendChild(shortcutIconLink);
          }
          shortcutIconLink.href = faviconUrl;
        }
      } catch {
      }
    };

    applyBranding();
  }, []);

  return null;
}
