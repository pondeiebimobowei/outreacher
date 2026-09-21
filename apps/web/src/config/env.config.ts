export const webEnv = {
  VITE_API_URL:
    (import.meta.env && import.meta.env.VITE_API_URL) ||
    (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined) ||
    'http://localhost:3000',
  MODE:
    (import.meta.env && import.meta.env.MODE) ||
    (typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined) ||
    'development',
  IS_DEV:
    (import.meta.env && import.meta.env.DEV) ||
    (typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true),
  IS_PROD:
    (import.meta.env && import.meta.env.PROD) ||
    (typeof process !== 'undefined' ? process.env?.NODE_ENV === 'production' : false),
};
