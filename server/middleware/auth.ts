import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger';
import { pool, RowDataPacket } from '../config/database';
import { cache } from '../services/cache';
import { cacheKeys, AUTH_TOKEN_TTL_SECONDS } from '../services/cacheKeys';

// CRITICAL: JWT_SECRET must be set in environment variables
const JWT_SECRET = process.env.JWT_SECRET;

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET is not defined in environment variables');
  throw new Error('JWT_SECRET must be defined in environment variables for security');
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    username: string;
    email: string;
    isAdmin?: boolean;
    customerId?: number | null;
  };
}

interface CachedApiTokenAuth {
  user: NonNullable<AuthRequest['user']>;
  tokenId: number;
  expiresAt: string | null;
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', { ip: req.ip });
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required' 
    });
  }

  // --- API Token path (prefix: pt_) ---
  if (token.startsWith('pt_')) {
    try {
      const tokenHash = hashToken(token);
      const cacheKey = cacheKeys.authToken(tokenHash);
      const cached = await cache.get<CachedApiTokenAuth>(cacheKey);

      if (cached) {
        if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
          return res.status(403).json({ success: false, message: 'API token has expired' });
        }

        pool.execute('UPDATE ApiTokens SET LastUsedAt = CURRENT_TIMESTAMP WHERE Id = ?', [cached.tokenId]).catch(() => {});
        req.user = cached.user;
        return next();
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.UserId, t.IsActive, t.ExpiresAt,
                u.Username, u.Email, u.isAdmin, u.CustomerId
         FROM ApiTokens t
         INNER JOIN Users u ON t.UserId = u.Id
         WHERE t.TokenHash = ?`,
        [tokenHash]
      );

      if (!rows.length) {
        logger.warn('API token authentication failed: token not found', { ip: req.ip });
        return res.status(403).json({ success: false, message: 'Invalid API token' });
      }

      const row = rows[0];

      if (!row.IsActive) {
        return res.status(403).json({ success: false, message: 'API token has been revoked' });
      }

      if (row.ExpiresAt && new Date(row.ExpiresAt) < new Date()) {
        return res.status(403).json({ success: false, message: 'API token has expired' });
      }

      // Update LastUsedAt asynchronously (fire-and-forget)
      pool.execute('UPDATE ApiTokens SET LastUsedAt = CURRENT_TIMESTAMP WHERE Id = ?', [row.Id]).catch(() => {});

      const user = {
        userId: row.UserId,
        username: row.Username,
        email: row.Email,
        isAdmin: row.isAdmin === 1,
        customerId: row.CustomerId || null,
      };

      req.user = user;

      await cache.set(
        cacheKey,
        {
          user,
          tokenId: row.Id,
          expiresAt: row.ExpiresAt ? new Date(row.ExpiresAt).toISOString() : null,
        } satisfies CachedApiTokenAuth,
        AUTH_TOKEN_TTL_SECONDS
      );

      return next();
    } catch (err) {
      logger.error('API token auth error:', err);
      return res.status(500).json({ success: false, message: 'Authentication error' });
    }
  }

  // --- JWT path ---
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      isAdmin: decoded.isAdmin,
      customerId: decoded.customerId || null
    };

    // Auto-refresh token if it expires in less than 6 hours
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;
    const sixHoursInSeconds = 6 * 60 * 60;

    if (timeUntilExpiry < sixHoursInSeconds) {
      try {
        await pool.execute('UPDATE Users SET LastLoginAt = CURRENT_TIMESTAMP WHERE Id = ?', [decoded.userId]);
      } catch (refreshUpdateError) {
        logger.warn('Failed to update LastLoginAt during token auto-refresh', {
          error: refreshUpdateError,
          userId: decoded.userId,
        });
      }

      // Generate new token with same payload but fresh expiration
      const newToken = jwt.sign(
        {
          userId: decoded.userId,
          username: decoded.username,
          email: decoded.email,
          isAdmin: decoded.isAdmin,
          isSupport: decoded.isSupport,
          isDeveloper: decoded.isDeveloper,
          isManager: decoded.isManager,
          customerId: decoded.customerId
        },
        JWT_SECRET!,
        { expiresIn: '24h' }
      );

      // Send new token in response header
      res.setHeader('X-New-Token', newToken);
      logger.info(`Token auto-refreshed for user ${decoded.userId} (${decoded.username})`);
    }

    next();
  } catch (error) {
    logger.warn('Authentication failed: Invalid token', { error, ip: req.ip });
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  next();
}
