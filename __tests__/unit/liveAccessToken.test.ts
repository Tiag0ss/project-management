import {
  applyLiveAccessTokenToFetchArgs,
  getLiveAccessToken,
  persistSilentAccessToken,
  setLiveAccessToken,
} from '../../lib/auth/session';

describe('silent access token', () => {
  const memory = new Map<string, string>();

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
    persistSilentAccessToken('token-a');
    expect(getLiveAccessToken()).toBe('token-a');
    expect(localStorage.getItem('authToken')).toBe('token-a');

    persistSilentAccessToken('token-a');
    expect(getLiveAccessToken()).toBe('token-a');
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
