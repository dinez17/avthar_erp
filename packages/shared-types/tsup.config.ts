import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Cleaning is skipped in watch mode on purpose. `tsup --watch` wipes dist/ the
  // moment it restarts, and the declaration build takes several seconds to catch
  // up — so anything reading dist/ in that window (a typecheck, a Vite dep scan,
  // an app booting) sees a package with no types and fails confusingly. A one-shot
  // build still cleans, which is where a stale artefact would actually matter.
  clean: !options.watch,
  treeshake: true,
  external: ['react', 'react-dom'],
}));
