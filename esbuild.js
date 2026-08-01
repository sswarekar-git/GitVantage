const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

function copyCodicons() {
  const destDir = path.join(__dirname, 'media', 'codicon');
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of ['codicon.css', 'codicon.ttf']) {
    fs.copyFileSync(
      path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', file),
      path.join(destDir, file),
    );
  }
}

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: {
    'commit/index': 'webview-ui/commit/index.tsx',
    'log/index': 'webview-ui/log/index.tsx',
    'branches/index': 'webview-ui/branches/index.tsx',
    'stash/index': 'webview-ui/stash/index.tsx',
  },
  bundle: true,
  outdir: 'media/dist',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: true,
  logLevel: 'info',
};

async function main() {
  copyCodicons();
  const extCtx = await esbuild.context(extensionConfig);
  const webCtx = await esbuild.context(webviewConfig);

  if (watch) {
    await Promise.all([extCtx.watch(), webCtx.watch()]);
  } else {
    await Promise.all([extCtx.rebuild(), webCtx.rebuild()]);
    await Promise.all([extCtx.dispose(), webCtx.dispose()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
