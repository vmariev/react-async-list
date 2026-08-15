import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server for the demo in example/. It aliases the package name to src/ so
// the demo exercises the real source with hot reload, rather than a built copy.
export default defineConfig({
  root: 'example',
  plugins: [react()],
  resolve: {
    alias: {
      '@vmariev/react-async-list': fileURLToPath(
        new URL('./src/index.ts', import.meta.url)
      ),
    },
  },
});
