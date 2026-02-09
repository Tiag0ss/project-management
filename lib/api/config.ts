/**
 * API URL configuration
 * 
 * Since the Express API and Next.js frontend run on the same port (3000),
 * we use relative URLs by default. This works in all environments:
 * - Development (localhost:3000)
 * - Docker production (any hostname:3000)
 * - Behind reverse proxy (any domain)
 * 
 * NEXT_PUBLIC_API_URL is only needed if the API is on a different host/port.
 * When set, it should be the full URL (e.g. https://api.example.com)
 * When not set (default), relative URLs are used (just '/api/...')
 */
export function getApiUrl(): string {
  // If explicitly set, use it (for cases where API is on a different host)
  if (typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_API_URL__) {
    return (window as any).__NEXT_PUBLIC_API_URL__;
  }
  
  // Check build-time env var
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl !== 'http://localhost:3000') {
    return envUrl;
  }
  
  // Default: use relative URLs (works when frontend and API are on the same host)
  return '';
}

export const API_URL = getApiUrl();
