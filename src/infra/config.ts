import fs from 'node:fs';
import path, { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocDefaultsConfig, Options, RunOptions } from '../types.js';
import { CONFIG_FILENAME_CANDIDATES, RUN_DEFAULTS } from '../constants.js';


export async function discoverConfig(startDir: string): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  while (true) {
    for (const filename of CONFIG_FILENAME_CANDIDATES) {
      const pathFromStart = path.join(dir, filename);
      if (fs.existsSync(pathFromStart)) return pathFromStart;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export async function loadConfig(file: string): Promise<DocDefaultsConfig> {
  const extension = path.extname(file).toLowerCase();
  let config: any;
  if (extension === '.json') {
    config = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } else {
    const module = await import(pathToFileURL(file).href);
    config = module?.default ?? module;
  }
  validateConfig(config, file);
  return config;
}

function validateConfig(config: any, fromPath: string): asserts config is DocDefaultsConfig {
  if (!config || typeof config !== 'object') throw new Error(`Invalid config in ${fromPath}: not an object`);
  if (typeof config.defaults !== 'string') throw new Error(`Invalid config in ${fromPath}: "defaults" must be a string`);
  if (!Array.isArray(config.targets)) throw new Error(`Invalid config in ${fromPath}: "targets" must be an array`);
  for (const target of config.targets) {
    if (!target || typeof target !== 'object') throw new Error(`Invalid target in ${fromPath}: item is not an object`);
    if (target.name && typeof target.name !== 'string') throw new Error(`Invalid target in ${fromPath}: "name" must be a string`);
    if (typeof target.types !== 'string') throw new Error(`Invalid target "${target.name}": "types" must be a string`);
    if (target.dts && typeof target.dts !== 'string') throw new Error(`Invalid target "${target.name}": "dts" must be a string if provided`);
    if (typeof target.interface !== 'string') throw new Error(`Invalid target "${target.name}": "interface" must be a string`);
    if (typeof target.member !== 'string') throw new Error(`Invalid target "${target.name}": "member" must be a string`);
  }
}


export function resolveOptions(input?: RunOptions): Options {
  const envTs = process.env.SYNCDOCDEFAULTS_TS as any;
  const envTag = process.env.SYNCDOCDEFAULTS_TAG as any;
  const envQuiet = process.env.SYNCDOCDEFAULTS_QUIET === '1' || process.env.SYNCDOCDEFAULTS_QUIET === 'true';
  const envDebug = process.env.SYNCDOCDEFAULTS_DEBUG_PATHS === '1' || process.env.SYNCDOCDEFAULTS_DEBUG_PATHS === 'true';

  return {
    repoRoot: input?.repoRoot ? resolve(input.repoRoot) : process.cwd(),
    dryRun: input?.dryRun ?? RUN_DEFAULTS.dryRun,
    quiet: input?.quiet ?? envQuiet ?? RUN_DEFAULTS.quiet,
    debugPaths: input?.debugPaths ?? envDebug ?? RUN_DEFAULTS.debugPaths,
    tsMode: input?.tsMode ?? envTs ?? RUN_DEFAULTS.tsMode,
    tag: input?.tag ?? envTag ?? RUN_DEFAULTS.tag,
  };
}
