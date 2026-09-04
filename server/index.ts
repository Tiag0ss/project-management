import express from 'express';
import http from 'http';
import next from 'next';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { dbProvider, testConnection } from './config/database';
import { registerHealthRoute } from './health';
import { buildAllTables } from './utils/schemaBuilder';
import { seedRolePermissions } from './utils/seedRolePermissions';
import { runMigrations } from './utils/migrations';
import { swaggerSpec } from './config/swagger';
import logger from './utils/logger';
import { getBrandFaviconFilePath, getDefaultFaviconPath, resolveFaviconTarget } from './utils/favicon';
import authRoutes from './modules/auth/auth';
import userRoutes from './modules/users/user';
import projectsRoutes from './modules/projects/projects';
import usersRoutes from './modules/users/users';
import tasksRoutes from './modules/projects/tasks';
import organizationsRoutes from './modules/organizations/organizations';
import permissionGroupsRoutes from './modules/organizations/permissionGroups';
import statusValuesRoutes from './modules/organizations/statusValues';
import taskAllocationsRoutes from './modules/planning/taskAllocations';
import taskChildAllocationsRoutes from './modules/planning/taskChildAllocations';
import timeEntriesRoutes from './modules/time/timeEntries';
import callRecordsRoutes from './modules/time/callRecords';
import taskCommentsRoutes from './modules/projects/taskComments';
import taskAttachmentsRoutes from './modules/projects/taskAttachments';
import ticketAttachmentsRoutes from './modules/tickets/ticketAttachments';
import projectAttachmentsRoutes from './modules/projects/projectAttachments';
import customerAttachmentsRoutes from './modules/customers/customerAttachments';
import organizationAttachmentsRoutes from './modules/organizations/organizationAttachments';
import notificationsRoutes from './modules/notifications/notifications';
import taskHistoryRoutes from './modules/projects/taskHistory';
import tagsRoutes from './modules/projects/tags';
import searchRoutes from './modules/search/search';
import customersRoutes from './modules/customers/customers';
import statisticsRoutes from './modules/reporting/statistics';
import dashboardKpisRoutes from './modules/dashboard/dashboardKpis';
import ticketsRoutes from './modules/tickets/tickets';
import taskImportRoutes from './modules/projects/taskImport';
import rolePermissionsRoutes from './modules/admin/rolePermissions';
import systemSettingsRoutes from './modules/admin/systemSettings';
import activityLogsRoutes from './modules/admin/activityLogs';
import changeHistoryRoutes from './modules/admin/changeHistory';
import emailPreferencesRoutes from './modules/users/emailPreferences';
import gridPreferencesRoutes from './modules/users/gridPreferences';
import installRoutes from './modules/auth/install';
import savedReportsRoutes from './modules/reporting/savedReports';
import dynamicReportsRoutes from './modules/reporting/dynamicReports';
import memosRoutes from './modules/notifications/memos';
import expensesRoutes from './modules/expenses/expenses';
import expenseAttachmentsRoutes from './modules/expenses/expenseAttachments';
import jiraIntegrationsRoutes from './modules/integrations/jiraIntegrations';
import githubIntegrationsRoutes from './modules/integrations/githubIntegrations';
import giteaIntegrationsRoutes from './modules/integrations/giteaIntegrations';
import bitbucketIntegrationsRoutes from './modules/integrations/bitbucketIntegrations';
import recurringAllocationsRoutes from './modules/planning/recurringAllocations';
import taskChecklistsRoutes from './modules/projects/taskChecklists';
import timersRoutes from './modules/time/timers';
import taskTemplatesRoutes from './modules/projects/taskTemplates';
import slaRulesRoutes from './modules/tickets/slaRules';
import sprintsRoutes from './modules/projects/sprints';
import projectMilestonesRoutes from './modules/projects/projectMilestones';
import portalRoutes from './modules/portal/portal';
import applicationsRoutes from './modules/applications/applications';
import projectReportSchedulesRoutes from './modules/projects/projectReportSchedules';
import retrospectiveActionsRoutes from './modules/projects/retrospectiveActions';
import workflowTransitionPoliciesRoutes from './modules/projects/workflowTransitionPolicies';
import taskFieldVisibilityRoutes from './modules/admin/taskFieldVisibility';
import holidaysRoutes from './modules/admin/holidays';
import vacationsRoutes from './modules/time/vacations';
import outOfOfficeRoutes from './modules/time/outOfOffice';
import devSupportRoutes from './modules/users/devSupport';
import pdfExportsRoutes from './modules/reporting/pdfExports';
import planningImportRoutes from './modules/planning/planningImport';
import allocationSnapshotsRoutes from './modules/planning/allocationSnapshots';
import aiAssistantRoutes from './modules/integrations/aiAssistant';
import outlookCalendarRoutes from './modules/planning/outlookCalendar';
import emailTaskQueueRoutes, { webhookRouter as emailTaskQueueWebhookRoutes } from './modules/integrations/emailTaskQueue';
import apiTokensRoutes from './modules/admin/apiTokens';
import reportsRoutes from './modules/reporting/reports';
import reportingRoutes from './modules/reporting/reporting';
import ssoRoutes from './modules/auth/sso';
import { ensureAiAssistantViews } from './utils/aiAssistantViews';
import { startWorkSummaryScheduler } from './utils/workSummaryScheduler';
import { startDueDateReminderScheduler } from './utils/dueDateReminderScheduler';
import { startPdfReportScheduler } from './utils/pdfReportScheduler';
import { startSlaAutoTransitionScheduler } from './utils/slaAutoTransitionScheduler';
import { startReportingSchedulers } from './utils/reportingSchedulers';
import { initSocketHub } from './utils/socketHub';

