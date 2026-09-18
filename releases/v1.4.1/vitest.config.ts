import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The upstream package contains extensionless ESM imports; resolve it via Vite,
    // just as the browser build does, instead of Node's external-module loader.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
