import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { logActivity } from './activityLogs';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const SALT_ROUNDS = 10;

// Check if the system needs installation (no users exist)
router.get('/check', async (req: Request, res: Response) => {
  try {
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM Users'
    );

    const needsInstall = users[0].count === 0;

    res.json({
      success: true,
      needsInstall,
    });
  } catch (error) {
    console.error('Install check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check installation status',
    });
  }
});

// Perform initial setup - create admin user and main organization
router.post('/setup', async (req: Request, res: Response) => {
  try {
    // Verify no users exist (prevent running setup again)
    const [existingUsers] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM Users'
    );

    if (existingUsers[0].count > 0) {
      return res.status(403).json({
        success: false,
        message: 'System is already installed. Setup can only run when no users exist.',
      });
    }

    const {
      // Admin user fields
      username,
      email,
      password,
      firstName,
      lastName,
      // Organization fields
      organizationName,
      organizationAbbreviation,
      organizationDescription,
    } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and password are required',
      });
    }

    if (!organizationName) {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Create admin user
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const [userResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Users (Username, Email, PasswordHash, FirstName, LastName, IsAdmin, IsDeveloper, IsSupport, IsManager, IsActive) 
         VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1, 1)`,
        [username, email, passwordHash, firstName || null, lastName || null]
      );

      const userId = userResult.insertId;

      // 2. Create main organization
      const [orgResult] = await connection.execute<ResultSetHeader>(
        'INSERT INTO Organizations (Name, Abbreviation, Description, CreatedBy) VALUES (?, ?, ?, ?)',
        [
          organizationName,
          organizationAbbreviation || null,
          organizationDescription || null,
          userId,
        ]
      );

      const organizationId = orgResult.insertId;

      // 3. Add admin user as Owner of the organization
      await connection.execute(
        'INSERT INTO OrganizationMembers (OrganizationId, UserId, Role) VALUES (?, ?, ?)',
        [organizationId, userId, 'Owner']
      );

      // 4. Create default permission groups
      const defaultGroups = [
        { name: 'Admin', canManageProjects: 1, canManageTasks: 1, canPlanTasks: 1, canManageMembers: 1, canManageSettings: 1 },
        { name: 'Manager', canManageProjects: 1, canManageTasks: 1, canPlanTasks: 1, canManageMembers: 0, canManageSettings: 0 },
        { name: 'Planner', canManageProjects: 0, canManageTasks: 0, canPlanTasks: 1, canManageMembers: 0, canManageSettings: 0 },
        { name: 'Member', canManageProjects: 0, canManageTasks: 0, canPlanTasks: 0, canManageMembers: 0, canManageSettings: 0 },
      ];

      for (const group of defaultGroups) {
        await connection.execute(
          `INSERT INTO PermissionGroups 
           (OrganizationId, GroupName, CanManageProjects, CanManageTasks, CanPlanTasks, CanManageMembers, CanManageSettings) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [organizationId, group.name, group.canManageProjects, group.canManageTasks, group.canPlanTasks, group.canManageMembers, group.canManageSettings]
        );
      }

      // 5. Create default project status values
      const defaultProjectStatuses = [
        { name: 'Active', color: '#10b981', order: 1, isDefault: 1 },
        { name: 'On Hold', color: '#f59e0b', order: 2, isDefault: 0 },
        { name: 'Completed', color: '#3b82f6', order: 3, isDefault: 0 },
        { name: 'Cancelled', color: '#ef4444', order: 4, isDefault: 0 },
      ];

      for (const status of defaultProjectStatuses) {
        await connection.execute(
          `INSERT INTO ProjectStatusValues 
           (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault) 
           VALUES (?, ?, ?, ?, ?)`,
          [organizationId, status.name, status.color, status.order, status.isDefault]
        );
      }

      // 6. Create default task status values
      const defaultTaskStatuses = [
        { name: 'To Do', color: '#6b7280', order: 1, isDefault: 1, isClosed: 0, isCancelled: 0 },
        { name: 'In Progress', color: '#3b82f6', order: 2, isDefault: 0, isClosed: 0, isCancelled: 0 },
        { name: 'Done', color: '#10b981', order: 3, isDefault: 0, isClosed: 1, isCancelled: 0 },
      ];

      for (const status of defaultTaskStatuses) {
        await connection.execute(
          `INSERT INTO TaskStatusValues 
           (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault, IsClosed, IsCancelled) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [organizationId, status.name, status.color, status.order, status.isDefault, status.isClosed, status.isCancelled]
        );
      }

      // 7. Create default task priority values
      const defaultTaskPriorities = [
        { name: 'Low', color: '#6b7280', order: 1, isDefault: 0 },
        { name: 'Medium', color: '#3b82f6', order: 2, isDefault: 1 },
        { name: 'High', color: '#f59e0b', order: 3, isDefault: 0 },
        { name: 'Critical', color: '#ef4444', order: 4, isDefault: 0 },
      ];

      for (const priority of defaultTaskPriorities) {
        await connection.execute(
          `INSERT INTO TaskPriorityValues 
           (OrganizationId, PriorityName, ColorCode, SortOrder, IsDefault) 
           VALUES (?, ?, ?, ?, ?)`,
          [organizationId, priority.name, priority.color, priority.order, priority.isDefault]
        );
      }

      // 8. Set default system settings
      const defaultSettings = [
        ['allowPublicRegistration', 'false'],
        ['publicRegistrationType', 'internal'],
      ];

      for (const [key, value] of defaultSettings) {
        await connection.execute(
          `INSERT INTO SystemSettings (SettingKey, SettingValue) 
           VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE SettingValue = SettingValue`,
          [key, value]
        );
      }

      await connection.commit();

      // Log installation
      await logActivity(
        userId,
        username,
        'SYSTEM_INSTALL',
        'System',
        null,
        null,
        `Initial system setup completed. Admin: ${username}, Organization: ${organizationName}`,
        req.ip,
        req.get('user-agent')
      );

      // Generate JWT token for auto-login
      const token = jwt.sign(
        {
          userId,
          username,
          email,
          isAdmin: true,
          isSupport: true,
          isDeveloper: true,
          isManager: true,
          customerId: null,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        success: true,
        message: 'System installed successfully',
        token,
        user: {
          id: userId,
          username,
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          isAdmin: true,
          isSupport: true,
          isDeveloper: true,
          isManager: true,
          customerId: null,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete setup',
    });
  }
});

export default router;
