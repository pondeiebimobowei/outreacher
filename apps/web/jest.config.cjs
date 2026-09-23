/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Do NOT use @repo/jest-presets/browser here — that preset is an ESM .mjs
  // that sets `preset: 'ts-jest'` which ignores our tsconfig override and
  // causes ts-jest to emit ESM output that Node cannot require().
  // We inline all necessary settings instead.

  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterFramework: ['@testing-library/jest-dom'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Use the Jest-specific tsconfig that targets CommonJS output.
        tsconfig: '<rootDir>/tsconfig.jest.json',
        diagnostics: {
          // Suppress non-blocking TS errors in test files; types are enforced
          // by `pnpm check-types` using the real tsconfig, not here.
          warnOnly: true,
          ignoreCodes: ['TS2307', 'TS2339', 'TS2345', 'TS2322', 'TS6133', 'TS1343'],
        },
      },
    ],
  },

  moduleNameMapper: {
    // Replace the Vite-only env.config (uses import.meta.env) with a plain
    // CommonJS stub so ts-jest/Node can require() it without ESM errors.
    'config/env\\.config': '<rootDir>/__mocks__/env.config.ts.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
