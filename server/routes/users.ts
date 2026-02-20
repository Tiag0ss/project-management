import { Router, Response } from 'express';
import { AuthRequest, authenticateToken, requireAdmin } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcrypt';
import { logActivity } from './activityLogs';
import { logUserHistory } from '../utils/changeLog';

const router = Router();
const SALT_ROUNDS = 10;

// Get current user profile (must come before /:id route)
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Username, Email, FirstName, LastName, IsActive, IsAdmin, 
              WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              LunchTime, LunchDuration,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              Timezone, HourlyRate, CreatedAt, UpdatedAt 
       FROM Users 
       WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch profile' 
    });
  }
});

// Update current user profile (must come before /:id route)
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { firstName, lastName, email, timezone } = req.body;

    // Validate email
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    // Check if email already exists for another user
    if (email) {
      const [duplicates] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Users WHERE Email = ? AND Id != ?',
        [email, userId]
      );

      if (duplicates.length > 0) {
        return res.status(409).json({ 
          success: false, 
          message: 'Email already in use' 
        });
      }
    }

    // Get old profile data for logging
    const [oldProfile] = await pool.execute<RowDataPacket[]>(
      'SELECT FirstName, LastName, Email, Timezone FROM Users WHERE Id = ?',
      [userId]
    );
    const oldData = oldProfile[0];

    await pool.execute(
      `UPDATE Users 
       SET FirstName = ?, LastName = ?, Email = ?, Timezone = ?
       WHERE Id = ?`,
      [firstName || null, lastName || null, email, timezone || null, userId]
    );

    // Log profile changes
    if (firstName !== oldData.FirstName) {
      await logUserHistory(userId!, userId!, 'updated', 'FirstName', oldData.FirstName || '', firstName || '');
    }
    if (lastName !== oldData.LastName) {
      await logUserHistory(userId!, userId!, 'updated', 'LastName', oldData.LastName || '', lastName || '');
    }
    if (email !== oldData.Email) {
      await logUserHistory(userId!, userId!, 'updated', 'Email', oldData.Email || '', email || '');
    }
    if (timezone !== oldData.Timezone) {
      await logUserHistory(userId!, userId!, 'updated', 'Timezone', oldData.Timezone || '', timezone || '');
    }

    // Log activity
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'USER_PROFILE_UPDATE',
      'User',
      userId!,
      req.user?.username || null,
      `Updated profile`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile' 
    });
  }
});

// Change password for current user (must come before /:id route)
router.put('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 6 characters' 
      });
    }

    // Get current password hash
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT PasswordHash FROM Users WHERE Id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[0].PasswordHash);
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await pool.execute(
      'UPDATE Users SET PasswordHash = ? WHERE Id = ?',
      [newPasswordHash, userId]
    );

    // Log password change
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'USER_PASSWORD_CHANGE',
      'User',
      userId ?? null,
      req.user?.username || null,
      'User changed their password',
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password' 
    });
  }
});

