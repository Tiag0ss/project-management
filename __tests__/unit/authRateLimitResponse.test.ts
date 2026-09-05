import { parseAuthResponseJson } from '../../lib/auth/parseAuthResponse';

describe('parseAuthResponseJson', () => {
  it('maps plain-text 429 bodies to a stable JSON message', async () => {
    const response = new Response('Too many authentication attempts, please try again later', {
      status: 429,
      headers: { 'Content-Type': 'text/plain' },
    });
    const parsed = await parseAuthResponseJson(response);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toMatch(/too many authentication attempts/i);
  });

  it('parses normal JSON error bodies', async () => {
    const response = new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    const parsed = await parseAuthResponseJson(response);
    expect(parsed).toEqual({ success: false, message: 'Invalid credentials' });
  });
});
