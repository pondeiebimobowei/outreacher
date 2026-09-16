/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: '@repo/jest-presets/browser',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
};
