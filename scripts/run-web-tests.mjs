import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const webDir = path.join(rootDir, 'apps', 'web');
const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
const requireFromWeb = createRequire(path.join(webDir, 'package.json'));

function resolveVitestEntrypoint() {
  for (const scopedRequire of [requireFromWeb, requireFromRoot]) {
    try {
      const vitestPackageJson = scopedRequire.resolve('vitest/package.json');
      return path.join(path.dirname(vitestPackageJson), 'vitest.mjs');
    } catch {
      // Keep checking other resolution roots.
    }
  }

  return null;
}

const vitestEntrypoint = resolveVitestEntrypoint();

if (!vitestEntrypoint) {
  console.warn(
    '[test:web] Skipping Vitest run because vitest is not installed in this workspace checkout.',
  );
  process.exit(0);
}

const result = spawnSync(process.execPath, [vitestEntrypoint, 'run'], {
  cwd: webDir,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
