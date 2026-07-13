import { z } from 'zod';

const TASK_NAME_MAX = 255;
const MEDIUMTEXT_MAX = 16_777_215;

const optionalPositiveInt = z.coerce.number().int().positive().optional().nullable();
const optionalDateString = z.string().optional().nullable();
const optionalCustomFields = z.record(z.string(), z.unknown()).optional();

const emptyStringToNull = (value: unknown) => (value === '' ? null : value);

const optionalStatusId = z.preprocess(
  emptyStringToNull,
  z.union([z.coerce.number().int().positive(), z.null()]).optional()
);

const taskFieldsSchema = z.object({
  taskName: z.string().min(1, 'Task name is required').max(TASK_NAME_MAX),
  description: z.string().max(MEDIUMTEXT_MAX, 'Description is too long').optional().nullable(),
  status: z.coerce.number().int().positive('Status is required'),
  priority: z.coerce.number().int().positive('Priority is required'),
  taskType: optionalPositiveInt,
  assignedTo: optionalPositiveInt,
  dueDate: optionalDateString,
  dueDateMandatory: z.union([z.boolean(), z.coerce.number(), z.string()]).optional(),
  unscheduledWork: z.union([z.boolean(), z.coerce.number(), z.string()]).optional(),
  estimatedHours: z.union([z.coerce.number(), z.literal(''), z.null()]).optional(),
  storyPoints: z.union([z.coerce.number(), z.literal(''), z.null()]).optional(),
  parentTaskId: optionalPositiveInt,
  displayOrder: z.coerce.number().int().optional().nullable(),
  plannedStartDate: optionalDateString,
  plannedEndDate: optionalDateString,
  dependsOnTaskId: optionalPositiveInt,
  ticketId: optionalPositiveInt,
  customerId: optionalPositiveInt,
  customFields: optionalCustomFields,
});

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

// Task schemas (status/priority/taskType are FK int IDs)
export const createTaskSchema = taskFieldsSchema.extend({
  projectId: z.coerce.number().int().positive(),
}).passthrough();

export const updateTaskBodySchema = taskFieldsSchema
  .extend({
    status: optionalStatusId,
    priority: optionalStatusId,
  })
  .partial()
  .passthrough();

// Project schemas (status is FK int ID)
export const createProjectSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  projectName: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(65000).optional().nullable(),
  status: z.coerce.number().int().positive(),
  startDate: optionalDateString,
  endDate: optionalDateString,
  isHobby: z.union([z.boolean(), z.coerce.number()]).optional(),
  isGlobal: z.union([z.boolean(), z.coerce.number()]).optional(),
  isVisibleToCustomer: z.union([z.boolean(), z.coerce.number()]).optional(),
  customerId: optionalPositiveInt,
  budget: z.union([z.coerce.number(), z.null(), z.literal('')]).optional(),
  budgetType: z.string().max(50).optional().nullable(),
  applicationIds: z.array(z.coerce.number().int().positive()).optional(),
  customFields: optionalCustomFields,
}).passthrough();

export const updateProjectBodySchema = createProjectSchema.omit({ organizationId: true }).partial().passthrough();

// Organization schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
  abbreviation: z.string().max(20).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  customFields: optionalCustomFields,
}).passthrough();

export const updateOrganizationBodySchema = createOrganizationSchema.partial().passthrough();

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  id: z.number().int().positive(),
});

// User profile update
export const updateUserProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  timezone: z.string().max(100).optional().nullable(),
  countryCode: z.string().max(10).optional().nullable(),
  regionCode: z.string().max(20).optional().nullable(),
  annualVacationDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  navbarMenuLayout: z.string().max(50).optional().nullable(),
  navbarLeftMode: z.string().max(50).optional().nullable(),
  navbarLeftCollapsed: z.union([z.boolean(), z.coerce.number()]).optional(),
  dashboardCalendarInOverview: z.union([z.boolean(), z.coerce.number()]).optional(),
  hoursDisplayFormat: z.string().max(20).optional().nullable(),
  azureAdObjectId: z.string().max(255).optional().nullable(),
}).passthrough();

// Ticket schemas (priority/status are FK int IDs in API payloads)
export const createTicketSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  customerId: optionalPositiveInt,
  projectId: optionalPositiveInt,
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(65000).optional().nullable(),
  priority: z.coerce.number().int().positive(),
  category: z.string().max(50).optional(),
  externalTicketId: z.string().max(255).optional().nullable(),
  customFields: optionalCustomFields,
}).passthrough();

export const updateTicketBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(65000).optional().nullable(),
  status: z.coerce.number().int().positive().optional(),
  priority: z.coerce.number().int().positive().optional(),
  category: z.string().max(50).optional(),
  assignedToUserId: optionalPositiveInt,
  developerUserId: optionalPositiveInt,
  projectId: optionalPositiveInt,
  scheduledDate: optionalDateString,
  organizationId: z.coerce.number().int().positive().optional(),
  customerId: optionalPositiveInt,
  customFields: optionalCustomFields,
}).passthrough();

// Portal ticket create (customer user)
export const createPortalTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(65000).optional().nullable(),
  category: z.string().max(50).optional(),
  priorityId: optionalPositiveInt,
  projectId: optionalPositiveInt,
}).passthrough();

// Dev Support schemas (informational leave marker — full days only)
export const createDevSupportRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// Time Entry schemas
export const createTimeEntrySchema = z.object({
  taskId: z.coerce.number().int().positive(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  hours: z.coerce.number().min(0.01).max(24),
  description: z.string().max(500).optional().nullable(),
  startTime: z.string().max(20).optional().nullable(),
  endTime: z.string().max(20).optional().nullable(),
  customFields: optionalCustomFields,
}).passthrough();

// Validation helper
export const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  return schema.parse(data);
};

export const formatZodError = (error: z.ZodError) => {
  const errors = error.issues.map((e: z.ZodIssue) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
  const firstDetail = errors
    .map((entry) => (entry.field ? `${entry.field}: ${entry.message}` : entry.message))
    .filter(Boolean)
    .join('; ');

  return {
    success: false as const,
    message: firstDetail || 'Validation error',
    errors,
  };
};

/** Validate decrypted/plain payload (auth routes). */
export const validatePayload = <T>(schema: z.ZodSchema<T>, data: unknown): T | { error: ReturnType<typeof formatZodError> } => {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { error: formatZodError(result.error) };
  }
  return result.data;
};

// Validation middleware
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: { body: unknown }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(formatZodError(result.error));
    }
    next();
  };
};
