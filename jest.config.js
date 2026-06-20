/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/mcp'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@travel-plan/shared$': '<rootDir>/shared/src/index.ts',
    // Sandbox blocks socket listen(); supertest binds a port. Swap in an
    // in-memory injector with the same surface. See supertest-shim.ts.
    '^supertest$': '<rootDir>/server/tests/supertest-shim.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts'],
  testTimeout: 20000,
  clearMocks: true,
};
