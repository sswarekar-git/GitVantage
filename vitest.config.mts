import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'webview-ui/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      // Files under test import the real `vscode` module (as they must, to run
      // for real inside the extension host); outside that host — i.e. here —
      // no such module exists. This redirects every `import ... from 'vscode'`
      // to a minimal in-repo fake covering just the surface our code touches.
      vscode: path.resolve(dirname, 'test/mocks/vscode.ts'),
    },
  },
});
