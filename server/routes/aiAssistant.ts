import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import { decrypt } from '../utils/encryption';

const router = express.Router();

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface CombinedPermissions {
  canViewReports: boolean;
  canViewBudgetInfo: boolean;
  canViewOthersPlanning: boolean;
}

interface DailyScheduleTask {
  taskName: string;
  projectName: string;
  hours: number;
  source: 'direct' | 'child';
}

interface DailyScheduleBucket {
  date: string;
  directHours: number;
  childHours: number;
  totalHours: number;
  tasks: DailyScheduleTask[];
}

const normalizeDateOnly = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSearchText = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const includesAny = (value: string, terms: string[]): boolean =>
  terms.some((term) => value.includes(term));

const escapeRegex = (value: string): string =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsPhrase = (haystack: string, phrase: string): boolean => {
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedPhrase = normalizeSearchText(phrase).trim();
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedPhrase)}(\\s|$)`);
  return pattern.test(normalizedHaystack) || normalizedHaystack.includes(normalizedPhrase);
};

const normalizeDbDate = (value: any): string => {
  if (!value) return '';
  if (value instanceof Date) return normalizeDateOnly(value);
  return String(value).split('T')[0];
};

const executeAiViewQuery = async (viewName: string, sql: string, params: any[]): Promise<RowDataPacket[]> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    return rows;
  } catch (error: any) {
    const message = String(error?.message || error?.sqlMessage || '').toLowerCase();
    const missingView =
      message.includes("doesn't exist")
      || message.includes('invalid object name')
      || message.includes('unknown table')
      || message.includes('unknown object');

    if (missingView) {
      throw new Error(`Required AI view '${viewName}' is missing. Please sync AI views in System Settings.`);
    }

    throw error;
  }
};

const buildRolePermissions = async (userId: number): Promise<CombinedPermissions> => {
  const [users] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );

  if (!users.length) {
    return { canViewReports: false, canViewBudgetInfo: false, canViewOthersPlanning: false };
  }

  const user = users[0];

  if (Number(user.isAdmin || 0) === 1) {
    return { canViewReports: true, canViewBudgetInfo: true, canViewOthersPlanning: true };
  }

  const roles: string[] = [];
  if (Number(user.IsDeveloper || 0) === 1) roles.push('Developer');
  if (Number(user.IsSupport || 0) === 1) roles.push('Support');
  if (Number(user.IsManager || 0) === 1) roles.push('Manager');

  let canViewReports = false;
  let canViewBudgetInfo = false;
  let canViewOthersPlanning = false;

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT CanViewReports, CanViewBudgetInfo, CanViewOthersPlanning FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );

    rolePerms.forEach((perm: any) => {
      if (Number(perm.CanViewReports || 0) === 1) canViewReports = true;
      if (Number(perm.CanViewBudgetInfo || 0) === 1) canViewBudgetInfo = true;
      if (Number(perm.CanViewOthersPlanning || 0) === 1) canViewOthersPlanning = true;
    });
  }

  const [orgGroupPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanViewBudgetInfo
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ?`,
    [userId]
  );

  orgGroupPerms.forEach((perm: any) => {
    if (Number(perm.CanViewBudgetInfo || 0) === 1) canViewBudgetInfo = true;
  });

  return { canViewReports, canViewBudgetInfo, canViewOthersPlanning };
};

const getUserOrganizationIds = async (userId: number): Promise<number[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT DISTINCT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
    [userId]
  );

  return rows
    .map((row: any) => Number(row.OrganizationId))
    .filter((id: number) => Number.isFinite(id) && id > 0);
};

const getGlobalAssistantConfig = async () => {
  const [globalSettingsRows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?)',
    ['aiAssistantEnabled', 'openAIApiKey']
  );

  const settingsMap: Record<string, string> = {};
  globalSettingsRows.forEach((row: any) => {
    settingsMap[String(row.SettingKey)] = String(row.SettingValue || '');
  });

  const aiAssistantEnabled = settingsMap.aiAssistantEnabled === 'true';
  const encryptedApiKey = String(settingsMap.openAIApiKey || '').trim();
  const openAiApiKey = encryptedApiKey ? decrypt(encryptedApiKey).trim() : '';

  return {
    aiAssistantEnabled,
    isConfigured: !!openAiApiKey,
    openAiApiKey,
  };
};

