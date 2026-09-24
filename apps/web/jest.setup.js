const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// Polyfill import.meta.env for ts-jest (Vite-only global not available in Node)
// env.config.ts guards with `import.meta.env &&` so this just needs to be falsy
// to allow the process.env fallback branch to run.
if (typeof global.importMeta === 'undefined') {
  // ts-jest compiles `import.meta` references — just ensure the guard works
  // by not throwing. The actual values come from process.env in the test env.
  global.__vitest_importMeta__ = undefined;
}
