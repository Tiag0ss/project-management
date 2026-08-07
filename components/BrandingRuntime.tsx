'use client';

import { useEffect } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { inferFaviconType } from '@/lib/branding/favicon.shared';

function upsertIconLink(rel: string, href: string, type?: string) {
  const selector = `link[data-branding-favicon="1"][rel="${rel}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('data-branding-favicon', '1');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  if (type) {
    link.type = type;
  } else {
    link.removeAttribute('type');
  }
}

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
        const faviconUrl = String(data.faviconUrl || '').trim();

        if (companyName) {
          document.title = companyName;
        }

        if (faviconUrl) {
          const type = inferFaviconType(faviconUrl);
          upsertIconLink('icon', faviconUrl, type);
          upsertIconLink('shortcut icon', faviconUrl, type);
        }
      } catch {
        // best-effort branding apply
      }
    };

    applyBranding();
  }, []);

  return null;
}
