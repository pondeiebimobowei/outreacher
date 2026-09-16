const getImportMetaEnv = () => {
  try {
    return new Function('return import.meta.env')();
  } catch {
    return undefined;
  }
};

const metaEnv = getImportMetaEnv();

export const webEnv = {
  VITE_API_URL:
    metaEnv?.VITE_API_URL ??
    (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined) ??
    'http://localhost:3000',
  MODE:
    metaEnv?.MODE ??
    (typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined) ??
    'development',
  IS_DEV:
    metaEnv?.DEV ??
    (typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true),
  IS_PROD:
    metaEnv?.PROD ??
    (typeof process !== 'undefined' ? process.env?.NODE_ENV === 'production' : false),
};
