import { getApiUrl } from './config';
import { parseAuthResponseJson } from '@/lib/auth/parseAuthResponse';

const API_BASE_URL = getApiUrl();

interface EncryptionSessionResponse {
  success: boolean;
  sessionToken: string;
  publicKey: string;
  expiresInSeconds: number;
}

interface EncryptedAuthPayload {
  sessionToken: string;
  encryptedKey: string;
  iv: string;
  encryptedData: string;
}

let cachedEncryptionSession: {
  sessionToken: string;
  publicKey: string;
  expiresAt: number;
} | null = null;

const supportsAuthEncryption = (): boolean => {
  if (typeof window === 'undefined') return false;
  const subtle = window.crypto?.subtle as SubtleCrypto | undefined;
  return Boolean(
    subtle &&
    typeof subtle.importKey === 'function' &&
    typeof subtle.generateKey === 'function' &&
    typeof subtle.encrypt === 'function' &&
    typeof subtle.exportKey === 'function'
  );
};

const stringToUint8Array = (value: string): Uint8Array => new TextEncoder().encode(value);

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const prepareAuthEncryptionSession = async (forceRefresh = false): Promise<void> => {
  if (!supportsAuthEncryption()) {
    cachedEncryptionSession = null;
    return;
  }

  const now = Date.now();
  if (!forceRefresh && cachedEncryptionSession && cachedEncryptionSession.expiresAt - 10000 > now) {
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/encryption-session`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data: EncryptionSessionResponse = await parseAuthResponseJson(response);
  if (!response.ok || !data.success || !data.sessionToken || !data.publicKey) {
    throw new Error(data.message || 'Failed to initialize encryption session');
  }

  cachedEncryptionSession = {
    sessionToken: data.sessionToken,
    publicKey: data.publicKey,
    expiresAt: now + (Number(data.expiresInSeconds || 0) * 1000),
  };
};

const encryptAuthPayload = async (payload: object): Promise<EncryptedAuthPayload> => {
  if (!supportsAuthEncryption()) {
    throw new Error('Secure login requires Web Crypto. Please use a modern browser over HTTPS.');
  }

  await prepareAuthEncryptionSession();

  if (!cachedEncryptionSession) {
    throw new Error('Encryption session not available');
  }

  const publicKeyBuffer = pemToArrayBuffer(cachedEncryptionSession.publicKey);
  const importedPublicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt']
  );

  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const payloadBytes = stringToUint8Array(JSON.stringify(payload));

  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    payloadBytes as BufferSource
  );

  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedAesKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    importedPublicKey,
    rawAesKey as BufferSource
  );

  const encryptedPayload: EncryptedAuthPayload = {
    sessionToken: cachedEncryptionSession.sessionToken,
    encryptedKey: arrayBufferToBase64(encryptedAesKey),
    iv: arrayBufferToBase64(iv.buffer),
    encryptedData: arrayBufferToBase64(encryptedData),
  };

  cachedEncryptionSession = null;
  return encryptedPayload;
};

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
  isSupport?: boolean;
  isDeveloper?: boolean;
  isManager?: boolean;
  customerId?: number | null;
  countryCode?: string | null;
  hoursDisplayFormat?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface ValidateResetTokenResponse {
  success: boolean;
  valid: boolean;
  message?: string;
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const encryptedPayload = await encryptAuthPayload(credentials);

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedPayload }),
    });

    const data = await parseAuthResponseJson(response);
    
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    return data;
  },

  async register(userData: RegisterData): Promise<AuthResponse> {
    const encryptedPayload = await encryptAuthPayload(userData);

    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedPayload }),
    });

    const data = await parseAuthResponseJson(response);
    
    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    return data;
  },

  async getProfile(token: string): Promise<{ success: boolean; user: User }> {
    const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch profile');
    }

    return data;
  },

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await parseAuthResponseJson(response);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to request password reset');
    }

    return data;
  },

  async validateResetToken(token: string): Promise<ValidateResetTokenResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await parseAuthResponseJson(response);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to validate reset token');
    }

    return data;
  },

  async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, newPassword }),
    });

    const data = await parseAuthResponseJson(response);

    if (!response.ok) {
      throw new Error(data.message || 'Failed to reset password');
    }

    return data;
  },
};
