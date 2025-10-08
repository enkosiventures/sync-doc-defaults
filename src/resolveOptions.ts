import { resolve } from 'node:path';
import { RUN_DEFAULTS } from './constants.js';
import { Options, RunOptions } from './types.js';


export function resolveOptions(input?: RunOptions): Options {
  const envTs = process.env.SYNCDOCDEFAULTS_TS as any;
  const envTag = process.env.DOCDEFAULTS_TAG as any;
  const envQuiet = process.env.DOCDEFAULTS_QUIET === '1' || process.env.DOCDEFAULTS_QUIET === 'true';
  const envDebug = process.env.DOCDEFAULTS_DEBUG_PATHS === '1' || process.env.DOCDEFAULTS_DEBUG_PATHS === 'true';

  return {
    repoRoot: input?.repoRoot ? resolve(input.repoRoot) : process.cwd(),
    dryRun: input?.dryRun ?? RUN_DEFAULTS.dryRun,
    quiet: input?.quiet ?? envQuiet ?? RUN_DEFAULTS.quiet,
    debugPaths: input?.debugPaths ?? envDebug ?? RUN_DEFAULTS.debugPaths,
    tsMode: input?.tsMode ?? envTs ?? RUN_DEFAULTS.tsMode,
    tag: input?.tag ?? envTag ?? RUN_DEFAULTS.tag,
  };
}
