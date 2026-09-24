// Jest mock for src/config/env.config.ts
// This file is used by ts-jest via moduleNameMapper.
// It replaces the Vite-only import.meta.env access with plain Node.js values.

module.exports = {
  webEnv: {
    VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:3000',
    MODE: process.env.NODE_ENV || 'test',
    IS_DEV: process.env.NODE_ENV !== 'production',
    IS_PROD: process.env.NODE_ENV === 'production',
  },
};