// Update work hours for current user (must come before /:id route)
router.put('/work-hours', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { workHours, workStartTimes, lunchTime, lunchDuration, hobbyHours, hobbyStartTimes } = req.body;

    // Build dynamic UPDATE query based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    // Work hours (from nested workHours object)
    if (workHours) {
      if (workHours.monday !== undefined) { updates.push('WorkHoursMonday = ?'); values.push(workHours.monday); }
      if (workHours.tuesday !== undefined) { updates.push('WorkHoursTuesday = ?'); values.push(workHours.tuesday); }
      if (workHours.wednesday !== undefined) { updates.push('WorkHoursWednesday = ?'); values.push(workHours.wednesday); }
      if (workHours.thursday !== undefined) { updates.push('WorkHoursThursday = ?'); values.push(workHours.thursday); }
      if (workHours.friday !== undefined) { updates.push('WorkHoursFriday = ?'); values.push(workHours.friday); }
      if (workHours.saturday !== undefined) { updates.push('WorkHoursSaturday = ?'); values.push(workHours.saturday); }
      if (workHours.sunday !== undefined) { updates.push('WorkHoursSunday = ?'); values.push(workHours.sunday); }
    }

    // Work start times (from nested workStartTimes object)
    if (workStartTimes) {
      if (workStartTimes.monday !== undefined) { updates.push('WorkStartMonday = ?'); values.push(workStartTimes.monday); }
      if (workStartTimes.tuesday !== undefined) { updates.push('WorkStartTuesday = ?'); values.push(workStartTimes.tuesday); }
      if (workStartTimes.wednesday !== undefined) { updates.push('WorkStartWednesday = ?'); values.push(workStartTimes.wednesday); }
      if (workStartTimes.thursday !== undefined) { updates.push('WorkStartThursday = ?'); values.push(workStartTimes.thursday); }
      if (workStartTimes.friday !== undefined) { updates.push('WorkStartFriday = ?'); values.push(workStartTimes.friday); }
      if (workStartTimes.saturday !== undefined) { updates.push('WorkStartSaturday = ?'); values.push(workStartTimes.saturday); }
      if (workStartTimes.sunday !== undefined) { updates.push('WorkStartSunday = ?'); values.push(workStartTimes.sunday); }
    }

    // Lunch settings
    if (lunchTime !== undefined) { updates.push('LunchTime = ?'); values.push(lunchTime); }
    if (lunchDuration !== undefined) { updates.push('LunchDuration = ?'); values.push(lunchDuration); }

    // Hobby start times (from nested hobbyStartTimes object)
    if (hobbyStartTimes) {
      if (hobbyStartTimes.monday !== undefined) { updates.push('HobbyStartMonday = ?'); values.push(hobbyStartTimes.monday); }
      if (hobbyStartTimes.tuesday !== undefined) { updates.push('HobbyStartTuesday = ?'); values.push(hobbyStartTimes.tuesday); }
      if (hobbyStartTimes.wednesday !== undefined) { updates.push('HobbyStartWednesday = ?'); values.push(hobbyStartTimes.wednesday); }
      if (hobbyStartTimes.thursday !== undefined) { updates.push('HobbyStartThursday = ?'); values.push(hobbyStartTimes.thursday); }
      if (hobbyStartTimes.friday !== undefined) { updates.push('HobbyStartFriday = ?'); values.push(hobbyStartTimes.friday); }
      if (hobbyStartTimes.saturday !== undefined) { updates.push('HobbyStartSaturday = ?'); values.push(hobbyStartTimes.saturday); }
      if (hobbyStartTimes.sunday !== undefined) { updates.push('HobbyStartSunday = ?'); values.push(hobbyStartTimes.sunday); }
    }

    // Hobby hours (from nested hobbyHours object)
    if (hobbyHours) {
      if (hobbyHours.monday !== undefined) { updates.push('HobbyHoursMonday = ?'); values.push(hobbyHours.monday); }
      if (hobbyHours.tuesday !== undefined) { updates.push('HobbyHoursTuesday = ?'); values.push(hobbyHours.tuesday); }
      if (hobbyHours.wednesday !== undefined) { updates.push('HobbyHoursWednesday = ?'); values.push(hobbyHours.wednesday); }
      if (hobbyHours.thursday !== undefined) { updates.push('HobbyHoursThursday = ?'); values.push(hobbyHours.thursday); }
      if (hobbyHours.friday !== undefined) { updates.push('HobbyHoursFriday = ?'); values.push(hobbyHours.friday); }
      if (hobbyHours.saturday !== undefined) { updates.push('HobbyHoursSaturday = ?'); values.push(hobbyHours.saturday); }
      if (hobbyHours.sunday !== undefined) { updates.push('HobbyHoursSunday = ?'); values.push(hobbyHours.sunday); }
    }

    if (updates.length > 0) {
      values.push(userId);
      await pool.execute(
        `UPDATE Users SET ${updates.join(', ')} WHERE Id = ?`,
        values
      );

      // Log work hours update
      await logUserHistory(
        userId!,
        userId!,
        'updated',
        'WorkHours',
        'Work hours changed',
        JSON.stringify(req.body)
      );

      // Log activity
      await logActivity(
        userId ?? null,
        req.user?.username || null,
        'USER_WORKHOURS_UPDATE',
        'User',
        userId!,
        req.user?.username || null,
        `Updated work hours`,
        req.ip,
        req.get('user-agent')
      );
    }

    res.json({
      success: true,
      message: 'Work hours updated successfully'
    });
  } catch (error) {
    console.error('Update work hours error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update work hours' 
    });
  }
});

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id, u.Username, u.Email, u.FirstName, u.LastName, u.IsActive, u.IsAdmin, 
              u.CustomerId, c.Name as CustomerName, u.IsDeveloper, u.IsSupport, u.IsManager,
              u.TeamLeaderId, CONCAT(tl.FirstName, ' ', tl.LastName) as TeamLeaderName,
              u.CreatedAt, u.UpdatedAt 
       FROM Users u
       LEFT JOIN Customers c ON u.CustomerId = c.Id
       LEFT JOIN Users tl ON u.TeamLeaderId = tl.Id
       ORDER BY u.CreatedAt DESC`
    );

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { username, email, firstName, lastName, isActive, isAdmin, customerId, isDeveloper, isSupport, isManager, hourlyRate, teamLeaderId } = req.body;

    // Check if user exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Users WHERE Id = ?',
      [userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const oldUser = existing[0];

    // Check if username or email already exists for another user
    const [duplicates] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE (Username = ? OR Email = ?) AND Id != ?',
      [username, email, userId]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }

    // Normalize empty values for comparison
    const normalizeValue = (value: any): string => {
      return value === null || value === undefined || value === '' ? '' : String(value);
    };

    // Track changes
    const changes: { field: string; oldVal: any; newVal: any }[] = [];
    
    if (username !== undefined && username !== oldUser.Username) {
      changes.push({ field: 'Username', oldVal: oldUser.Username, newVal: username });
    }
    if (email !== undefined && email !== oldUser.Email) {
      changes.push({ field: 'Email', oldVal: oldUser.Email, newVal: email });
    }
    
    const oldFirstName = normalizeValue(oldUser.FirstName);
    const newFirstName = normalizeValue(firstName);
    if (firstName !== undefined && oldFirstName !== newFirstName) {
      changes.push({ field: 'FirstName', oldVal: oldFirstName, newVal: newFirstName });
    }
    
    const oldLastName = normalizeValue(oldUser.LastName);
    const newLastName = normalizeValue(lastName);
    if (lastName !== undefined && oldLastName !== newLastName) {
      changes.push({ field: 'LastName', oldVal: oldLastName, newVal: newLastName });
    }
    
    if (isActive !== undefined && isActive !== Boolean(oldUser.IsActive)) {
      changes.push({ field: 'IsActive', oldVal: String(oldUser.IsActive), newVal: String(isActive) });
    }
    if (isAdmin !== undefined && isAdmin !== Boolean(oldUser.IsAdmin)) {
      changes.push({ field: 'IsAdmin', oldVal: String(oldUser.IsAdmin), newVal: String(isAdmin) });
    }
    if (isDeveloper !== undefined && isDeveloper !== Boolean(oldUser.IsDeveloper)) {
      changes.push({ field: 'IsDeveloper', oldVal: String(oldUser.IsDeveloper), newVal: String(isDeveloper) });
    }
    if (isSupport !== undefined && isSupport !== Boolean(oldUser.IsSupport)) {
      changes.push({ field: 'IsSupport', oldVal: String(oldUser.IsSupport), newVal: String(isSupport) });
    }
    if (isManager !== undefined && isManager !== Boolean(oldUser.IsManager)) {
      changes.push({ field: 'IsManager', oldVal: String(oldUser.IsManager), newVal: String(isManager) });
    }
    if (customerId !== undefined && customerId !== oldUser.CustomerId) {
      changes.push({ field: 'CustomerId', oldVal: String(oldUser.CustomerId || ''), newVal: String(customerId || '') });
    }
    if (hourlyRate !== undefined && String(hourlyRate || '') !== String(oldUser.HourlyRate || '')) {
      changes.push({ field: 'HourlyRate', oldVal: String(oldUser.HourlyRate || ''), newVal: String(hourlyRate || '') });
    }
    if (teamLeaderId !== undefined && String(teamLeaderId || '') !== String(oldUser.TeamLeaderId || '')) {
      changes.push({ field: 'TeamLeaderId', oldVal: String(oldUser.TeamLeaderId || ''), newVal: String(teamLeaderId || '') });
    }

    await pool.execute(
      `UPDATE Users 
       SET Username = ?, Email = ?, FirstName = ?, LastName = ?, IsActive = ?, IsAdmin = ?, CustomerId = ?, IsDeveloper = ?, IsSupport = ?, IsManager = ?, HourlyRate = ?, TeamLeaderId = ? 
       WHERE Id = ?`,
      [username, email, firstName || null, lastName || null, isActive, isAdmin, customerId || null, isDeveloper || false, isSupport || false, isManager || false, hourlyRate != null ? parseFloat(hourlyRate) || null : null, teamLeaderId || null, userId]
    );
    
    // Log changes to history
    for (const change of changes) {
      await logUserHistory(
        Number(userId),
        req.user!.userId!,
        'updated',
        change.field,
        String(change.oldVal || ''),
        String(change.newVal || '')
      );
    }

    // Log user update
    await logActivity(
      req.user?.userId ?? null,
      req.user?.username || null,
      'USER_UPDATE',
      'User',
      Number(userId),
      username,
      `Updated user: ${username}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user' 
    });
  }
});

