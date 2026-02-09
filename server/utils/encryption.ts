import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING: BufferEncoding = 'hex';

// Prefix to identify encrypted values
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Get the encryption key from environment variables.
 * Must be a 64-character hex string (32 bytes).
 * If not set, generates a deterministic key from JWT_SECRET as fallback.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (envKey) {
    if (envKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    return Buffer.from(envKey, 'hex');
  }

  // Fallback: derive key from JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set for encryption');
  }

  // Derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(jwtSecret).digest();
}

/**
 * Encrypt a plain text value using AES-256-GCM.
 * Returns a prefixed string: "enc:<iv>:<authTag>:<ciphertext>" (all hex-encoded)
 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`;
}

/**
 * Decrypt an encrypted value produced by encrypt().
 * Expects format: "enc:<iv>:<authTag>:<ciphertext>"
 * If the value is not encrypted (no prefix), returns it as-is for backward compatibility.
 */
export function decrypt(encryptedText: string): string {
  // If not encrypted, return as-is (backward compatibility with existing plain text passwords)
  if (!encryptedText || !encryptedText.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
    const withoutPrefix = encryptedText.slice(ENCRYPTED_PREFIX.length);
    const parts = withoutPrefix.split(':');

    if (parts.length !== 3) {
      console.error('Invalid encrypted value format');
      return encryptedText;
    }

    const [ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, ENCODING);
    const authTag = Buffer.from(authTagHex, ENCODING);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return original value if decryption fails (e.g., key changed)
    return encryptedText;
  }
}

/**
 * Check if a value is already encrypted
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTED_PREFIX) ?? false;
}
