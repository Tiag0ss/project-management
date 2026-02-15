import express from 'express';
import next from 'next';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { testConnection } from './config/database';
import { buildAllTables } from './utils/schemaBuilder';
import { seedRolePermissions } from './utils/seedRolePermissions';
import { runMigrations } from './utils/migrations';
import { swaggerSpec } from './config/swagger';
import logger from './utils/logger';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import projectsRoutes from './routes/projects';
import usersRoutes from './routes/users';
import tasksRoutes from './routes/tasks';
import organizationsRoutes from './routes/organizations';
import permissionGroupsRoutes from './routes/permissionGroups';
import statusValuesRoutes from './routes/statusValues';
import taskAllocationsRoutes from './routes/taskAllocations';
import taskChildAllocationsRoutes from './routes/taskChildAllocations';
import timeEntriesRoutes from './routes/timeEntries';
import callRecordsRoutes from './routes/callRecords';
import taskCommentsRoutes from './routes/taskComments';
import taskAttachmentsRoutes from './routes/taskAttachments';
import ticketAttachmentsRoutes from './routes/ticketAttachments';
import projectAttachmentsRoutes from './routes/projectAttachments';
import customerAttachmentsRoutes from './routes/customerAttachments';
import organizationAttachmentsRoutes from './routes/organizationAttachments';
import notificationsRoutes from './routes/notifications';
import taskHistoryRoutes from './routes/taskHistory';
import tagsRoutes from './routes/tags';
import searchRoutes from './routes/search';
import customersRoutes from './routes/customers';
import statisticsRoutes from './routes/statistics';
import ticketsRoutes from './routes/tickets';
import taskImportRoutes from './routes/taskImport';
import rolePermissionsRoutes from './routes/rolePermissions';
import systemSettingsRoutes from './routes/systemSettings';
import activityLogsRoutes from './routes/activityLogs';
import changeHistoryRoutes from './routes/changeHistory';
import emailPreferencesRoutes from './routes/emailPreferences';
import installRoutes from './routes/install';
import savedReportsRoutes from './routes/savedReports';
import memosRoutes from './routes/memos';
import jiraIntegrationsRoutes from './routes/jiraIntegrations';

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

  // Build tables from JSON schemas
  const structureDir = path.join(__dirname, 'database', 'structure');
  await buildAllTables(structureDir);
  
  // Run data migrations (idempotent)
  await runMigrations();
  
  // Seed default role permissions if needed
  await seedRolePermissions();
  
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

  // Health check endpoint
  server.get('/health', async (req, res) => {
    try {
      const dbHealthy = await testConnection();
      const status = dbHealthy ? 'healthy' : 'unhealthy';
      const httpStatus = dbHealthy ? 200 : 503;
      
      res.status(httpStatus).json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy ? 'connected' : 'disconnected',
      });
    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      });
    }
  });

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
  server.use('/api/statistics', statisticsRoutes);
  server.use('/api/tickets', ticketsRoutes);
  server.use('/api/task-import', taskImportRoutes);
  server.use('/api/role-permissions', rolePermissionsRoutes);
  server.use('/api/system-settings', systemSettingsRoutes);
  server.use('/api/activity-logs', activityLogsRoutes);
  server.use('/api/change-history', changeHistoryRoutes);
  server.use('/api/email-preferences', emailPreferencesRoutes);
  server.use('/api/saved-reports', savedReportsRoutes);
  server.use('/api/memos', memosRoutes);
  server.use('/api/jira-integrations', jiraIntegrationsRoutes);

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

  server.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Catch-all for undefined API routes
  server.use('/api', (req, res) => {
    logger.warn('API endpoint not found', { path: req.path, method: req.method });
    res.status(404).json({ success: false, message: 'API endpoint not found' });
  });

  // Handle all other requests with Next.js
  server.use((req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    logger.info(`> Server ready on http://localhost:${port}`);
    logger.info(`> API Documentation: http://localhost:${port}/api-docs`);
    logger.info(`> Health Check: http://localhost:${port}/health`);
    logger.info(`> Environment: ${dev ? 'development' : 'production'}`);
  });
}).catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
