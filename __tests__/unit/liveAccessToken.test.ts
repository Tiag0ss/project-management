import {
  applyLiveAccessTokenToFetchArgs,
  getLiveAccessToken,
  persistSilentAccessToken,
  setLiveAccessToken,
} from '../../lib/auth/session';

function makeJwt(exp: number): string {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ userId: 1, exp })}.signature`;
}

describe('silent access token', () => {
  const memory = new Map<string, string>();
  const futureToken = () => makeJwt(Math.floor(Date.now() / 1000) + 3600);

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        clear: () => memory.clear(),
      },
    });
  });

  beforeEach(() => {
    setLiveAccessToken(null);
    memory.clear();
  });

  it('persists silently without requiring React state', () => {
    const tokenA = futureToken();
    persistSilentAccessToken(tokenA);
    expect(getLiveAccessToken()).toBe(tokenA);
    expect(localStorage.getItem('authToken')).toBe(tokenA);

    persistSilentAccessToken(tokenA);
    expect(getLiveAccessToken()).toBe(tokenA);
  });

  it('ignores an already-expired rotated token instead of poisoning the live session', () => {
    const goodToken = futureToken();
    persistSilentAccessToken(goodToken);

    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 3600);
    persistSilentAccessToken(expiredToken);

    expect(getLiveAccessToken()).toBe(goodToken);
    expect(localStorage.getItem('authToken')).toBe(goodToken);
  });

  it('rewrites Bearer Authorization on fetch init', () => {
    const [input, init] = applyLiveAccessTokenToFetchArgs(
      '/api/tasks',
      { headers: { Authorization: 'Bearer stale-token' } },
      'fresh-token'
    );
    expect(input).toBe('/api/tasks');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('leaves requests without Bearer auth unchanged', () => {
    const original = { headers: { 'Content-Type': 'application/json' } };
    const [input, init] = applyLiveAccessTokenToFetchArgs('/api/public', original, 'fresh-token');
    expect(input).toBe('/api/public');
    expect(init).toBe(original);
  });
});
