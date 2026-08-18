import { defineConfig } from 'tsup';

export default defineConfig({
  entry:       ['src/index.ts'],
  format:      ['esm', 'cjs'],
  target:      'es2022',
  platform:    'neutral',
  // Type declarations are emitted by tsc (npm run build:types) rather than by
  // tsup's bundler, which injects the deprecated baseUrl option and so fails
  // on TypeScript 6. Emitting them directly also keeps the declarations a
  // faithful projection of the source rather than a rollup of it.
  dts:         false,
  sourcemap:   true,
  clean:       true,
  treeshake:   true,
  splitting:   false,
  tsconfig:    'tsconfig.build.json',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.js' : '.cjs' };
  },
});
