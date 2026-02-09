import { z } from 'zod';

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6).max(100),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
});

// Task schemas
export const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  taskName: z.string().min(1, 'Task name is required').max(200),
  description: z.string().max(2000).optional(),
  status: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  estimatedHours: z.number().min(0).max(9999).optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
  dependsOnTaskId: z.number().int().positive().optional().nullable(),
  parentTaskId: z.number().int().positive().optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.number().int().positive(),
});

// Project schemas
export const createProjectSchema = z.object({
  organizationId: z.number().int().positive(),
  projectName: z.string().min(1, 'Project name is required').max(200),
  description: z.string().max(2000).optional(),
  status: z.string().max(50).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  isHobby: z.boolean().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.number().int().positive(),
});

// Organization schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
  description: z.string().max(1000).optional(),
});

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  id: z.number().int().positive(),
});

// Ticket schemas
export const createTicketSchema = z.object({
  organizationId: z.number().int().positive(),
  customerId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(5000).optional(),
  priority: z.string().max(50),
  category: z.string().max(50),
  status: z.string().max(50).optional(),
});

export const updateTicketSchema = createTicketSchema.partial().extend({
  id: z.number().int().positive(),
  assignedToUserId: z.number().int().positive().optional().nullable(),
  developerUserId: z.number().int().positive().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
});

// Time Entry schemas
export const createTimeEntrySchema = z.object({
  taskId: z.number().int().positive(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  hours: z.number().min(0.1).max(24),
  description: z.string().max(500).optional(),
});

// Validation helper
export const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  return schema.parse(data);
};

// Validation middleware
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues.map((e: z.ZodIssue) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};
