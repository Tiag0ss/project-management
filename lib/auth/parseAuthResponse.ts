/** Safely parse auth API responses that may be JSON or plain-text rate-limit bodies. */
export async function parseAuthResponseJson(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    const trimmed = raw.trim();
    if (response.status === 429 || /too many authentication attempts/i.test(trimmed)) {
      return {
        success: false,
        message: 'Too many authentication attempts, please try again later',
      };
    }
    return {
      success: false,
      message: trimmed.slice(0, 200) || 'Unexpected authentication response',
    };
  }
}
