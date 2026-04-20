import { readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function readPackageJson(relativePath) {
  const packagePath = path.join(rootDir, relativePath);
  return JSON.parse(readFileSync(packagePath, 'utf-8'));
}

function extractMajor(versionRange) {
  const match = versionRange.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

const webPackage = readPackageJson('apps/web/package.json');
const syncServerPackage = readPackageJson('apps/sync-server/package.json');

const providerVersion = webPackage.dependencies?.['@hocuspocus/provider'];
const serverVersion = syncServerPackage.dependencies?.['@hocuspocus/server'];

const providerMajor = providerVersion ? extractMajor(providerVersion) : null;
const serverMajor = serverVersion ? extractMajor(serverVersion) : null;

if (providerMajor === null || serverMajor === null) {
  console.error(
    '[check:protocols] Could not read Hocuspocus dependency versions from workspace package manifests.',
  );
  process.exit(1);
}

if (providerMajor !== serverMajor) {
  console.error(
    `[check:protocols] Hocuspocus major versions are misaligned: provider=${providerVersion}, server=${serverVersion}.`,
  );
  process.exit(1);
}

console.log(
  `[check:protocols] Hocuspocus protocol versions are aligned on major ${providerMajor}.`,
);