import customFieldsRoutes from './modules/admin/customFields';
import customTablesRoutes from './modules/admin/customTables';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

async function initializeDatabase() {
  logger.info('=== Database Initialization ===');
  
  // Test database connection
  const isConnected = await testConnection();
  
  if (!isConnected) {
    logger.error('Failed to connect to database. Please check your configuration.');
    process.exit(1);
  }

  const structureDir = path.join(__dirname, 'database', 'structure');
  await buildAllTables(structureDir);
  await runMigrations();
  
  // Seed default role permissions if needed
  await seedRolePermissions();

  // Ensure AI assistant views exist (and apply admin-custom SQL if configured)
  try {
    const aiViewsResult = await ensureAiAssistantViews();
    logger.info('AI assistant views ensured', aiViewsResult as any);
  } catch (aiViewsError) {
    logger.warn('Failed to ensure AI assistant views; assistant will use SQL fallback queries', {
      error: aiViewsError instanceof Error ? aiViewsError.message : String(aiViewsError),
    });
  }
  
  logger.info('=== Database Ready ===');
}

app.prepare().then(async () => {
  // Initialize database
  await initializeDatabase();

  const server = express();

  // Security: Helmet for HTTP headers
  server.use(helmet({
    contentSecurityPolicy: false, // Disable for Next.js compatibility
  }));

  // Security: CORS configuration
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
  server.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  // Rate limiting for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // General API rate limiting
  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10000, // 10000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
  });

  const webhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: 'Too many webhook requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Middleware - increase limit for base64 file uploads (10MB files become ~13.5MB in base64)
  server.use(express.json({ limit: '50mb' }));
  server.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging
  server.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { 
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });

  // Serve runtime-written branding / application images (Next may not pick up post-build public files)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (error) {
    logger.warn('Could not ensure public/uploads directory (uploads may fail until permissions are fixed)', {
      error: error instanceof Error ? error.message : String(error),
      uploadsDir,
    });
  }
  server.use('/uploads', express.static(uploadsDir, { fallthrough: true, maxAge: '1d' }));

  registerHealthRoute(server);

  // API Documentation with Swagger
  server.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Project Management API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));

  // Swagger JSON
  server.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // API routes - apply rate limiting
  server.use('/api/install', installRoutes);
  server.use('/api/auth', authLimiter, authRoutes);
  server.use('/api/webhooks', webhookLimiter, emailTaskQueueWebhookRoutes);
  server.use('/api', apiLimiter); // Apply to all other API routes
  server.use('/api/user', userRoutes);
  server.use('/api/projects', projectsRoutes);
  server.use('/api/users', usersRoutes);
  server.use('/api/tasks', tasksRoutes);
  server.use('/api/organizations', organizationsRoutes);
  server.use('/api/permission-groups', permissionGroupsRoutes);
  server.use('/api/status-values', statusValuesRoutes);
  server.use('/api/task-allocations', taskAllocationsRoutes);
  server.use('/api/task-child-allocations', taskChildAllocationsRoutes);
  server.use('/api/time-entries', timeEntriesRoutes);
  server.use('/api/call-records', callRecordsRoutes);
  server.use('/api/task-comments', taskCommentsRoutes);
  server.use('/api/task-attachments', taskAttachmentsRoutes);
  server.use('/api/ticket-attachments', ticketAttachmentsRoutes);
  server.use('/api/project-attachments', projectAttachmentsRoutes);
  server.use('/api/customer-attachments', customerAttachmentsRoutes);
  server.use('/api/organization-attachments', organizationAttachmentsRoutes);
  server.use('/api/notifications', notificationsRoutes);
  server.use('/api/task-history', taskHistoryRoutes);
  server.use('/api/tags', tagsRoutes);
  server.use('/api/search', searchRoutes);
  server.use('/api/customers', customersRoutes);
  server.use('/api/applications', applicationsRoutes);
  server.use('/api/statistics', statisticsRoutes);
  server.use('/api/dashboard-kpis', dashboardKpisRoutes);
  server.use('/api/tickets', ticketsRoutes);
  server.use('/api/planning-import', planningImportRoutes);
  server.use('/api/allocation-snapshots', allocationSnapshotsRoutes);
  server.use('/api/task-import', taskImportRoutes);
  server.use('/api/role-permissions', rolePermissionsRoutes);
  server.use('/api/system-settings', systemSettingsRoutes);
  server.use('/api/outlook-calendar', outlookCalendarRoutes);
  server.use('/api/email-task-queue', emailTaskQueueRoutes);
  server.use('/api/activity-logs', activityLogsRoutes);
  server.use('/api/change-history', changeHistoryRoutes);
  server.use('/api/email-preferences', emailPreferencesRoutes);
  server.use('/api/grid-preferences', gridPreferencesRoutes);
  server.use('/api/saved-reports', savedReportsRoutes);
  server.use('/api/dynamic-reports', dynamicReportsRoutes);
  server.use('/api/memos', memosRoutes);
  server.use('/api/expenses', expensesRoutes);
  server.use('/api/expense-attachments', expenseAttachmentsRoutes);
  server.use('/api/jira-integrations', jiraIntegrationsRoutes);
  server.use('/api/github-integrations', githubIntegrationsRoutes);
  server.use('/api/gitea-integrations', giteaIntegrationsRoutes);
  server.use('/api/bitbucket-integrations', bitbucketIntegrationsRoutes);
  server.use('/api/recurring-allocations', recurringAllocationsRoutes);
  server.use('/api/task-checklists', taskChecklistsRoutes);
  server.use('/api/timers', timersRoutes);
  server.use('/api/task-templates', taskTemplatesRoutes);
  server.use('/api/sla-rules', slaRulesRoutes);
  server.use('/api/custom-fields', customFieldsRoutes);
  server.use('/api/custom-tables', customTablesRoutes);
  server.use('/api/sprints', sprintsRoutes);
  server.use('/api/project-milestones', projectMilestonesRoutes);
  server.use('/api/portal', portalRoutes);
  server.use('/api/project-report-schedules', projectReportSchedulesRoutes);
  server.use('/api/retrospective-actions', retrospectiveActionsRoutes);
  server.use('/api/workflow-transition-policies', workflowTransitionPoliciesRoutes);
  server.use('/api/task-field-visibility', taskFieldVisibilityRoutes);
  server.use('/api/holidays', holidaysRoutes);
  server.use('/api/vacations', vacationsRoutes);
  server.use('/api/out-of-office', outOfOfficeRoutes);
  server.use('/api/dev-support', devSupportRoutes);
  server.use('/api/pdf-exports', pdfExportsRoutes);
  server.use('/api/reports', reportsRoutes);
  server.use('/api/reporting', reportingRoutes);
  server.use('/api/ai-assistant', aiAssistantRoutes);
  server.use('/api/api-tokens', apiTokensRoutes);
  server.use('/api/sso', ssoRoutes);

  // Error handling middleware
  server.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // Don't expose internal errors in production
    const message = process.env.NODE_ENV === 'production' 
      ? 'An internal error occurred' 
      : err.message;

    res.status(err.status || 500).json({
      success: false,
      message,
    });
  });

  // Download latest generated Desktop App installer from release folder
  server.get('/api/downloads/desktop-app', async (req, res) => {
    try {
      const releaseDir = path.join(process.cwd(), 'extras', 'release');
      if (!fs.existsSync(releaseDir)) {
        return res.status(404).json({ success: false, message: 'Desktop installer folder not found' });
      }

      const platform = String(req.query.platform || 'win').toLowerCase();
      const isLinux = platform === 'linux';
      const extension = isLinux ? '.appimage' : '.exe';

      const entries = await fsPromises.readdir(releaseDir);
      const candidates = entries
        .filter((entry) => entry.toLowerCase().endsWith(extension))
        .filter((entry) => entry.toLowerCase().includes('desktop timer'));

      if (candidates.length === 0) {
        return res.status(404).json({
          success: false,
          message: isLinux ? 'Linux desktop installer not found' : 'Desktop installer not found',
        });
      }

      const withStats = await Promise.all(
        candidates.map(async (fileName) => {
          const absolutePath = path.join(releaseDir, fileName);
          const stats = await fsPromises.stat(absolutePath);
          return { fileName, absolutePath, mtimeMs: stats.mtimeMs };
        })
      );

      withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const latest = withStats[0];
      return res.download(latest.absolutePath, latest.fileName);
    } catch (error) {
      logger.error('Failed to provide desktop installer download', { error });
      return res.status(500).json({ success: false, message: 'Failed to download desktop installer' });
    }
  });

  // Catch-all for undefined API routes
  server.use('/api', (req, res) => {
    logger.warn('API endpoint not found', { path: req.path, method: req.method });
    res.status(404).json({ success: false, message: 'API endpoint not found' });
  });

  const sendConfiguredFavicon = async (res: express.Response) => {
    try {
      const target = await resolveFaviconTarget();
      if (target.kind === 'redirect') {
        return res.redirect(302, target.url);
      }
      res.setHeader('Content-Type', target.contentType);
      res.setHeader('Cache-Control', target.cacheControl);
      return res.sendFile(target.absolutePath);
    } catch (error) {
      logger.error('Failed to serve favicon', { error });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.sendFile(getBrandFaviconFilePath());
    }
  };

  // Browsers still request /favicon.ico aggressively — honour SystemSettings.faviconUrl.
  server.get('/favicon.ico', async (_req, res) => {
    await sendConfiguredFavicon(res);
  });

  // Legacy paths that may still be cached from older builds.
  server.get('/window.svg', (_req, res) => {
    res.redirect(307, getDefaultFaviconPath());
  });

  server.get('/brand-favicon.svg', async (_req, res) => {
    await sendConfiguredFavicon(res);
  });

  // Handle all other requests with Next.js
  server.use((req, res) => {
    return handle(req, res);
  });

  // Create HTTP server and attach socket.io
  const httpServer = http.createServer(server);
  initSocketHub(httpServer, allowedOrigins);

  httpServer.listen(port, () => {
    logger.info(`> Server ready on http://localhost:${port}`);
    logger.info(`> API Documentation: http://localhost:${port}/api-docs`);
    logger.info(`> Health Check: http://localhost:${port}/health`);
    logger.info(`> Environment: ${dev ? 'development' : 'production'}`);
    
    // Start the work summary scheduler
    startWorkSummaryScheduler();

    // Start the due date reminder scheduler
    startDueDateReminderScheduler();

    // Start the PDF report scheduler
    startPdfReportScheduler();

    // Organization health snapshots + digest emails
    startReportingSchedulers();

    // Start SLA auto-transition scheduler
    startSlaAutoTransitionScheduler();
  });
}).catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
