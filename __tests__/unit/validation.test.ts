import { validate, loginSchema, createTaskSchema } from '../../server/utils/validation';

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        username: 'testuser',
        password: 'password123',
      };

      expect(() => validate(loginSchema, validData)).not.toThrow();
    });

    it('should reject username that is too short', () => {
      const invalidData = {
        username: 'ab',
        password: 'password123',
      };

      expect(() => validate(loginSchema, invalidData)).toThrow();
    });

    it('should reject password that is too short', () => {
      const invalidData = {
        username: 'testuser',
        password: '12345',
      };

      expect(() => validate(loginSchema, invalidData)).toThrow();
    });

    it('should reject missing fields', () => {
      const invalidData = {
        username: 'testuser',
      };

      expect(() => validate(loginSchema, invalidData)).toThrow();
    });
  });

  describe('createTaskSchema', () => {
    it('should validate correct task data', () => {
      const validData = {
        projectId: 1,
        taskName: 'Test Task',
        description: 'Test description',
        status: 'To Do',
        priority: 'High',
        estimatedHours: 5,
      };

      expect(() => validate(createTaskSchema, validData)).not.toThrow();
    });

    it('should reject empty task name', () => {
      const invalidData = {
        projectId: 1,
        taskName: '',
      };

      expect(() => validate(createTaskSchema, invalidData)).toThrow();
    });

    it('should reject invalid projectId', () => {
      const invalidData = {
        projectId: -1,
        taskName: 'Test Task',
      };

      expect(() => validate(createTaskSchema, invalidData)).toThrow();
    });

    it('should accept optional fields as undefined', () => {
      const validData = {
        projectId: 1,
        taskName: 'Test Task',
      };

      expect(() => validate(createTaskSchema, validData)).not.toThrow();
    });
  });
});
