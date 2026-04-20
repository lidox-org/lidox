import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
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

function runVitest(nodeCommand) {
  return spawnSync(nodeCommand, [vitestEntrypoint, 'run'], {
    cwd: webDir,
    stdio: 'inherit',
  });
}

const preferredNodeCommand = existsSync(process.execPath)
  ? process.execPath
  : 'node';

let result = runVitest(preferredNodeCommand);
if (result.error?.code === 'ENOENT' && preferredNodeCommand !== 'node') {
  result = runVitest('node');
}

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
