/** Integración (BD real vía TEST_DATABASE_URL): test/**/*.int-spec.ts */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  testTimeout: 60000,
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
