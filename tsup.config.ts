import { defineConfig } from 'tsup';

export default defineConfig([
  // 1) Library build
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    dts: { entry: { index: 'src/index.ts', types: 'src/types.ts' } },
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['typescript'],
  },

  // 2) CLI build
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    dts: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['typescript'],
    banner: { js: '#!/usr/bin/env node' },
  },
]);
