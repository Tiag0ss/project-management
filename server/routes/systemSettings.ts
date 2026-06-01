import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { encrypt, isEncrypted } from '../utils/encryption';
import { ensureAiAssistantViews } from '../utils/aiAssistantViews';

// Keys that should be encrypted in the database
const ENCRYPTED_KEYS = ['smtpPassword', 'openAIApiKey', 'outlookTenantId', 'outlookClientId', 'outlookClientSecret'];

// Keys that should be masked in GET responses
const MASKED_KEYS = ['smtpPassword', 'openAIApiKey', 'outlookTenantId', 'outlookClientId', 'outlookClientSecret'];

const router = Router();

const parseBooleanSetting = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const isDemoModeEnabled = (): boolean => parseBooleanSetting(process.env.DEMO);

/**
 * @swagger
 * tags:
 *   name: SystemSettings
 *   description: Application system settings
 */

/**
 * @swagger
 * /api/system-settings/public:
 *   get:
 *     summary: Get public system settings
 *     tags: [SystemSettings]
 *     security: []
 *     responses:
 *       200:
 *         description: Public settings (registration, etc.)
 */
// Get public registration setting (no auth required)
router.get('/public', async (req, res: Response) => {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?, ?, ?, ?, ?)',
      [
        'allowPublicRegistration',
        'publicRegistrationType',
        'companyName',
        'companyLogoUrl',
        'faviconUrl',
        'frontpageEnabled'
      ]
    );

    const settingsObj: Record<string, string> = {};
    settings.forEach(setting => {
      settingsObj[setting.SettingKey] = setting.SettingValue;
    });

    const allowPublicRegistration = parseBooleanSetting(settingsObj.allowPublicRegistration);
    const publicRegistrationType = settingsObj.publicRegistrationType || 'internal';
    const companyName = settingsObj.companyName || 'Project Management';
    const companyLogoUrl = settingsObj.companyLogoUrl || '';
    const faviconUrl = settingsObj.faviconUrl || '';
    const frontpageEnabled = settingsObj.frontpageEnabled !== 'false';
    const demoMode = isDemoModeEnabled();
    res.json({
      success: true,
      allowPublicRegistration,
      publicRegistrationType,
      companyName,
      companyLogoUrl,
      faviconUrl,
      frontpageEnabled,
      demoMode,
    });
  } catch (error) {
    console.error('Get public registration setting error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch registration setting' 
    });
  }
});

// Get authenticated user flags (requires login)
router.get('/user-flags', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?, ?, ?, ?)',
      ['autoApproveTimeEntries', 'autoApproveVacations', 'autoApproveOutOfOffice', 'internalTicketsEnabled', 'memosEnabled']
    );

    const settingsObj: Record<string, string> = {};
    settings.forEach(setting => {
      settingsObj[setting.SettingKey] = setting.SettingValue;
    });

    const autoApproveTimeEntries = parseBooleanSetting(settingsObj.autoApproveTimeEntries);
    const autoApproveVacations = parseBooleanSetting(settingsObj.autoApproveVacations);
    const autoApproveOutOfOffice = parseBooleanSetting(settingsObj.autoApproveOutOfOffice);
    const internalTicketsEnabled = settingsObj.internalTicketsEnabled !== 'false';
    const memosEnabled = settingsObj.memosEnabled !== 'false';

    res.json({
      success: true,
      autoApproveTimeEntries,
      autoApproveVacations,
      autoApproveOutOfOffice,
      internalTicketsEnabled,
      memosEnabled,
    });
  } catch (error) {
    console.error('Get user flags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user flags',
    });
  }
});

/**
 * @swagger
 * /api/system-settings/public-frontpage:
 *   get:
 *     summary: Get public frontpage content
 *     tags: [SystemSettings]
 *     security: []
 *     responses:
 *       200:
 *         description: Frontpage HTML content (public)
 */
// Get public frontpage content (no auth required)
router.get('/public-frontpage', async (req, res: Response) => {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
      ['frontpage_content']
    );

    const content = settings.length > 0 ? settings[0].SettingValue : null;

    res.json({ success: true, content });
  } catch (error) {
    console.error('Get public frontpage content error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch frontpage content' 
    });
  }
});

