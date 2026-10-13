import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const webModule = (name: string) => fileURLToPath(new URL(`./apps/web/node_modules/${name}`, import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        // React lives only in apps/web; alias it so web view tests type-check under apps/web/tsconfig and run here.
        resolve: { alias: [{ find: /^react$/, replacement: webModule('react') }, { find: /^react-dom\/server$/, replacement: webModule('react-dom/server') }] },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
