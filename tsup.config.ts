import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/promptc': 'src/bin/promptc.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
