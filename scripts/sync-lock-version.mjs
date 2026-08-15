// Copies the version from package.json into package-lock.json.
//
// `changeset version` bumps package.json and writes the changelog, but leaves
// the lockfile alone, so every release would otherwise drift the two apart. The
// usual advice is to follow it with `npm install --package-lock-only`, but that
// re-resolves the whole dependency tree and can quietly pull in new majors — it
// is how jsdom 30 arrived here once and broke CI on an older Node.
//
// This edits the two version fields and nothing else.
import { readFile, writeFile } from 'node:fs/promises';

const LOCK = 'package-lock.json';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile(LOCK, 'utf8'));

if (lock.version === version && lock.packages?.['']?.version === version) {
  console.log(`sync-lock-version: already ${version}`);
  process.exit(0);
}

lock.version = version;

if (lock.packages?.['']) {
  lock.packages[''].version = version;
}

await writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

console.log(`sync-lock-version: ${LOCK} -> ${version}`);
