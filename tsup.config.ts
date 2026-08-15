import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['react', 'react-dom'],
  // Copies the authored stylesheet to dist/styles.css. It is inlined into the
  // bundle separately, via the prebuild step, so the two cannot drift.
  onSuccess: 'node scripts/build-css.mjs --dist',
});
