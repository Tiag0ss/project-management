import type { User } from '@/lib/api/auth';

export const AUTH_TOKEN_KEY = 'authToken';
export const AUTH_USER_KEY = 'authUser';

export const PUBLIC_AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/install',
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));
}

export interface JwtPayload {
  userId?: number;
  exp?: number;
}

export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as JwtPayload;
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(payload: JwtPayload | null, skewMs = 30_000): boolean {
  if (!payload?.exp) {
    return true;
  }
  return payload.exp * 1000 <= Date.now() + skewMs;
}

/** In-memory access token used by silent refresh (avoids React re-renders on JWT rotation). */
let liveAccessToken: string | null = null;

export function getLiveAccessToken(): string | null {
  return liveAccessToken;
}

export function setLiveAccessToken(token: string | null): void {
  liveAccessToken = token;
}

/**
 * Persist a rotated JWT without relying on React state updates.
 * Callers that must avoid page re-fetches should use this instead of setState.
 */
export function persistSilentAccessToken(token: string): void {
  if (liveAccessToken === token) {
    return;
  }
  liveAccessToken = token;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // Ignore storage failures (private mode / SSR).
  }
}

/** Rewrite Bearer Authorization to the latest silent-refresh token when present. */
export function applyLiveAccessTokenToFetchArgs(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  latestToken: string | null = liveAccessToken
): [RequestInfo | URL, RequestInit | undefined] {
  if (!latestToken) {
    return [input, init];
  }

  const rewriteHeaders = (headers: Headers): boolean => {
    const auth = headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return false;
    }
    headers.set('Authorization', `Bearer ${latestToken}`);
    return true;
  };

  if (typeof Request !== 'undefined' && input instanceof Request) {
    const headers = new Headers(input.headers);
    if (!rewriteHeaders(headers)) {
      return [input, init];
    }
    return [new Request(input, { ...init, headers }), undefined];
  }

  const headers = new Headers(init?.headers);
  if (!rewriteHeaders(headers)) {
    return [input, init];
  }
  return [input, { ...init, headers }];
}

export function clearStoredSession(): void {
  liveAccessToken = null;
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function persistStoredSession(token: string, user: User): void {
  liveAccessToken = token;
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function readStoredSession(): { token: string; user: User } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userRaw = localStorage.getItem(AUTH_USER_KEY);

  if (!token && !userRaw) {
    return null;
  }

  if (!token || !userRaw) {
    clearStoredSession();
    return null;
  }

  const payload = parseJwtPayload(token);
  if (!payload?.userId || isTokenExpired(payload)) {
    clearStoredSession();
    return null;
  }

  let user: User;
  try {
    user = JSON.parse(userRaw) as User;
  } catch {
    clearStoredSession();
    return null;
  }

  if (!user || typeof user !== 'object' || !Number.isFinite(Number(user.id))) {
    clearStoredSession();
    return null;
  }

  if (Number(user.id) !== Number(payload.userId)) {
    clearStoredSession();
    return null;
  }

  return { token, user };
}

export function isAuthFailureStatus(status: number, message: string): boolean {
  if (status === 401) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid or expired token')
    || normalized.includes('invalid token')
    || normalized.includes('access token required')
    || normalized.includes('account is disabled')
    || normalized.includes('user not found')
  );
}
