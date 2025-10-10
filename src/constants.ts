import type { PreferredTag, RunOptions, TsMode } from "./types.js";


export const LOG_PREFIX = '[sync-doc-defaults]';

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
];


export const EXIT_CODES = {
  SUCCESS: 0,

  // Assertions/expected validation failures (e.g., assert mismatches)
  VALIDATION_ERROR: 1,

  // Config could not be discovered (walk-up failed)
  CONFIG_NOT_FOUND: 2,

  // Runtime load/resolve problems (I/O, tsx missing, built JS import failed,
  // .d.ts not found, interface not found, defaults symbol not found, etc.)
  LOADING_ERROR: 3,

  // Config file was found but is invalid (wrong shape/fields)
  INVALID_CONFIG: 4,

  // Bad CLI usage (unknown flag, missing argument) -> distinct from runtime failures
  USAGE_ERROR: 5,

  // Everything else (unexpected/unhandled)
  GENERAL_ERROR: 6,
} as const;