// Reset user password (admin only)
router.put('/:id/password', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Get target user info
    const [targetUser] = await pool.execute<RowDataPacket[]>(
      'SELECT Username FROM Users WHERE Id = ?',
      [userId]
    );
    const username = targetUser.length > 0 ? targetUser[0].Username : 'Unknown';

    await pool.execute(
      'UPDATE Users SET PasswordHash = ? WHERE Id = ?',
      [passwordHash, userId]
    );

    // Log password reset
    await logUserHistory(
      Number(userId),
      req.user!.userId!,
      'updated',
      'Password',
      'Password reset by admin',
      null
    );

    // Log activity
    await logActivity(
      req.user?.userId ?? null,
      req.user?.username || null,
      'USER_PASSWORD_RESET',
      'User',
      Number(userId),
      username,
      `Reset password for user: ${username}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user?.userId;

    // Prevent admin from deleting themselves
    if (userId === currentUserId?.toString()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete your own account' 
      });
    }

    // Get username before deletion
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT Username FROM Users WHERE Id = ?',
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const username = user[0].Username;

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM Users WHERE Id = ?',
      [userId]
    );

    // Log user deletion
    await logActivity(
      currentUserId ?? null,
      req.user?.username || null,
      'USER_DELETE',
      'User',
      Number(userId),
      username,
      `Deleted user: ${username}`,
      req.ip,
      req.get('user-agent')
    );

    // Log to detailed history
    await logUserHistory(
      Number(userId),
      currentUserId!,
      'deleted',
      null,
      username,
      null
    );

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user' 
    });
  }
});

// Create user (admin only)
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, firstName, lastName, isActive, isAdmin, customerId, isDeveloper, isSupport, isManager, teamLeaderId } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Check if username or email already exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE Username = ? OR Email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Users (Username, Email, PasswordHash, FirstName, LastName, IsActive, IsAdmin, CustomerId, IsDeveloper, IsSupport, IsManager, TeamLeaderId) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, passwordHash, firstName || null, lastName || null, isActive !== false, isAdmin || false, customerId || null, isDeveloper !== false, isSupport || false, isManager || false, teamLeaderId || null]
    );

    // Log user creation
    await logActivity(
      req.user?.userId ?? null,
      req.user?.username || null,
      'USER_CREATE',
      'User',
      result.insertId,
      username,
      `Created user: ${username} (${email})`,
      req.ip,
      req.get('user-agent')
    );
    
    // Log to history
    await logUserHistory(
      result.insertId,
      req.user!.userId!,
      'created',
      null,
      null,
      null
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user' 
    });
  }
});

// Get user details with KPIs (admin only)
router.get('/:id/details', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    // Get user info
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id, u.Username, u.Email, u.FirstName, u.LastName, u.IsActive, u.IsAdmin, 
              u.CustomerId, c.Name as CustomerName, u.IsDeveloper, u.IsSupport, u.IsManager, u.CreatedAt, u.UpdatedAt,
              u.WorkHoursMonday, u.WorkHoursTuesday, u.WorkHoursWednesday, u.WorkHoursThursday,
              u.WorkHoursFriday, u.WorkHoursSaturday, u.WorkHoursSunday
       FROM Users u
       LEFT JOIN Customers c ON u.CustomerId = c.Id
       WHERE u.Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    // Get organization memberships
    const [memberships] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Id, om.OrganizationId, o.Name as OrganizationName, om.Role, 
              om.PermissionGroupId, pg.GroupName as PermissionGroupName, om.JoinedAt
       FROM OrganizationMembers om
       JOIN Organizations o ON om.OrganizationId = o.Id
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.UserId = ?
       ORDER BY o.Name`,
      [userId]
    );

    // Get KPIs - Total time entries this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [timeThisMonth] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(Hours), 0) as TotalHours, COUNT(*) as EntryCount
       FROM TimeEntries 
       WHERE UserId = ? AND WorkDate >= ? AND WorkDate <= ?`,
      [userId, firstDayOfMonth, lastDayOfMonth]
    );

    // Get KPIs - Total time entries all time
    const [timeAllTime] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(Hours), 0) as TotalHours, COUNT(*) as EntryCount
       FROM TimeEntries WHERE UserId = ?`,
      [userId]
    );

    // Get KPIs - Tasks assigned
    const [tasksAssigned] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as Total,
              SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END) as Completed,
              SUM(CASE WHEN tsv.IsClosed = 0 AND tsv.IsCancelled = 0 AND t.Status IS NOT NULL THEN 1 ELSE 0 END) as InProgress,
              SUM(CASE WHEN t.Status IS NULL THEN 1 ELSE 0 END) as Other
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.AssignedTo = ?`,
      [userId]
    );

    // Get KPIs - Task allocations
    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(AllocatedHours), 0) as TotalAllocated,
              COUNT(DISTINCT TaskId) as TaskCount,
              COUNT(DISTINCT AllocationDate) as DayCount
       FROM TaskAllocations WHERE UserId = ?`,
      [userId]
    );

    // Get KPIs - Tickets (if user is associated with a customer or created tickets)
    const [tickets] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as Total,
              SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) as Open,
              SUM(CASE WHEN Status = 'Resolved' OR Status = 'Closed' THEN 1 ELSE 0 END) as Resolved
       FROM Tickets WHERE CreatedByUserId = ?`,
      [userId]
    );

    // Get recent activity (last 10 time entries)
    const [recentTimeEntries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.Hours, te.WorkDate, te.Description, t.TaskName, p.ProjectName
       FROM TimeEntries te
       JOIN Tasks t ON te.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       WHERE te.UserId = ?
       ORDER BY te.WorkDate DESC, te.Id DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      user,
      memberships,
      kpis: {
        timeThisMonth: {
          hours: parseFloat(timeThisMonth[0].TotalHours) || 0,
          entries: parseInt(timeThisMonth[0].EntryCount) || 0
        },
        timeAllTime: {
          hours: parseFloat(timeAllTime[0].TotalHours) || 0,
          entries: parseInt(timeAllTime[0].EntryCount) || 0
        },
        tasks: {
          total: parseInt(tasksAssigned[0].Total) || 0,
          completed: parseInt(tasksAssigned[0].Completed) || 0,
          inProgress: parseInt(tasksAssigned[0].InProgress) || 0,
          other: parseInt(tasksAssigned[0].Other) || 0
        },
        allocations: {
          totalHours: parseFloat(allocations[0].TotalAllocated) || 0,
          taskCount: parseInt(allocations[0].TaskCount) || 0,
          dayCount: parseInt(allocations[0].DayCount) || 0
        },
        tickets: {
          total: parseInt(tickets[0].Total) || 0,
          open: parseInt(tickets[0].Open) || 0,
          resolved: parseInt(tickets[0].Resolved) || 0
        }
      },
      recentActivity: recentTimeEntries
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user details' });
  }
});

// Get user's organization memberships
router.get('/:id/memberships', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    const [memberships] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Id, om.OrganizationId, o.Name as OrganizationName, om.Role, 
              om.PermissionGroupId, pg.GroupName as PermissionGroupName, om.JoinedAt
       FROM OrganizationMembers om
       JOIN Organizations o ON om.OrganizationId = o.Id
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.UserId = ?
       ORDER BY o.Name`,
      [userId]
    );

    res.json({ success: true, memberships });
  } catch (error) {
    console.error('Get memberships error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch memberships' });
  }
});

