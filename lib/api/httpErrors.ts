interface ApiErrorPayload {
  message?: string;
  error?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

export const getApiErrorMessageFromPayload = (
  payload: ApiErrorPayload | null | undefined,
  fallback: string
): string => {
  if (!payload) return fallback;

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const details = payload.errors
      .map((entry) => {
        const field = entry.field?.trim();
        const message = entry.message?.trim();
        if (field && message) return `${field}: ${message}`;
        return message || field || '';
      })
      .filter(Boolean)
      .join('; ');
    if (details) {
      return payload.message && payload.message !== 'Validation error'
        ? `${payload.message} (${details})`
        : details;
    }
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  return fallback;
};
