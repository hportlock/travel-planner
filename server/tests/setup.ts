// Runs once per test file (jest setupFilesAfterEnv).
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

jest.setTimeout(20000);
