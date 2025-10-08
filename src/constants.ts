import type { PreferredTag, RunOptions, TsMode } from "./types.js";


export const RUN_DEFAULTS: Required<
  Pick<RunOptions, 'dryRun' | 'quiet' | 'debugPaths' | 'tsMode' | 'tag'>
> = {
  dryRun: false,
  quiet: false,
  debugPaths: false,
  tsMode: 'auto' satisfies TsMode,
  tag: 'default' satisfies PreferredTag,
};

export const CONFIG_FILENAME_CANDIDATES = [
  'docdefaults.config.mjs',
  'docdefaults.config.cjs',
  'docdefaults.config.js',
  'docdefaults.config.json',
  'sync-doc-defaults.config.mjs',
  'sync-doc-defaults.config.cjs',
  'sync-doc-defaults.config.js',
  'sync-doc-defaults.config.json',
];


export const TSCONFIG_FILENAME_CANDIDATES = [
  'tsconfig.docdefaults.json',
  'tsconfig.build.json',
  'tsconfig.types.json',
  'tsconfig.json',
  'tsconfig.base.json',
];


export const EXIT_CODES = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  CONFIG_NOT_FOUND: 2,
  GENERAL_ERROR: 3,
};