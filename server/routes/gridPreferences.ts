import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';

const router = Router();

interface GridPreferencesPayload {
  columnOrder?: string[];
  hiddenColumns?: string[];
  columnSizing?: Record<string, number>;
  columnSizeMode?: Record<string, 'fixed' | 'grow'>;
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  rowDensity?: 'compact' | 'comfortable';
}

const sanitizePreferences = (raw: any): GridPreferencesPayload => {
  const value = raw && typeof raw === 'object' ? raw : {};

  const columnOrder = Array.isArray(value.columnOrder)
    ? value.columnOrder.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const hiddenColumns = Array.isArray(value.hiddenColumns)
    ? value.hiddenColumns.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const columnSizing = value.columnSizing && typeof value.columnSizing === 'object' && !Array.isArray(value.columnSizing)
    ? Object.entries(value.columnSizing).reduce<Record<string, number>>((accumulator, [key, raw]) => {
        if (typeof key !== 'string' || key.trim().length === 0) return accumulator;
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return accumulator;
        const normalized = Math.max(60, Math.min(1400, Math.round(numeric)));
        accumulator[key] = normalized;
        return accumulator;
      }, {})
    : {};

  const columnSizeMode = value.columnSizeMode && typeof value.columnSizeMode === 'object' && !Array.isArray(value.columnSizeMode)
    ? Object.entries(value.columnSizeMode).reduce<Record<string, 'fixed' | 'grow'>>((accumulator, [key, raw]) => {
        if (typeof key !== 'string' || key.trim().length === 0) return accumulator;
        if (raw === 'fixed' || raw === 'grow') {
          accumulator[key] = raw;
        }
        return accumulator;
      }, {})
    : {};

  const sortField = typeof value.sortField === 'string' && value.sortField.trim().length > 0
    ? value.sortField
    : null;

  const sortDirection = value.sortDirection === 'asc' || value.sortDirection === 'desc'
    ? value.sortDirection
    : null;

  const rowDensity = value.rowDensity === 'compact' || value.rowDensity === 'comfortable'
    ? value.rowDensity
    : 'comfortable';

  return {
    columnOrder,
    hiddenColumns,
    columnSizing,
    columnSizeMode,
    sortField,
    sortDirection,
    rowDensity,
  };
};

// Get all grid preferences for current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT GridKey, PreferencesJson FROM UserGridPreferences WHERE UserId = ?',
      [userId]
    );

    const preferences = rows.map((row) => {
      let parsed: GridPreferencesPayload = {};
      try {
        parsed = sanitizePreferences(JSON.parse(String(row.PreferencesJson || '{}')));
      } catch {
        parsed = {};
      }

      return {
        gridKey: String(row.GridKey),
        ...parsed,
      };
    });

    res.json({ success: true, preferences });
  } catch (error) {
    logger.error('Error fetching grid preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch grid preferences' });
  }
});

// Get a single grid preference for current user
router.get('/:gridKey', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const rawGridKey = req.params.gridKey;
    const gridKeyParam = typeof rawGridKey === 'string' ? rawGridKey : rawGridKey?.[0] || '';
    const gridKey = decodeURIComponent(gridKeyParam);

    const payload = await cachedJson(
      cacheKeys.userGridPref(userId, gridKey),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          'SELECT PreferencesJson FROM UserGridPreferences WHERE UserId = ? AND GridKey = ?',
          [userId, gridKey]
        );

        if (rows.length === 0) {
          return { success: true, preference: null };
        }

        let preference: GridPreferencesPayload = {};
        try {
          preference = sanitizePreferences(JSON.parse(String(rows[0].PreferencesJson || '{}')));
        } catch {
          preference = {};
        }

        return { success: true, preference };
      }
    );

    res.json(payload);
  } catch (error) {
    logger.error('Error fetching grid preference:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch grid preference' });
  }
});

// Upsert grid preference for current user
router.put('/:gridKey', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const rawGridKey = req.params.gridKey;
    const gridKeyParam = typeof rawGridKey === 'string' ? rawGridKey : rawGridKey?.[0] || '';
    const gridKey = decodeURIComponent(gridKeyParam);
    if (!gridKey || gridKey.length > 255) {
      return res.status(400).json({ success: false, message: 'Invalid grid key' });
    }

    const payload = sanitizePreferences(req.body || {});
    const preferencesJson = JSON.stringify(payload);

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM UserGridPreferences WHERE UserId = ? AND GridKey = ?',
      [userId, gridKey]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE UserGridPreferences SET PreferencesJson = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE UserId = ? AND GridKey = ?',
        [preferencesJson, userId, gridKey]
      );
    } else {
      await pool.execute<ResultSetHeader>(
        'INSERT INTO UserGridPreferences (UserId, GridKey, PreferencesJson) VALUES (?, ?, ?)',
        [userId, gridKey, preferencesJson]
      );
    }

    await invalidateByEntity('gridPreference', { userId, gridKey });

    res.json({ success: true, message: 'Grid preferences saved' });
  } catch (error) {
    logger.error('Error saving grid preference:', error);
    res.status(500).json({ success: false, message: 'Failed to save grid preference' });
  }
});

export default router;
