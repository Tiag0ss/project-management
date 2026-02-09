import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { encrypt, isEncrypted } from '../utils/encryption';

// Keys that should be encrypted in the database
const ENCRYPTED_KEYS = ['smtpPassword'];

// Keys that should be masked in GET responses
const MASKED_KEYS = ['smtpPassword'];

const router = Router();

// Get public registration setting (no auth required)
router.get('/public', async (req, res: Response) => {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?)',
      ['allowPublicRegistration', 'publicRegistrationType']
    );

    const settingsObj: Record<string, string> = {};
    settings.forEach(setting => {
      settingsObj[setting.SettingKey] = setting.SettingValue;
    });

    const allowPublicRegistration = settingsObj.allowPublicRegistration === 'true';
    const publicRegistrationType = settingsObj.publicRegistrationType || 'internal';

    res.json({
      success: true,
      allowPublicRegistration,
      publicRegistrationType
    });
  } catch (error) {
    console.error('Get public registration setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch registration setting' 
    });
  }
});

// Get all system settings (admin only)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT IsAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!users.length || !users[0].IsAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM SystemSettings'
    );

    // Convert to key-value object
    const settingsObj: Record<string, string> = {};
    settings.forEach(setting => {
      // Mask sensitive values - never send passwords to the frontend
      if (MASKED_KEYS.includes(setting.SettingKey) && setting.SettingValue) {
        settingsObj[setting.SettingKey] = '••••••••';
      } else {
        settingsObj[setting.SettingKey] = setting.SettingValue;
      }
    });

    res.json({
      success: true,
      settings: settingsObj
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch system settings' 
    });
  }
});

// Update system settings (admin only)
router.put('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { settings } = req.body;

    // Check if user is admin
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT IsAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!users.length || !users[0].IsAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      let finalValue = value as string;

      // Skip masked placeholder values - don't overwrite with the mask
      if (MASKED_KEYS.includes(key) && finalValue === '••••••••') {
        continue;
      }

      // Encrypt sensitive values before storing
      if (ENCRYPTED_KEYS.includes(key) && finalValue && !isEncrypted(finalValue)) {
        finalValue = encrypt(finalValue);
      }

      await pool.execute(
        `INSERT INTO SystemSettings (SettingKey, SettingValue) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE SettingValue = ?`,
        [key, finalValue, finalValue]
      );
    }

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update system settings' 
    });
  }
});

export default router;