/**
 * @swagger
 * /api/system-settings/frontpage:
 *   get:
 *     summary: Get frontpage content (authenticated)
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Frontpage HTML content
 */
router.get('/frontpage', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (isDemoModeEnabled()) {
      return res.status(403).json({ success: false, message: 'Frontpage loading is disabled in demo mode' });
    }

    const userId = req.user?.userId;
    
    // Check if user is admin
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT IsAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    const isAdmin = users.length > 0 && (users[0].IsAdmin === 1 || users[0].IsAdmin === true);
    
    if (!isAdmin) {
      console.log('Frontpage access denied. User:', userId, 'IsAdmin:', users.length > 0 ? users[0].IsAdmin : 'not found');
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Get frontpage content from SystemSettings
    const [settings] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
      ['frontpage_content']
    );

    const content = settings.length > 0 ? settings[0].SettingValue : null;

    res.json({ success: true, content });
  } catch (error) {
    console.error('Error fetching frontpage content:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch frontpage content' });
  }
});

/**
 * @swagger
 * /api/system-settings/frontpage:
 *   put:
 *     summary: Update frontpage content (admin only)
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Frontpage content updated
 */
router.put('/frontpage', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (isDemoModeEnabled()) {
      return res.status(403).json({ success: false, message: 'Frontpage editing is disabled in demo mode' });
    }

    const userId = req.user?.userId;
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    // Check if user is admin
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT IsAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    const isAdmin = users.length > 0 && (users[0].IsAdmin === 1 || users[0].IsAdmin === true);
    
    if (!isAdmin) {
      console.log('Frontpage update denied. User:', userId, 'IsAdmin:', users.length > 0 ? users[0].IsAdmin : 'not found');
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Check if setting exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey FROM SystemSettings WHERE SettingKey = ?',
      ['frontpage_content']
    );

    if (existing.length > 0) {
      // Update existing setting
      await pool.execute<ResultSetHeader>(
        'UPDATE SystemSettings SET SettingValue = ? WHERE SettingKey = ?',
        [content, 'frontpage_content']
      );
    } else {
      // Insert new setting
      await pool.execute<ResultSetHeader>(
        'INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES (?, ?)',
        ['frontpage_content', content]
      );
    }

    res.json({ success: true, message: 'Frontpage content updated successfully' });
  } catch (error) {
    console.error('Error updating frontpage content:', error);
    res.status(500).json({ success: false, message: 'Failed to update frontpage content' });
  }
});

/**
 * @swagger
 * /api/system-settings:
 *   get:
 *     summary: Get all system settings (admin only)
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All system settings
 *       403:
 *         description: Admin access required
 */
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
      // Never send sensitive values to the frontend
      if (MASKED_KEYS.includes(setting.SettingKey) && setting.SettingValue) {
        settingsObj[setting.SettingKey] = '';
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

/**
 * @swagger
 * /api/system-settings:
 *   put:
 *     summary: Update system settings (admin only)
 *     tags: [SystemSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: object
 *                 description: Key-value pairs of settings to update
 *     responses:
 *       200:
 *         description: System settings updated
 *       403:
 *         description: Admin access required
 */
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

      // Skip empty sensitive values - don't clear stored encrypted secrets when field is left blank
      if (ENCRYPTED_KEYS.includes(key) && !finalValue) {
        continue;
      }

      // Encrypt sensitive values before storing
      if (ENCRYPTED_KEYS.includes(key) && finalValue && !isEncrypted(finalValue)) {
        finalValue = encrypt(finalValue);
      }

      const [updateResult, updateMeta] = await pool.execute(
        `UPDATE SystemSettings SET SettingValue = ? WHERE SettingKey = ?`,
        [finalValue, key]
      );

      const affectedRows = Number(
        (updateResult as any)?.affectedRows
        || (updateResult as any)?.rowsAffected?.[0]
        || (updateMeta as any)?.affectedRows
        || 0
      );
      if (affectedRows === 0) {
        await pool.execute(
          `INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES (?, ?)`,
          [key, finalValue]
        );
      }
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

// Sync AI assistant views immediately (admin only)
router.post('/ai-assistant-views/sync', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

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

    const result = await ensureAiAssistantViews();
    return res.json(result);
  } catch (error) {
    console.error('Sync AI assistant views error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sync AI assistant views' });
  }
});

export default router;

