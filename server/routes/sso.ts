import { Router, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const SSO_SHARED_SECRET = process.env.SSO_SHARED_SECRET || process.env.JWT_SECRET || '';

/** Access JWT lifetime for companion apps (Synapse). */
const ACCESS_TTL_SEC = 8 * 60 * 60;
/** Refresh JWT lifetime — allows silent renew without browser login. */
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

interface SsoCodeRecord {
  userId: number;
  username: string;
  email: string;
  isAdmin?: boolean;
  customerId?: number | null;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

interface SsoUserClaims {
  userId: number;
  username: string;
  email: string;
  isAdmin?: boolean;
  customerId?: number | null;
}

/** One-time authorization codes (in-memory; fine for single-node v1). */
const pendingCodes = new Map<string, SsoCodeRecord>();

const CODE_TTL_MS = 2 * 60 * 1000;

function pruneCodes(): void {
  const now = Date.now();
  for (const [code, record] of pendingCodes.entries()) {
    if (record.expiresAt < now) pendingCodes.delete(code);
  }
}

function parseAllowedRedirects(): string[] {
  return String(process.env.ALLOWED_SSO_REDIRECTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRedirectAllowed(redirectUri: string): boolean {
  const allowed = parseAllowedRedirects();
  if (allowed.length === 0) {
    // Dev fallback: allow localhost Synapse callbacks only when list is empty
    try {
      const u = new URL(redirectUri);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }
  return allowed.some((prefix) => redirectUri === prefix || redirectUri.startsWith(prefix));
}

function parseClients(): Array<{ clientId: string; clientSecret: string }> {
  // Format: clientId:secret,clientId2:secret2  OR single SSO_CLIENT_ID + SSO_CLIENT_SECRET
  const raw = String(process.env.SSO_CLIENTS || '').trim();
  if (raw) {
    return raw.split(',').map((entry) => {
      const [clientId, clientSecret] = entry.split(':').map((s) => s.trim());
      return { clientId, clientSecret };
    }).filter((c) => c.clientId && c.clientSecret);
  }
  const clientId = process.env.SSO_CLIENT_ID || 'pm-synapse';
  const clientSecret = process.env.SSO_CLIENT_SECRET || SSO_SHARED_SECRET;
  if (clientId && clientSecret) {
    return [{ clientId, clientSecret }];
  }
  return [];
}

function verifyClient(clientId: string, clientSecret: string): boolean {
  const clients = parseClients();
  if (clients.length === 0) {
    return Boolean(SSO_SHARED_SECRET) && clientSecret === SSO_SHARED_SECRET;
  }
  return clients.some((c) => c.clientId === clientId && c.clientSecret === clientSecret);
}

function issueSsoTokenPair(user: SsoUserClaims): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
} {
  const accessToken = jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      customerId: user.customerId,
      sso: true,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SEC }
  );

  const refreshToken = jwt.sign(
    {
      typ: 'sso_refresh',
      userId: user.userId,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      customerId: user.customerId,
      sso: true,
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TTL_SEC }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SEC,
    refreshExpiresIn: REFRESH_TTL_SEC,
  };
}

function tokenResponse(user: SsoUserClaims) {
  const pair = issueSsoTokenPair(user);
  return {
    success: true,
    data: {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer',
      expiresIn: pair.expiresIn,
      refreshExpiresIn: pair.refreshExpiresIn,
      user: {
        id: user.userId,
        username: user.username,
        email: user.email,
      },
    },
  };
}

/**
 * POST /api/sso/handoff
 * Authenticated. Creates a one-time code for the given redirect_uri.
 */
router.post('/handoff', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    pruneCodes();
    const redirectUri = String(req.body?.redirectUri || req.body?.redirect_uri || '').trim();
    const state = String(req.body?.state || '').trim();
    const clientId = String(req.body?.clientId || req.body?.client_id || 'pm-synapse').trim();

    if (!redirectUri) {
      return res.status(400).json({ success: false, message: 'redirectUri is required' });
    }
    if (!isRedirectAllowed(redirectUri)) {
      return res.status(400).json({ success: false, message: 'redirectUri is not allowed' });
    }
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const code = crypto.randomBytes(24).toString('hex');
    pendingCodes.set(code, {
      userId: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      isAdmin: req.user.isAdmin,
      customerId: req.user.customerId ?? null,
      redirectUri,
      clientId,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    return res.json({
      success: true,
      data: {
        code,
        state: state || undefined,
        redirectUri,
        expiresIn: Math.floor(CODE_TTL_MS / 1000),
      },
    });
  } catch (error) {
    logger.error('SSO handoff error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create SSO handoff' });
  }
});

/**
 * POST /api/sso/token
 * - Exchange one-time code for access + refresh JWTs (companion apps).
 * - Or refresh: { grant_type: "refresh_token", refresh_token, client_id, client_secret }
 */
router.post('/token', async (req, res: Response) => {
  try {
    pruneCodes();
    const grantType = String(req.body?.grant_type || req.body?.grantType || 'authorization_code')
      .trim()
      .toLowerCase();
    const clientId = String(req.body?.client_id || req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.client_secret || req.body?.clientSecret || '').trim();

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'client_id and client_secret are required',
      });
    }
    if (!verifyClient(clientId, clientSecret)) {
      return res.status(401).json({ success: false, message: 'Invalid client credentials' });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || '').trim();
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'refresh_token is required',
        });
      }

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(refreshToken, JWT_SECRET) as jwt.JwtPayload;
      } catch {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token',
        });
      }

      if (decoded.typ !== 'sso_refresh' || !decoded.sso) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token type',
        });
      }

      const userId = Number(decoded.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ success: false, message: 'Invalid refresh token subject' });
      }

      logger.info('SSO refresh token exchanged', { userId, clientId });
      return res.json(
        tokenResponse({
          userId,
          username: String(decoded.username || ''),
          email: String(decoded.email || ''),
          isAdmin: Boolean(decoded.isAdmin),
          customerId: decoded.customerId ?? null,
        })
      );
    }

    // Default: authorization_code
    const code = String(req.body?.code || '').trim();
    const redirectUri = String(req.body?.redirect_uri || req.body?.redirectUri || '').trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'code, client_id, and client_secret are required',
      });
    }

    const record = pendingCodes.get(code);
    if (!record) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }
    pendingCodes.delete(code);

    if (record.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }
    if (record.clientId !== clientId) {
      return res.status(400).json({ success: false, message: 'client_id mismatch' });
    }
    if (redirectUri && record.redirectUri !== redirectUri) {
      return res.status(400).json({ success: false, message: 'redirect_uri mismatch' });
    }

    return res.json(
      tokenResponse({
        userId: record.userId,
        username: record.username,
        email: record.email,
        isAdmin: record.isAdmin,
        customerId: record.customerId,
      })
    );
  } catch (error) {
    logger.error('SSO token exchange error:', error);
    return res.status(500).json({ success: false, message: 'Failed to exchange SSO token' });
  }
});

export default router;
