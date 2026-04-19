import type { Config } from 'jest';

const commonConfig: Config = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/dist/'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@lidox/types$': '<rootDir>/../../packages/types/src/index.ts',
  },
};

const config: Config = {
  projects: [
    {
      ...commonConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.unit.spec.ts'],
    },
    {
      ...commonConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/*.int.spec.ts'],
    },
  ],
};

export default config;
