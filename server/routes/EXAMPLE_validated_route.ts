/**
 * EXEMPLO: Como adicionar validação Zod a rotas existentes
 * 
 * Este ficheiro mostra como aplicar validação em rotas da API
 */

import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { validateRequest, createTaskSchema, updateTaskSchema } from '../utils/validation';
import { pool } from '../config/database';
import { ResultSetHeader } from 'mysql2';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     description: Creates a new task in the specified project. Task starts with 'To Do' status and is assigned to the authenticated user as creator.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - taskName
 *             properties:
 *               projectId:
 *                 type: integer
 *                 description: ID of the project where the task will be created
 *                 example: 1
 *               taskName:
 *                 type: string
 *                 description: Task name (maximum 500 characters)
 *                 example: "Implement JWT authentication"
 *                 minLength: 1
 *                 maxLength: 500
 *               description:
 *                 type: string
 *                 description: Detailed task description (optional)
 *                 example: "Add token validation and authentication middleware"
 *               priority:
 *                 type: string
 *                 description: Task priority level
 *                 enum: [Low, Medium, High, Critical]
 *                 default: Medium
 *                 example: "High"
 *               estimatedHours:
 *                 type: number
 *                 description: Estimated hours to complete
 *                 minimum: 0
 *                 example: 8.5
 *               assignedTo:
 *                 type: integer
 *                 description: Assigned user ID (optional)
 *                 example: 5
 *               plannedStartDate:
 *                 type: string
 *                 format: date
 *                 description: Planned start date (YYYY-MM-DD)
 *                 example: "2026-02-10"
 *               plannedEndDate:
 *                 type: string
 *                 format: date
 *                 description: Planned end date (YYYY-MM-DD)
 *                 example: "2026-02-15"
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task created successfully"
 *                 taskId:
 *                   type: integer
 *                   description: ID of the created task
 *                   example: 42
 *       400:
 *         description: Validation error - invalid data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation error"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: "taskName"
 *                       message:
 *                         type: string
 *                         example: "Task name is required"
 *       401:
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Token not provided"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to create task"
 */
