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

export function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function persistStoredSession(token: string, user: User): void {
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
