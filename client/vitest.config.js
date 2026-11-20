import { defineConfig } from 'vitest/config';

// Client tests cover framework-free logic (stores, gesture rules, API client), so Node is enough.
// A dedicated config also keeps Vitest from loading the Vite + Tailwind plugins.
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
