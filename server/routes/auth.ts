import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  randomUUID,
} from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { logActivity } from './activityLogs';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const SALT_ROUNDS = 10;
const ENCRYPTION_SESSION_TTL_MS = 10 * 60 * 1000;

interface EncryptionSession {
  privateKey: string;
  expiresAt: number;
}

interface EncryptedAuthPayload {
  sessionToken: string;
  encryptedKey: string;
  iv: string;
  encryptedData: string;
}

const authEncryptionSessions = new Map<string, EncryptionSession>();

const cleanupExpiredEncryptionSessions = () => {
  const now = Date.now();
  for (const [token, session] of authEncryptionSessions.entries()) {
    if (session.expiresAt <= now) {
      authEncryptionSessions.delete(token);
    }
  }
};

const decodeBase64 = (value: string): Buffer => Buffer.from(value, 'base64');

const decryptAuthPayload = (payload: EncryptedAuthPayload): any => {
  cleanupExpiredEncryptionSessions();

  const session = authEncryptionSessions.get(payload.sessionToken);
  if (!session || session.expiresAt <= Date.now()) {
    throw new Error('Encryption session is missing or expired');
  }

  const encryptedKeyBuffer = decodeBase64(payload.encryptedKey);
  const aesKey = privateDecrypt(
    {
      key: session.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedKeyBuffer
  );

  const ivBuffer = decodeBase64(payload.iv);
  const encryptedPayloadBuffer = decodeBase64(payload.encryptedData);

  if (encryptedPayloadBuffer.length < 17) {
    throw new Error('Invalid encrypted payload');
  }

  const authTag = encryptedPayloadBuffer.subarray(encryptedPayloadBuffer.length - 16);
  const cipherText = encryptedPayloadBuffer.subarray(0, encryptedPayloadBuffer.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, ivBuffer);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
  authEncryptionSessions.delete(payload.sessionToken);

  return JSON.parse(decrypted);
};

const getAuthRequestBody = (body: any): any => {
  const encryptedPayload = body?.encryptedPayload as EncryptedAuthPayload | undefined;
  if (!encryptedPayload) {
    return body;
  }

  if (!encryptedPayload.sessionToken || !encryptedPayload.encryptedKey || !encryptedPayload.iv || !encryptedPayload.encryptedData) {
    throw new Error('Invalid encrypted payload format');
  }

  return decryptAuthPayload(encryptedPayload);
};

router.get('/encryption-session', async (_req: Request, res: Response) => {
  try {
    cleanupExpiredEncryptionSessions();

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const sessionToken = randomUUID();
    authEncryptionSessions.set(sessionToken, {
      privateKey,
      expiresAt: Date.now() + ENCRYPTION_SESSION_TTL_MS,
    });

    res.json({
      success: true,
      sessionToken,
      publicKey,
      expiresInSeconds: Math.floor(ENCRYPTION_SESSION_TTL_MS / 1000),
    });
  } catch (error) {
    console.error('Encryption session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create encryption session',
    });
  }
});

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: secret123
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Public registration disabled
 *       409:
 *         description: Username or email already exists
 *       500:
 *         description: Server error
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    let payload: any;
    try {
      payload = getAuthRequestBody(req.body);
    } catch (decryptError: any) {
      return res.status(400).json({
        success: false,
        message: decryptError?.message || 'Invalid encrypted registration payload',
      });
    }

    const { username, email, password, firstName, lastName } = payload;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email, and password are required' 
      });
    }

    // Get system settings to check if public registration is allowed
    const [settingsRows] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?, ?)',
      ['allowPublicRegistration', 'publicRegistrationType', 'defaultCustomerId']
    );

    const settings: Record<string, string> = {};
    settingsRows.forEach(row => {
      settings[row.SettingKey] = row.SettingValue;
    });

    // Check if public registration is allowed
    if (settings.allowPublicRegistration !== 'true') {
      return res.status(403).json({ 
        success: false, 
        message: 'Public registration is currently disabled' 
      });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE Username = ? OR Email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Determine if user should be created as customer or internal
    const registrationType = settings.publicRegistrationType || 'internal';
    const customerId = registrationType === 'customer' ? (settings.defaultCustomerId || null) : null;

    // Insert user
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO Users (Username, Email, PasswordHash, FirstName, LastName, CustomerId) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, firstName || null, lastName || null, customerId]
    );

    // Log registration
    await logActivity(
      result.insertId,
      username,
      'USER_REGISTER',
      'User',
      result.insertId,
      username,
      `New user registered: ${username} (${email})`,
      req.ip,
      req.get('user-agent')
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration' 
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and get JWT token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     email: { type: string }
 *                     isAdmin: { type: boolean }
 *       400:
 *         description: Missing username or password
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account disabled
 *       500:
 *         description: Server error
 */
// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    let payload: any;
    try {
      payload = getAuthRequestBody(req.body);
    } catch (decryptError: any) {
      return res.status(400).json({
        success: false,
        message: decryptError?.message || 'Invalid encrypted login payload',
      });
    }

    const { username, password } = payload;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Find user
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Username, Email, PasswordHash, FirstName, LastName, IsActive, IsAdmin, IsSupport, IsDeveloper, IsManager, CustomerId FROM Users WHERE Username = ? OR Email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    const user = users[0];

    // Check if user is active
    if (!user.IsActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is disabled' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.PasswordHash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.Id, 
        username: user.Username,
        email: user.Email,
        isAdmin: user.IsAdmin,
        isSupport: user.IsSupport,
        isDeveloper: user.IsDeveloper,
        isManager: user.IsManager,
        customerId: user.CustomerId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log successful login
    await logActivity(
      user.Id,
      user.Username,
      'USER_LOGIN',
      'User',
      user.Id,
      user.Username,
      `User logged in: ${user.Username}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.Id,
        username: user.Username,
        email: user.Email,
        firstName: user.FirstName,
        isSupport: user.IsSupport,
        isDeveloper: user.IsDeveloper,
        isManager: user.IsManager,
        lastName: user.LastName,
        isAdmin: user.IsAdmin,
        customerId: user.CustomerId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh authentication token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: No token provided
 *       403:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify current token (even if expired, decode it)
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error: any) {
      // If token is expired, try to decode it anyway to get user info
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token);
      } else {
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid token' 
        });
      }
    }

    if (!decoded || !decoded.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid token payload' 
      });
    }

    // Verify user still exists and is active
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Username, Email, IsAdmin, IsSupport, IsDeveloper, IsManager, CustomerId FROM Users WHERE Id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = users[0];

    // Generate new token
    const newToken = jwt.sign(
      {
        userId: user.Id,
        username: user.Username,
        email: user.Email,
        isAdmin: user.IsAdmin,
        isSupport: user.IsSupport,
        isDeveloper: user.IsDeveloper,
        isManager: user.IsManager,
        customerId: user.CustomerId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during token refresh' 
    });
  }
});

export default router;
