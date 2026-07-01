/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server', '<rootDir>/mcp'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@travel-plan/shared$': '<rootDir>/shared/src/index.ts',
    '^@travel-plan/mcp$': '<rootDir>/mcp/src/lib.ts',
    // The mcp package uses NodeNext `.js` extensions on its relative imports;
    // strip them so ts-jest resolves the `.ts` source under test.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/server/tests/setup.ts'],
  testTimeout: 20000,
  clearMocks: true,
};
