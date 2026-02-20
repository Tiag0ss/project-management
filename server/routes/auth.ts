import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { logActivity } from './activityLogs';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const SALT_ROUNDS = 10;

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
    const { username, email, password, firstName, lastName } = req.body;

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
    const { username, password } = req.body;

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

export default router;
