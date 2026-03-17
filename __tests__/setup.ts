import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
(process.env as any).NODE_ENV = 'test';
(process.env as any).JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';