// Add user to organization
router.post('/:id/memberships', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { organizationId, role, permissionGroupId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization is required' });
    }

    // Check if already a member
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'User is already a member of this organization' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationMembers (OrganizationId, UserId, Role, PermissionGroupId) VALUES (?, ?, ?, ?)`,
      [organizationId, userId, role || 'Member', permissionGroupId || null]
    );

    res.status(201).json({ success: true, message: 'Membership added', membershipId: result.insertId });
  } catch (error) {
    console.error('Add membership error:', error);
    res.status(500).json({ success: false, message: 'Failed to add membership' });
  }
});

// Update user's organization membership
router.put('/:id/memberships/:membershipId', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { membershipId } = req.params;
    const { role, permissionGroupId } = req.body;

    await pool.execute(
      `UPDATE OrganizationMembers SET Role = ?, PermissionGroupId = ? WHERE Id = ?`,
      [role || 'Member', permissionGroupId || null, membershipId]
    );

    res.json({ success: true, message: 'Membership updated' });
  } catch (error) {
    console.error('Update membership error:', error);
    res.status(500).json({ success: false, message: 'Failed to update membership' });
  }
});

// Remove user from organization
router.delete('/:id/memberships/:membershipId', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { membershipId } = req.params;

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM OrganizationMembers WHERE Id = ?',
      [membershipId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Membership not found' });
    }

    res.json({ success: true, message: 'Membership removed' });
  } catch (error) {
    console.error('Remove membership error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove membership' });
  }
});

// Get all attachments uploaded by a user
router.get('/:id/attachments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const isAdmin = req.user?.isAdmin;

    // Only allow viewing own attachments or if admin
    const userIdParam = Array.isArray(id) ? id[0] : id;
    if (!isAdmin && parseInt(userIdParam) !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get all attachments uploaded by this user
    const [taskAttachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 'Task' as Type, ta.Id, ta.FileName, ta.FileType, ta.FileSize, ta.CreatedAt,
              t.TaskName as EntityName, p.ProjectName as ProjectName
       FROM TaskAttachments ta
       JOIN Tasks t ON ta.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UploadedByUserId = ?`,
      [userIdParam]
    );

    const [ticketAttachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 'Ticket' as Type, ta.Id, ta.FileName, ta.FileType, ta.FileSize, ta.CreatedAt,
              t.TicketNumber as EntityName, t.Title as ProjectName
       FROM TicketAttachments ta
       JOIN Tickets t ON ta.TicketId = t.Id
       WHERE ta.UploadedByUserId = ?`,
      [userIdParam]
    );

    const [projectAttachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 'Project' as Type, pa.Id, pa.FileName, pa.FileType, pa.FileSize, pa.CreatedAt,
              p.ProjectName as EntityName, '' as ProjectName
       FROM ProjectAttachments pa
       JOIN Projects p ON pa.ProjectId = p.Id
       WHERE pa.UploadedByUserId = ?`,
      [userIdParam]
    );

    const [customerAttachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 'Customer' as Type, ca.Id, ca.FileName, ca.FileType, ca.FileSize, ca.CreatedAt,
              c.Name as EntityName, '' as ProjectName
       FROM CustomerAttachments ca
       JOIN Customers c ON ca.CustomerId = c.Id
       WHERE ca.UploadedByUserId = ?`,
      [userIdParam]
    );

    const [organizationAttachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 'Organization' as Type, oa.Id, oa.FileName, oa.FileType, oa.FileSize, oa.CreatedAt,
              o.Name as EntityName, '' as ProjectName
       FROM OrganizationAttachments oa
       JOIN Organizations o ON oa.OrganizationId = o.Id
       WHERE oa.UploadedByUserId = ?`,
      [userIdParam]
    );

    // Combine all attachments and sort by date
    const allAttachments = [
      ...taskAttachments,
      ...ticketAttachments,
      ...projectAttachments,
      ...customerAttachments,
      ...organizationAttachments
    ].sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());

    res.json({ success: true, attachments: allAttachments });
  } catch (error) {
    console.error('Get user attachments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachments' });
  }
});

export default router;

