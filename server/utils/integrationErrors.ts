/**
 * Build a client-safe message for integration write failures.
 * Avoids leaking tokens/secrets while still explaining common server misconfig.
 */
export function integrationWriteErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    message?: string;
    sqlMessage?: string;
    code?: string;
    number?: number;
    originalError?: { info?: { message?: string } };
  } | null;

  const message = String(err?.message || '');
  const sqlMessage = String(
    err?.sqlMessage || err?.originalError?.info?.message || ''
  );
  const combined = `${message} ${sqlMessage}`.trim();

  if (/ENCRYPTION_KEY must be|JWT_SECRET must be|encryption/i.test(combined)) {
    return 'Server encryption is misconfigured. Set a valid ENCRYPTION_KEY (64 hex chars) or JWT_SECRET.';
  }

  if (
    /Data too long|ER_DATA_TOO_LONG|String or binary data would be truncated|8152/i.test(
      combined
    )
  ) {
    return `${fallback}: encrypted token is too long for the database column (widen the token column and retry).`;
  }

  if (/Duplicate entry|ER_DUP_ENTRY|PRIMARY|2627|2601/i.test(combined)) {
    return `${fallback}: database still uses a single-row-per-organization key. Restart the API so the multi-instance migration can rebuild the table, then retry.`;
  }

  if (/ER_NO_SUCH_TABLE|doesn't exist|Invalid object name|42S02/i.test(combined)) {
    return `${fallback}: integrations table is missing — run database schema sync on the server.`;
  }

  if (/Invalid URL/i.test(combined)) {
    return 'URL is invalid. Use a full URL including https:// (e.g. https://api.github.com).';
  }

  if (sqlMessage && sqlMessage.length <= 240 && !/(token|password|secret|enc:)/i.test(sqlMessage)) {
    return `${fallback}: ${sqlMessage}`;
  }

  if (message && message.length <= 240 && !/(token|password|secret|enc:)/i.test(message)) {
    return `${fallback}: ${message}`;
  }

  return fallback;
}