const buildFallbackAnswer = (question: string, context: any): string => {
  const lowerQuestion = normalizeSearchText(question);
  const projects = context.projects || {};
  const tasks = context.tasks || {};
  const timeEntries = context.timeEntries || {};
  const planning = context.planning || {};
  const projectDetails = context.projectDetails || {};
  const myTasks = context.myTasks || {};
  const customers = context.customers || {};
  const integrations = context.integrations || {};
  const accessControl = context.accessControl || {};
  const team = context.team || {};
  const projectTaskInsights = Array.isArray(context.projectTaskInsights) ? context.projectTaskInsights : [];

  const accessibleUsers = Array.isArray(team.accessibleUsers) ? team.accessibleUsers : [];
  const userOpenTasksByUser = team.userOpenTasksByUser || {};
  const mentionedUser = accessibleUsers.find((user: any) => {
    const fullName = String(user.fullName || '').trim();
    const username = String(user.username || '').trim();
    return (fullName.length >= 3 && containsPhrase(lowerQuestion, fullName))
      || (username.length >= 3 && containsPhrase(lowerQuestion, username));
  });

  if (mentionedUser) {
    const userWorkload = Array.isArray(team.userWorkload) ? team.userWorkload : [];
    const workload = userWorkload.find((entry: any) => Number(entry.userId) === Number(mentionedUser.userId));
    const openTaskRows = Array.isArray(userOpenTasksByUser[String(mentionedUser.userId)])
      ? userOpenTasksByUser[String(mentionedUser.userId)]
      : [];
    const taskLines = openTaskRows
      .slice(0, 12)
      .map((task: any) => `- ${task.taskName} [${task.projectName}] (${task.statusName}) | upcoming week: ${task.upcomingWeekHours}h${task.dueDate ? ` | due: ${task.dueDate}` : ''}`);

    return [
      `${mentionedUser.fullName || mentionedUser.username}: ${workload?.openTasks || 0} open task(s), ${workload?.doneTasks || 0} done, ${workload?.plannedHoursThisWeek || 0}h planned this week.`,
      taskLines.length ? 'Open tasks:' : '',
      ...taskLines,
      openTaskRows.length > 12 ? `- ...and ${openTaskRows.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  const mentionedProject = projectTaskInsights.find((project: any) => {
    const normalizedProjectName = normalizeSearchText(String(project.projectName || ''));
    return normalizedProjectName.length >= 3 && lowerQuestion.includes(normalizedProjectName);
  });

  if (mentionedProject) {
    const taskRows = Array.isArray(mentionedProject.openTasks) ? mentionedProject.openTasks : [];
    const taskLines = taskRows
      .slice(0, 12)
      .map((task: any) => {
        const assignee = task.assignedToName ? ` | assignee: ${task.assignedToName}` : '';
        const dueDate = task.dueDate ? ` | due: ${task.dueDate}` : '';
        return `- ${task.taskName} (${task.statusName}) | planned upcoming week: ${task.upcomingWeekHours}h${dueDate}${assignee}`;
      });

    return [
      `${mentionedProject.projectName}: ${mentionedProject.openTaskCount} open task(s), ${mentionedProject.upcomingWeekPlannedHours}h planned for the upcoming week.`,
      ...taskLines,
      taskRows.length > 12 ? `- ...and ${taskRows.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['other users', 'other user', 'outros utilizadores', 'outro utilizador', 'team', 'equipa', 'utilizadores', 'users'])) {
    if (!accessControl.canViewOtherUsers) {
      return 'You can only view your own data. Other-user details are restricted to admin/manager access.';
    }

    const accessibleUsers = Array.isArray(team.accessibleUsers) ? team.accessibleUsers : [];
    const userWorkload = Array.isArray(team.userWorkload) ? team.userWorkload : [];

    if (!accessibleUsers.length) {
      return 'No accessible users were found in your current organization scope.';
    }

    const lines = userWorkload
      .slice(0, 12)
      .map((user: any) => `- ${user.fullName || user.username}: ${user.openTasks} open, ${user.doneTasks} done, ${user.plannedHoursThisWeek}h planned this week`);

    return [
      `You are ${accessControl.displayName || 'the current user'} (${accessControl.roleLabel || 'user'}).`,
      `Accessible users: ${team.accessibleUserCount || accessibleUsers.length}.`,
      ...lines,
      userWorkload.length > 12 ? `- ...and ${userWorkload.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['allocation', 'allocations', 'allocated', 'alocacao', 'alocacoes', 'alocado', 'planeado por utilizador', 'planned by user'])) {
    if (!accessControl.canViewOtherUsers) {
      return 'You can only view your own allocation data. Other-user allocations are restricted by permissions.';
    }

    const userWorkload = Array.isArray(team.userWorkload) ? team.userWorkload : [];
    if (!userWorkload.length) {
      return 'No user allocation data is available in your organization scope.';
    }

    const lines = userWorkload
      .slice(0, 15)
      .map((entry: any) => `- ${entry.fullName || entry.username}: ${entry.plannedHoursThisWeek || 0}h planned this week`);

    return [
      'Allocations by user (current week):',
      ...lines,
      userWorkload.length > 15 ? `- ...and ${userWorkload.length - 15} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['open projects', 'active projects', 'project names', 'projetos', 'projeto'])) {
    const openProjects = Array.isArray(projectDetails.openProjects) ? projectDetails.openProjects : [];
    if (!openProjects.length) {
      return 'No open projects found in your accessible organizations.';
    }

    const lines = openProjects
      .slice(0, 12)
      .map((project: any) => `- ${project.projectName} (${project.statusName})`);

    return [
      `Open projects (${projectDetails.openProjectCount || openProjects.length}):`,
      ...lines,
      openProjects.length > 12 ? `- ...and ${openProjects.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['my tasks', 'tarefas', 'to do', 'todo', 'pending', 'por fazer', 'done', 'completed', 'feitas', 'concluidas'])) {
    const openTasks = Array.isArray(myTasks.open) ? myTasks.open : [];
    const doneTasks = Array.isArray(myTasks.done) ? myTasks.done : [];

    const openPreview = openTasks.slice(0, 8).map((task: any) => `- ${task.taskName} [${task.projectName}]`);
    const donePreview = doneTasks.slice(0, 5).map((task: any) => `- ${task.taskName} [${task.projectName}]`);

    return [
      `Your tasks: ${myTasks.openCount || openTasks.length} open, ${myTasks.doneCount || doneTasks.length} done.`,
      openPreview.length ? 'Open (sample):' : '',
      ...openPreview,
      donePreview.length ? 'Done (sample):' : '',
      ...donePreview,
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['customer', 'customers', 'cliente', 'clientes'])) {
    const customerRows = Array.isArray(customers.summary) ? customers.summary : [];
    if (!customerRows.length) {
      return 'No customer records found in your accessible organizations.';
    }

    const lines = customerRows
      .slice(0, 12)
      .map((customer: any) => `- ${customer.name}: ${customer.isActive ? 'active' : 'inactive'}, ${customer.openProjects} open project(s), ${customer.openTasks} open task(s)`);

    return [
      `Customer status (${customers.totalCustomers || customerRows.length}):`,
      ...lines,
      customerRows.length > 12 ? `- ...and ${customerRows.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (includesAny(lowerQuestion, ['jira', 'ticket linked', 'tickets associados', 'associated tickets', 'external issue'])) {
    const jiraTasks = Array.isArray(integrations.jiraLinkedTasks) ? integrations.jiraLinkedTasks : [];
    if (!jiraTasks.length) {
      return 'No Jira-linked tasks were found in your accessible organizations.';
    }

    const lines = jiraTasks
      .slice(0, 12)
      .map((task: any) => `- ${task.projectName} / ${task.taskName} (${task.reference})`);

    return [
      `Tasks with Jira/ticket linkage (${integrations.jiraLinkedCount || jiraTasks.length}):`,
      ...lines,
      jiraTasks.length > 12 ? `- ...and ${jiraTasks.length - 12} more` : '',
    ].filter(Boolean).join('\n');
  }

  if (lowerQuestion.includes('overdue') || lowerQuestion.includes('atras')) {
    return `You currently have ${tasks.overdueTasks} overdue open task(s). Open tasks total ${tasks.openTasks}.`;
  }

  if (lowerQuestion.includes('unscheduled') || lowerQuestion.includes('not planned')) {
    return `You currently have ${tasks.unscheduledOpenTasks} unscheduled open task(s).`;
  }

  if (lowerQuestion.includes('hours') || lowerQuestion.includes('time') || lowerQuestion.includes('timesheet')) {
    return `In the last 30 days, logged hours are ${timeEntries.totalHours30d}.`;
  }

  if (lowerQuestion.includes('week') || lowerQuestion.includes('planning') || lowerQuestion.includes('schedule')) {
    const dailySchedule = Array.isArray(planning.dailySchedule) ? planning.dailySchedule : [];

    const exactDateMatch = lowerQuestion.match(/(\d{4}-\d{2}-\d{2})/);
    const dayOnlyMatch = lowerQuestion.match(/\bday\s+(\d{1,2})\b|\bdia\s+(\d{1,2})\b/);

    let requestedDate = '';
    if (exactDateMatch?.[1]) {
      requestedDate = exactDateMatch[1];
    } else if (dayOnlyMatch) {
      const dayRaw = dayOnlyMatch[1] || dayOnlyMatch[2] || '';
      const dayNum = Number(dayRaw);
      if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
        const year = Number(String(planning.weekStart || '').slice(0, 4)) || new Date().getFullYear();
        const month = Number(String(planning.weekStart || '').slice(5, 7)) || (new Date().getMonth() + 1);
        requestedDate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }

    if (requestedDate && dailySchedule.length > 0) {
      const foundDay = dailySchedule.find((day: any) => String(day.date) === requestedDate);
      if (foundDay) {
        const taskLines = Array.isArray(foundDay.tasks)
          ? foundDay.tasks.slice(0, 8).map((task: any) => `- ${task.taskName} [${task.projectName}] (${task.hours}h)`)
          : [];

        return [
          `Planned tasks for ${requestedDate}:`,
          `- Total: ${foundDay.totalHours || 0}h (direct ${foundDay.directHours || 0}h, child ${foundDay.childHours || 0}h)`,
          ...taskLines,
        ].join('\n');
      }
    }

    if (dailySchedule.length > 0) {
      const dayLines = dailySchedule.slice(0, 7).map((day: any) => {
        const topTasks = Array.isArray(day.tasks)
          ? day.tasks.slice(0, 3).map((task: any) => `${task.taskName} (${task.hours}h)`).join(', ')
          : '';
        return `- ${day.date}: ${day.totalHours}h${topTasks ? ` -> ${topTasks}` : ''}`;
      });

      return [
        `This week detailed schedule (${planning.weekStart} to ${planning.weekEnd}):`,
        ...dayLines,
        `- Total planned hours: ${planning.totalHoursThisWeek || 0}h`,
      ].join('\n');
    }

    return [
      `This week planning summary:`,
      `- Direct planned hours: ${planning.directHoursThisWeek || 0}h`,
      `- Child planned hours: ${planning.childHoursThisWeek || 0}h`,
      `- Total planned hours: ${planning.totalHoursThisWeek || 0}h`,
      `- Days with plan: ${planning.daysWithAllocations || 0}`,
    ].join('\n');
  }

  return [
    `Here is your current summary:`,
    `- Projects: ${projects.totalProjects} total, ${projects.activeProjects} active`,
    `- Tasks: ${tasks.totalTasks} total, ${tasks.openTasks} open, ${tasks.overdueTasks} overdue, ${tasks.unscheduledOpenTasks} unscheduled`,
    `- Time entries (last 30 days): ${timeEntries.totalHours30d}h`,
  ].join('\n');
};

router.get('/availability', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const permissions = await buildRolePermissions(userId);
    const config = await getGlobalAssistantConfig();

    return res.json({
      success: true,
      available: config.aiAssistantEnabled && config.isConfigured && permissions.canViewReports,
      enabled: config.aiAssistantEnabled,
      configured: config.isConfigured,
      canViewReports: permissions.canViewReports,
    });
  } catch (error) {
    console.error('AI assistant availability error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check assistant availability' });
  }
});

router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username || 'User';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const rawMessage = String(req.body?.message || '').trim();
    const historyInput = Array.isArray(req.body?.history) ? req.body.history : [];
    const normalizedMessage = normalizeSearchText(rawMessage);

    if (!rawMessage) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    if (rawMessage.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message is too long (max 2000 chars)' });
    }

    const config = await getGlobalAssistantConfig();
    if (!config.aiAssistantEnabled) {
      return res.status(403).json({ success: false, message: 'AI assistant is disabled by system settings.' });
    }

    if (!config.isConfigured) {
      return res.status(400).json({ success: false, message: 'OpenAI API key is not configured in system settings.' });
    }

    const openAiApiKey = config.openAiApiKey;
    if (!openAiApiKey) {
      return res.status(400).json({ success: false, message: 'OpenAI API key is invalid or empty in system settings.' });
    }

    const permissions = await buildRolePermissions(userId);
    if (!permissions.canViewReports) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to use analytics assistant data.'
      });
    }

    const organizationIds = await getUserOrganizationIds(userId);
    if (organizationIds.length === 0) {
      return res.status(403).json({ success: false, message: 'No organization access found for this user.' });
    }

    const placeholders = organizationIds.map(() => '?').join(',');

    const [requesterRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Username, FirstName, LastName, isAdmin, IsManager FROM Users WHERE Id = ?',
      [userId]
    );
    const requester = requesterRows[0] || {};
    const isAdminUser = Number((requester as any).isAdmin || 0) === 1;
    const isManagerUser = Number((requester as any).IsManager || 0) === 1;
    const canViewOtherUsers = isAdminUser || isManagerUser || permissions.canViewOthersPlanning;
    const requesterDisplayName = `${String((requester as any).FirstName || '').trim()} ${String((requester as any).LastName || '').trim()}`.trim() || String((requester as any).Username || username || 'User');

    const today = normalizeDateOnly(new Date());
    const date30d = new Date();
    date30d.setDate(date30d.getDate() - 30);
    const date30dStr = normalizeDateOnly(date30d);
    const currentDate = new Date();
    const weekStart = new Date(currentDate);
    weekStart.setDate(currentDate.getDate() - currentDate.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = normalizeDateOnly(weekStart);
    const weekEndStr = normalizeDateOnly(weekEnd);
    const upcomingWeekStart = new Date(currentDate);
    upcomingWeekStart.setHours(0, 0, 0, 0);
    const upcomingWeekEnd = new Date(upcomingWeekStart);
    upcomingWeekEnd.setDate(upcomingWeekStart.getDate() + 6);
    const upcomingWeekStartStr = normalizeDateOnly(upcomingWeekStart);
    const upcomingWeekEndStr = normalizeDateOnly(upcomingWeekEnd);

    const useViewOnlyData = true;
    if (useViewOnlyData) {
      const projectOpenViewRows = await executeAiViewQuery(
        'vAI_ProjectOpenTasks',
        `SELECT OrganizationId, ProjectId, ProjectName, TaskId, TaskName, UserId, DueDate, StatusName, IsClosed, IsCancelled, AllocationDate, AllocatedHours
         FROM vAI_ProjectOpenTasks
         WHERE OrganizationId IN (${placeholders})`,
        [...organizationIds]
      );

      const userOpenViewRows = await executeAiViewQuery(
        'vAI_UserOpenTasks',
        `SELECT OrganizationId, UserId, TaskId, TaskName, ProjectName, DueDate, StatusName, IsClosed, IsCancelled, AllocationDate, AllocatedHours
         FROM vAI_UserOpenTasks
         WHERE OrganizationId IN (${placeholders})`,
        [...organizationIds]
      );

      const userWorkloadViewRows = await executeAiViewQuery(
        'vAI_UserWorkloadBase',
        `SELECT OrganizationId, UserId, Username, FirstName, LastName, IsActive, IsManager, IsDeveloper, IsSupport, TaskId, IsClosed, IsCancelled, WorkDate, WorkedHours
         FROM vAI_UserWorkloadBase
         WHERE OrganizationId IN (${placeholders})`,
        [...organizationIds]
      );

      const allocationViewRows = await executeAiViewQuery(
        'vAI_UserAllocations',
        `SELECT OrganizationId, UserId, TaskId, TaskName, ProjectName, AllocationDate, AllocatedHours
         FROM vAI_UserAllocations
         WHERE OrganizationId IN (${placeholders})
           AND AllocationDate >= ?
           AND AllocationDate <= ?`,
        [...organizationIds, date30dStr, upcomingWeekEndStr]
      );

      const requesterDisplayName = username;
      const isAdminUser = Number((req.user as any)?.isAdmin || 0) === 1;
      const isManagerUser = Number((req.user as any)?.isManager || 0) === 1;
      const canViewOtherUsers = isAdminUser || isManagerUser || permissions.canViewOthersPlanning;

      const taskMetaMap = new Map<number, any>();
      projectOpenViewRows.forEach((row: any) => {
        const taskId = Number(row.TaskId);
        if (!Number.isFinite(taskId) || taskId <= 0) return;
        if (taskMetaMap.has(taskId)) return;
        taskMetaMap.set(taskId, {
          taskId,
          taskName: String(row.TaskName || ''),
          projectId: Number(row.ProjectId || 0),
          projectName: String(row.ProjectName || ''),
          dueDate: row.DueDate ? normalizeDbDate(row.DueDate) : null,
          statusName: String(row.StatusName || '(No Status)'),
          isClosed: Number(row.IsClosed || 0) === 1,
          isCancelled: Number(row.IsCancelled || 0) === 1,
          assignedTo: row.UserId ? Number(row.UserId) : null,
        });
      });

      const uniqueOpenTasks = Array.from(taskMetaMap.values()).filter((task: any) => !task.isClosed && !task.isCancelled);
      const overdueTasks = uniqueOpenTasks.filter((task: any) => task.dueDate && task.dueDate < today).length;

      const openProjectMap = new Map<number, any>();
      uniqueOpenTasks.forEach((task: any) => {
        if (!openProjectMap.has(task.projectId)) {
          openProjectMap.set(task.projectId, {
            projectId: task.projectId,
            projectName: task.projectName,
            statusName: 'Open',
            customerName: null,
            endDate: null,
          });
        }
      });
      const openProjectsDetailed = Array.from(openProjectMap.values()).sort((a: any, b: any) => String(a.projectName).localeCompare(String(b.projectName)));

      const directAllocCurrentWeek = allocationViewRows.filter((row: any) => {
        const uid = Number(row.UserId || 0);
        const date = normalizeDbDate(row.AllocationDate);
        return uid === userId && date >= weekStartStr && date <= weekEndStr;
      });
      const directHoursThisWeek = Number(directAllocCurrentWeek.reduce((sum: number, row: any) => sum + toNumber(row.AllocatedHours), 0).toFixed(2));
      const childHoursThisWeek = 0;
      const totalHoursThisWeek = Number((directHoursThisWeek + childHoursThisWeek).toFixed(2));
      const daysWithAllocationsSet = new Set(directAllocCurrentWeek.map((row: any) => normalizeDbDate(row.AllocationDate)).filter(Boolean));

      const allocationByTaskUpcomingWeek = new Map<number, number>();
      allocationViewRows.forEach((row: any) => {
        const taskId = Number(row.TaskId || 0);
        if (!Number.isFinite(taskId) || taskId <= 0) return;
        const date = normalizeDbDate(row.AllocationDate);
        if (date >= upcomingWeekStartStr && date <= upcomingWeekEndStr) {
          allocationByTaskUpcomingWeek.set(taskId, Number(((allocationByTaskUpcomingWeek.get(taskId) || 0) + toNumber(row.AllocatedHours)).toFixed(2)));
        }
      });

      const planningTopTasks = Array.from(new Map(
        directAllocCurrentWeek.map((row: any) => [
          Number(row.TaskId || 0),
          {
            taskId: Number(row.TaskId || 0),
            taskName: String(row.TaskName || ''),
            projectName: String(row.ProjectName || ''),
            plannedHours: Number(toNumber((directAllocCurrentWeek
              .filter((x: any) => Number(x.TaskId || 0) === Number(row.TaskId || 0))
              .reduce((s: number, x: any) => s + toNumber(x.AllocatedHours), 0)).toFixed(2))),
          }
        ])
      ).values())
        .sort((a: any, b: any) => toNumber(b.plannedHours) - toNumber(a.plannedHours))
        .slice(0, 8);

      const dailyScheduleRows = directAllocCurrentWeek.map((row: any) => ({
        date: normalizeDbDate(row.AllocationDate),
        taskName: String(row.TaskName || ''),
        projectName: String(row.ProjectName || ''),
        hours: Number(toNumber(row.AllocatedHours).toFixed(2)),
        source: 'direct',
      }));

      const dayMap = new Map<string, DailyScheduleBucket>();
      dailyScheduleRows.forEach((row: any) => {
        if (!row.date) return;
        const existing: DailyScheduleBucket = dayMap.get(row.date) || {
          date: row.date,
          directHours: 0,
          childHours: 0,
          totalHours: 0,
          tasks: [] as DailyScheduleTask[],
        };
        existing.directHours = Number((existing.directHours + toNumber(row.hours)).toFixed(2));
        existing.totalHours = Number((existing.totalHours + toNumber(row.hours)).toFixed(2));
        existing.tasks.push({ taskName: row.taskName, projectName: row.projectName, hours: row.hours, source: 'direct' });
        dayMap.set(row.date, existing);
      });
      const dailySchedule = Array.from(dayMap.values())
        .map((day) => ({ ...day, tasks: day.tasks.sort((a: any, b: any) => toNumber(b.hours) - toNumber(a.hours)).slice(0, 10) }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const myTasksDetailed = uniqueOpenTasks
        .filter((task: any) => Number(task.assignedTo) === userId)
        .map((task: any) => ({
          taskId: task.taskId,
          taskName: task.taskName,
          projectName: task.projectName,
          statusName: task.statusName,
          isClosed: false,
          dueDate: task.dueDate,
          unscheduledWork: false,
          jiraReference: null,
        }));

      const userSummaryMap = new Map<number, any>();
      userWorkloadViewRows.forEach((row: any) => {
        const uid = Number(row.UserId || 0);
        if (!Number.isFinite(uid) || uid <= 0) return;
        if (!userSummaryMap.has(uid)) {
          const fullName = `${String(row.FirstName || '').trim()} ${String(row.LastName || '').trim()}`.trim();
          userSummaryMap.set(uid, {
            userId: uid,
            username: String(row.Username || ''),
            fullName: fullName || String(row.Username || ''),
            isActive: Number(row.IsActive || 0) === 1,
            isManager: Number(row.IsManager || 0) === 1,
            isDeveloper: Number(row.IsDeveloper || 0) === 1,
            isSupport: Number(row.IsSupport || 0) === 1,
            openTasks: 0,
            doneTasks: 0,
            plannedHoursThisWeek: 0,
            workedHours30d: 0,
          });
        }
      });

      uniqueOpenTasks.forEach((task: any) => {
        const uid = Number(task.assignedTo || 0);
        if (!Number.isFinite(uid) || uid <= 0) return;
        const current = userSummaryMap.get(uid);
        if (current) current.openTasks += 1;
      });

      allocationViewRows.forEach((row: any) => {
        const uid = Number(row.UserId || 0);
        const date = normalizeDbDate(row.AllocationDate);
        const current = userSummaryMap.get(uid);
        if (!current) return;
        if (date >= weekStartStr && date <= weekEndStr) {
          current.plannedHoursThisWeek = Number((current.plannedHoursThisWeek + toNumber(row.AllocatedHours)).toFixed(2));
        }
      });

      userWorkloadViewRows.forEach((row: any) => {
        const uid = Number(row.UserId || 0);
        const date = normalizeDbDate(row.WorkDate);
        const current = userSummaryMap.get(uid);
        if (!current) return;
        if (date && date >= date30dStr) {
          current.workedHours30d = Number((current.workedHours30d + toNumber(row.WorkedHours)).toFixed(2));
        }
      });

      const accessibleUsersSummary = Array.from(userSummaryMap.values())
        .filter((entry: any) => canViewOtherUsers || entry.userId === userId)
        .sort((a: any, b: any) => b.openTasks - a.openTasks || String(a.fullName).localeCompare(String(b.fullName)));

      const userOpenTasksByUser: Record<string, any[]> = {};
      const allowedUserIds = new Set(accessibleUsersSummary.map((entry: any) => Number(entry.userId)));
      userOpenViewRows.forEach((row: any) => {
        const uid = Number(row.UserId || 0);
        const taskId = Number(row.TaskId || 0);
        if (!allowedUserIds.has(uid) || !Number.isFinite(taskId) || taskId <= 0) return;
        if (Number(row.IsClosed || 0) === 1 || Number(row.IsCancelled || 0) === 1) return;
        const key = String(uid);
        if (!userOpenTasksByUser[key]) userOpenTasksByUser[key] = [];
        userOpenTasksByUser[key].push({
          taskId,
          taskName: String(row.TaskName || ''),
          projectName: String(row.ProjectName || ''),
          statusName: String(row.StatusName || '(No Status)'),
          dueDate: row.DueDate ? normalizeDbDate(row.DueDate) : null,
          upcomingWeekHours: Number(toNumber(allocationByTaskUpcomingWeek.get(taskId) || 0).toFixed(2)),
        });
      });
      Object.keys(userOpenTasksByUser).forEach((key) => {
        userOpenTasksByUser[key] = userOpenTasksByUser[key]
          .sort((a: any, b: any) => toNumber(b.upcomingWeekHours) - toNumber(a.upcomingWeekHours) || String(a.taskName).localeCompare(String(b.taskName)))
          .slice(0, 60);
      });

      const projectMap = new Map<number, any>();
      uniqueOpenTasks.forEach((task: any) => {
        // When user cannot view others, only include their own tasks in project insights
        if (!canViewOtherUsers && Number(task.assignedTo) !== userId) return;
        const existing = projectMap.get(task.projectId) || {
          projectId: task.projectId,
          projectName: task.projectName,
          openTaskCount: 0,
          upcomingWeekPlannedHours: 0,
          openTasks: [],
        };
        const upcomingWeekHours = Number(toNumber(allocationByTaskUpcomingWeek.get(task.taskId) || 0).toFixed(2));
        const assigned = accessibleUsersSummary.find((user: any) => Number(user.userId) === Number(task.assignedTo));
        existing.openTaskCount += 1;
        existing.upcomingWeekPlannedHours = Number((existing.upcomingWeekPlannedHours + upcomingWeekHours).toFixed(2));
        existing.openTasks.push({
          taskId: task.taskId,
          taskName: task.taskName,
          statusName: task.statusName,
          dueDate: task.dueDate,
          assignedToName: assigned ? assigned.fullName : null,
          upcomingWeekHours,
        });
        projectMap.set(task.projectId, existing);
      });

      const projectTaskInsights = Array.from(projectMap.values())
        .map((entry: any) => ({
          ...entry,
          openTasks: entry.openTasks
            .sort((a: any, b: any) => toNumber(b.upcomingWeekHours) - toNumber(a.upcomingWeekHours) || String(a.taskName).localeCompare(String(b.taskName)))
            .slice(0, 60),
        }))
        .sort((a: any, b: any) => String(a.projectName).localeCompare(String(b.projectName)));

      const totalHours30d = Number(userWorkloadViewRows
        .filter((row: any) => {
          const uid = Number(row.UserId || 0);
          return allowedUserIds.has(uid) && row.WorkDate && normalizeDbDate(row.WorkDate) >= date30dStr;
        })
        .reduce((sum: number, row: any) => sum + toNumber(row.WorkedHours), 0)
        .toFixed(2));

      const contributorMap = new Map<number, any>();
      userWorkloadViewRows.forEach((row: any) => {
        const uid = Number(row.UserId || 0);
        if (!Number.isFinite(uid) || uid <= 0) return;
        if (!allowedUserIds.has(uid)) return; // Respect canViewOtherUsers permission
        const workDate = normalizeDbDate(row.WorkDate);
        if (!workDate || workDate < date30dStr) return;
        const existing = contributorMap.get(uid) || {
          userId: uid,
          username: String(row.Username || ''),
          fullName: `${String(row.FirstName || '').trim()} ${String(row.LastName || '').trim()}`.trim(),
          workedHours: 0,
        };
        existing.workedHours = Number((existing.workedHours + toNumber(row.WorkedHours)).toFixed(2));
        contributorMap.set(uid, existing);
      });
      const topContributors = Array.from(contributorMap.values())
        .sort((a: any, b: any) => toNumber(b.workedHours) - toNumber(a.workedHours))
        .slice(0, 5);

      const contextPayload = {
        user: {
          userId,
          username,
          organizationIds,
        },
        accessControl: {
          isAdmin: isAdminUser,
          isManager: isManagerUser,
          canViewOtherUsers,
          displayName: requesterDisplayName,
          roleLabel: isAdminUser ? 'admin' : (isManagerUser ? 'manager' : 'user'),
        },
        permissions,
        timeframe: {
          today,
          last30DaysFrom: date30dStr,
        },
        projects: {
          totalProjects: openProjectsDetailed.length,
          activeProjects: openProjectsDetailed.length,
        },
        tasks: {
          // When canViewOtherUsers is false, counts are scoped to the current user's own tasks only
          totalTasks: canViewOtherUsers ? uniqueOpenTasks.length : myTasksDetailed.length,
          openTasks: canViewOtherUsers ? uniqueOpenTasks.length : myTasksDetailed.length,
          overdueTasks: canViewOtherUsers
            ? overdueTasks
            : myTasksDetailed.filter((t: any) => t.dueDate && t.dueDate < today).length,
          unscheduledOpenTasks: 0,
        },
        timeEntries: {
          totalHours30d,
        },
        planning: {
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          directHoursThisWeek,
          childHoursThisWeek,
          totalHoursThisWeek,
          daysWithAllocations: daysWithAllocationsSet.size,
          topTasks: planningTopTasks,
          dailySchedule,
        },
        projectDetails: {
          openProjectCount: openProjectsDetailed.length,
          openProjects: openProjectsDetailed.slice(0, 80),
        },
        myTasks: {
          openCount: myTasksDetailed.length,
          doneCount: 0,
          open: myTasksDetailed.slice(0, 120),
          done: [],
        },
        customers: {
          totalCustomers: 0,
          activeCustomers: 0,
          inactiveCustomers: 0,
          summary: [],
        },
        integrations: {
          jiraLinkedCount: 0,
          jiraLinkedTasks: [],
        },
        team: {
          accessibleUserCount: accessibleUsersSummary.length,
          accessibleUsers: accessibleUsersSummary.slice(0, 150).map((entry: any) => ({
            userId: entry.userId,
            username: entry.username,
            fullName: entry.fullName,
            isActive: entry.isActive,
            isManager: entry.isManager,
            isDeveloper: entry.isDeveloper,
            isSupport: entry.isSupport,
          })),
          userWorkload: accessibleUsersSummary.slice(0, 150).map((entry: any) => ({
            userId: entry.userId,
            username: entry.username,
            fullName: entry.fullName,
            openTasks: entry.openTasks,
            doneTasks: entry.doneTasks,
            plannedHoursThisWeek: entry.plannedHoursThisWeek,
            workedHours30d: entry.workedHours30d,
          })),
          userOpenTasksByUser,
        },
        projectTaskInsights: projectTaskInsights.slice(0, 100),
        topContributors,
      };

      const safeHistory: ChatMessage[] = historyInput
        .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-8)
        .map((item: any) => ({ role: item.role, content: String(item.content).slice(0, 2000) }));

      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const systemPrompt = [
        'You are an internal project analytics assistant.',
        'Use ONLY the provided business context data.',
        'Security rule: only use data from AI views (vAI_ProjectOpenTasks, vAI_UserOpenTasks, vAI_UserWorkloadBase, vAI_UserAllocations).',
        'If data is insufficient, say what is missing.',
        'Never invent metrics.',
        `Budget access: ${permissions.canViewBudgetInfo ? 'allowed' : 'denied'}. If denied, never provide budget insights.`,
        'When asked for names/lists (projects, tasks, customers, Jira-linked tasks), provide concrete names from context.',
        'When a project name is mentioned, use projectTaskInsights to provide open task details and upcoming-week planned hours.',
        `Requester identity: ${requesterDisplayName}; admin=${isAdminUser}; manager=${isManagerUser}; canViewOtherUsers=${canViewOtherUsers}.`,
        canViewOtherUsers
          ? 'You may answer about other accessible users using team.accessibleUsers, team.userWorkload, and team.userOpenTasksByUser.'
          : 'Data scope is restricted to the current user only. tasks.totalTasks, tasks.overdueTasks, timeEntries.totalHours30d, projectTaskInsights, and topContributors contain ONLY the current user\'s data. Never mention or infer data about other users.',
        'For schedule/planning questions, use planning.dailySchedule and planning.topTasks directly when present.',
        'Do not claim missing daily allocations if planning.dailySchedule has entries.',
        'Respond in concise English with short bullet points when useful.'
      ].join(' ');

      const llmMessages = [
        { role: 'system', content: `${systemPrompt}\n\nContext:\n${JSON.stringify(contextPayload)}` },
        ...safeHistory,
        { role: 'user', content: rawMessage },
      ];

      const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, temperature: 0.2, messages: llmMessages }),
      });

      if (!llmResponse.ok) {
        const errorJson = await llmResponse.json().catch(() => ({}));
        const apiMessage = String(errorJson?.error?.message || errorJson?.message || '').trim();
        return res.status(502).json({
          success: false,
          message: apiMessage || 'OpenAI request failed. Check API key and model configuration.'
        });
      }

      const llmJson = await llmResponse.json();
      const llmAnswer = String(llmJson?.choices?.[0]?.message?.content || '').trim();
      const hasDailySchedule = Array.isArray(contextPayload?.planning?.dailySchedule) && contextPayload.planning.dailySchedule.length > 0;
      const weakScheduleReply = includesAny(normalizeSearchText(llmAnswer), [
        'for a detailed schedule',
        'more specific daily allocations are needed',
        'need daily allocations',
        'planejamento diario esta vazio',
        'planeamento diario esta vazio',
        'nao ha informacoes sobre tarefas planeadas',
        'nao ha informacoes sobre tarefas planejadas',
      ]);
      const weakContextReply = includesAny(normalizeSearchText(llmAnswer), [
        'not provided in the context',
        'details are not provided in the context',
        'information is not provided in the context',
        'nao esta no contexto',
      ]);
      const projectMentionedInQuestion = projectTaskInsights.some((project: any) => {
        const normalizedProjectName = normalizeSearchText(String(project.projectName || ''));
        return normalizedProjectName.length >= 3 && normalizedMessage.includes(normalizedProjectName);
      });

      const answer = ((hasDailySchedule && weakScheduleReply) || weakContextReply || (projectMentionedInQuestion && weakContextReply))
        ? buildFallbackAnswer(rawMessage, contextPayload)
        : (llmAnswer || buildFallbackAnswer(rawMessage, contextPayload));

      return res.json({
        success: true,
        data: {
          answer,
          context: {
            generatedAt: new Date().toISOString(),
            organizationIds,
            canViewBudgetInfo: permissions.canViewBudgetInfo,
          },
        },
      });
    }

    return res.status(500).json({ success: false, message: 'AI assistant view-only mode is disabled unexpectedly.' });
  } catch (error) {
    console.error('AI assistant chat error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process assistant request' });
  }
});

export default router;