router.post(
  '/example-task',
  authenticateToken,
  validateRequest(createTaskSchema), // ← Validação automática aqui!
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      // Se chegou aqui, req.body já está validado!
      const { projectId, taskName, description, priority, estimatedHours } = req.body;

      logger.info('Creating task', { userId, taskName, projectId });

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Priority, EstimatedHours, CreatedBy, Status)
         VALUES (?, ?, ?, ?, ?, ?, 'To Do')`,
        [projectId, taskName, description || null, priority || 'Medium', estimatedHours || null, userId]
      );

      logger.info('Task created successfully', { taskId: result.insertId });

      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        taskId: result.insertId,
      });
    } catch (error: any) {
      logger.error('Error creating task', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        message: 'Failed to create task',
      });
    }
  }
);

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update an existing task
 *     description: Partially updates a task. Only provided fields will be updated (PATCH behavior). All fields are optional.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the task to update
 *         schema:
 *           type: integer
 *           example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskName:
 *                 type: string
 *                 description: New task name
 *                 example: "Implement JWT authentication - Complete"
 *                 minLength: 1
 *                 maxLength: 500
 *               description:
 *                 type: string
 *                 description: New description
 *                 example: "Implementation completed with tests"
 *               status:
 *                 type: string
 *                 description: New task status
 *                 enum: [To Do, In Progress, Done, Blocked]
 *                 example: "Done"
 *               priority:
 *                 type: string
 *                 description: New priority level
 *                 enum: [Low, Medium, High, Critical]
 *                 example: "Medium"
 *               estimatedHours:
 *                 type: number
 *                 description: New estimated hours
 *                 minimum: 0
 *                 example: 10
 *               assignedTo:
 *                 type: integer
 *                 description: New assigned user ID
 *                 example: 7
 *               plannedStartDate:
 *                 type: string
 *                 format: date
 *                 description: New start date
 *                 example: "2026-02-10"
 *               plannedEndDate:
 *                 type: string
 *                 format: date
 *                 description: New end date
 *                 example: "2026-02-20"
 *             example:
 *               status: "Done"
 *               estimatedHours: 12
 *     responses:
 *       200:
 *         description: Task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task updated successfully"
 *       400:
 *         description: Validation error or no fields provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No fields to update"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Token not provided"
 *       404:
 *         description: Task not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Task not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to update task"
 */
router.put(
  '/example-task/:id',
  authenticateToken,
  validateRequest(updateTaskSchema), // ← Validação para updates
  async (req: AuthRequest, res: Response) => {
    try {
      const taskId = parseInt(String(req.params.id));
      const updates = req.body; // Já validado!

      logger.info('Updating task', { taskId, updates });

      // Construir query dinâmica baseada nos campos fornecidos
      const fields = Object.keys(updates).filter(k => k !== 'id');
      const values = fields.map(f => updates[f]);
      
      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update',
        });
      }

      const setClause = fields.map(f => `${f} = ?`).join(', ');
      
      await pool.execute(
        `UPDATE Tasks SET ${setClause} WHERE Id = ?`,
        [...values, taskId]
      );

      logger.info('Task updated successfully', { taskId });

      res.json({
        success: true,
        message: 'Task updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating task', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to update task',
      });
    }
  }
);

export default router;

// ============================================================================
// ADDITIONAL ENDPOINT DOCUMENTATION EXAMPLES
// ============================================================================

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User authentication
 *     description: Authenticates a user with username/email and password. Returns JWT token in HTTP-only cookie.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email address
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *                 example: "SecurePass123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             description: JWT token in HTTP-only cookie
 *             schema:
 *               type: string
 *               example: "token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/; Max-Age=86400"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 token:
 *                   type: string
 *                   description: JWT bearer token
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiam9obi5kb2UiLCJpYXQiOjE2NDA5OTUyMDB9.xyz"
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: "john.doe"
 *                     email:
 *                       type: string
 *                       example: "john.doe@example.com"
 *                     firstName:
 *                       type: string
 *                       example: "John"
 *                     lastName:
 *                       type: string
 *                       example: "Doe"
 *                     isAdmin:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation error"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: "password"
 *                       message:
 *                         type: string
 *                         example: "Password is required"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid credentials"
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Too many authentication attempts, please try again later."
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account. Password is hashed with bcrypt before storage.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               username:
 *                 type: string
 *                 description: Unique username (3-50 characters)
 *                 minLength: 3
 *                 maxLength: 50
 *                 example: "johndoe"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address (must be valid)
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Password (minimum 6 characters)
 *                 minLength: 6
 *                 example: "SecurePass123!"
 *               firstName:
 *                 type: string
 *                 description: User first name
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 description: User last name
 *                 example: "Doe"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *                 userId:
 *                   type: integer
 *                   example: 15
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Username already exists"
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Returns all projects for organizations the user belongs to. Includes project details and status.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: integer
 *         description: Filter by organization ID (optional)
 *         example: 1
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by project status (optional)
 *         example: "Active"
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       Id:
 *                         type: integer
 *                         example: 1
 *                       ProjectName:
 *                         type: string
 *                         example: "E-commerce Platform"
 *                       Description:
 *                         type: string
 *                         example: "Build full-stack e-commerce solution"
 *                       Status:
 *                         type: string
 *                         example: "Active"
 *                       StartDate:
 *                         type: string
 *                         format: date
 *                         example: "2026-01-15"
 *                       EndDate:
 *                         type: string
 *                         format: date
 *                         example: "2026-06-30"
 *                       OrganizationId:
 *                         type: integer
 *                         example: 1
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     description: Creates a new project in the specified organization. User must have CanCreateProjects permission.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - projectName
 *             properties:
 *               organizationId:
 *                 type: integer
 *                 description: Organization ID where project will be created
 *                 example: 1
 *               projectName:
 *                 type: string
 *                 description: Project name (1-200 characters)
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Mobile App Development"
 *               description:
 *                 type: string
 *                 description: Project description (optional)
 *                 example: "Develop iOS and Android mobile applications"
 *               status:
 *                 type: string
 *                 description: Initial project status
 *                 default: "Active"
 *                 example: "Planning"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Project start date (YYYY-MM-DD)
 *                 example: "2026-03-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Project end date (YYYY-MM-DD, optional)
 *                 example: "2026-12-31"
 *               isHobby:
 *                 type: boolean
 *                 description: Whether this is a hobby/personal project
 *                 default: false
 *                 example: false
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Project created successfully"
 *                 projectId:
 *                   type: integer
 *                   example: 25
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create a new organization
 *     description: Creates a new organization. The creator automatically becomes an admin member.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Organization name (1-200 characters)
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Acme Corporation"
 *               description:
 *                 type: string
 *                 description: Organization description (optional)
 *                 example: "Leading software development company"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Organization created successfully"
 *                 organizationId:
 *                   type: integer
 *                   example: 5
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/time-entries:
 *   post:
 *     summary: Create a time entry
 *     description: Records time worked on a task. User must have CanManageTimeEntries permission or be the assigned user.
 *     tags: [Time Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - workDate
 *               - hours
 *             properties:
 *               taskId:
 *                 type: integer
 *                 description: ID of the task
 *                 example: 42
 *               workDate:
 *                 type: string
 *                 format: date
 *                 description: Date work was performed (YYYY-MM-DD)
 *                 example: "2026-02-07"
 *               hours:
 *                 type: number
 *                 description: Hours worked (0.01 to 24)
 *                 minimum: 0.01
 *                 maximum: 24
 *                 example: 4.5
 *               description:
 *                 type: string
 *                 description: Description of work performed (optional)
 *                 example: "Implemented user authentication and authorization"
 *     responses:
 *       201:
 *         description: Time entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Time entry created successfully"
 *                 timeEntryId:
 *                   type: integer
 *                   example: 128
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a support ticket
 *     description: Creates a new support/issue ticket. User must have CanCreateTickets permission.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 description: Ticket title (1-200 characters)
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Login page not loading"
 *               description:
 *                 type: string
 *                 description: Detailed description of the issue
 *                 example: "When trying to access /login, page shows 500 error"
 *               priority:
 *                 type: string
 *                 description: Ticket priority
 *                 enum: [Low, Medium, High, Critical]
 *                 default: Medium
 *                 example: "High"
 *               projectId:
 *                 type: integer
 *                 description: Related project ID (optional)
 *                 example: 5
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ticket created successfully"
 *                 ticketId:
 *                   type: integer
 *                   example: 87
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */

// ============================================================================
// END OF ENDPOINT DOCUMENTATION EXAMPLES
// ============================================================================

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. Importar o schema de validação apropriado de utils/validation.ts
 * 2. Adicionar validateRequest(schema) como middleware ANTES do handler
 * 3. O middleware valida automaticamente req.body
 * 4. Se a validação falhar, retorna 400 com detalhes dos erros
 * 5. Se passar, o handler recebe dados já validados
 * 
 * EXEMPLO DE RESPOSTA DE ERRO:
 * {
 *   "success": false,
 *   "message": "Validation error",
 *   "errors": [
 *     {
 *       "field": "taskName",
 *       "message": "Task name is required"
 *     },
 *     {
 *       "field": "estimatedHours",
 *       "message": "Number must be greater than or equal to 0"
 *     }
 *   ]
 * }
 */
