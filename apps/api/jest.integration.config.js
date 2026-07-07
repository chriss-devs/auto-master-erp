// Integración (BD real vía DATABASE_URL): test -> *.int-spec.ts
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  testTimeout: 120000,
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
};
