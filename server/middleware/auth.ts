import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { pool } from '../config/database';

// CRITICAL: JWT_SECRET must be set in environment variables
const JWT_SECRET = process.env.JWT_SECRET;

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
