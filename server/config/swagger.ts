import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Project Management API',
      version: '1.0.0',
      description: 'API documentation for Project Management Application',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        Task: {
          type: 'object',
          properties: {
            Id: { type: 'integer' },
            ProjectId: { type: 'integer' },
            TaskName: { type: 'string' },
            Description: { type: 'string', nullable: true },
            Status: { type: 'string' },
            Priority: { type: 'string' },
            EstimatedHours: { type: 'number', nullable: true },
            AssignedTo: { type: 'integer', nullable: true },
            DueDate: { type: 'string', format: 'date', nullable: true },
            CreatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            Id: { type: 'integer' },
            OrganizationId: { type: 'integer' },
            ProjectName: { type: 'string' },
            Description: { type: 'string', nullable: true },
            Status: { type: 'string' },
            StartDate: { type: 'string', format: 'date', nullable: true },
            EndDate: { type: 'string', format: 'date', nullable: true },
            IsHobby: { type: 'boolean' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./server/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
