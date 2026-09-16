export const webEnv = {
  VITE_API_URL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  MODE: import.meta.env.MODE ?? 'development',
  IS_DEV: import.meta.env.DEV ?? true,
  IS_PROD: import.meta.env.PROD ?? false,
};
