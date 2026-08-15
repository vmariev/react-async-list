// Inlines src/styles/async-list.css into a TypeScript module, and optionally
// copies it to dist/styles.css.
//
// Why generate a module instead of importing the .css directly? A plain string
// export works identically under tsup, Vite, tsc, and any consumer bundler,
// with no `text`/`?raw` loader configuration and no risk of a consumer's CSS
// pipeline trying to process it. The component can then inject the stylesheet at
// runtime, so installing the package requires no CSS import at all.
//
// Usage:
//   node scripts/build-css.mjs           regenerate src/styles/generated.ts
//   node scripts/build-css.mjs --dist    also write dist/styles.css
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SOURCE = 'src/styles/async-list.css';
const GENERATED = 'src/styles/generated.ts';
const DIST = 'dist/styles.css';

const css = await readFile(SOURCE, 'utf8');

if (!css.trim()) {
  throw new Error(`${SOURCE} is empty`);
}

const asTemplateLiteral = css
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

await writeFile(
  GENERATED,
  `// Generated from ${SOURCE} by scripts/build-css.mjs. Do not edit.\n` +
    `/* eslint-disable */\n` +
    `export const ASYNC_LIST_CSS = \`${asTemplateLiteral}\`;\n`,
  'utf8'
);

console.log(`build-css: wrote ${GENERATED} (${css.length} bytes of CSS)`);

if (process.argv.includes('--dist')) {
  await mkdir('dist', { recursive: true });
  await writeFile(DIST, css, 'utf8');
  console.log(`build-css: wrote ${DIST}`);
}
