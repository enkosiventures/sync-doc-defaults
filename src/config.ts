import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocDefaultsConfig } from './types.js';

const CANDIDATE_FILES = [
  'docdefaults.config.mjs',
  'docdefaults.config.cjs',
  'docdefaults.config.js',
  'docdefaults.config.json',
];

export async function discoverConfig(startDir: string): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  while (true) {
    for (const f of CANDIDATE_FILES) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export async function loadConfig(file: string): Promise<DocDefaultsConfig> {
  const ext = path.extname(file).toLowerCase();
  let cfg: any;
  if (ext === '.json') {
    cfg = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } else {
    const mod = await import(pathToFileURL(file).href);
    cfg = mod?.default ?? mod;
  }
  validateConfig(cfg, file);
  return cfg;
}

function validateConfig(cfg: any, fromPath: string): asserts cfg is DocDefaultsConfig {
  if (!cfg || typeof cfg !== 'object') throw new Error(`Invalid config in ${fromPath}: not an object`);
  if (typeof cfg.defaults !== 'string') throw new Error(`Invalid config in ${fromPath}: "defaults" must be a string`);
  if (!Array.isArray(cfg.targets)) throw new Error(`Invalid config in ${fromPath}: "targets" must be an array`);
  for (const t of cfg.targets) {
    if (!t || typeof t !== 'object') throw new Error(`Invalid target in ${fromPath}: item is not an object`);
    if (typeof t.name !== 'string') throw new Error(`Invalid target in ${fromPath}: "name" must be a string`);
    if (typeof t.types !== 'string') throw new Error(`Invalid target "${t.name}": "types" must be a string`);
    if (t.dts && typeof t.dts !== 'string') throw new Error(`Invalid target "${t.name}": "dts" must be a string if provided`);
    if (typeof t.interface !== 'string') throw new Error(`Invalid target "${t.name}": "interface" must be a string`);
    if (typeof t.member !== 'string') throw new Error(`Invalid target "${t.name}": "member" must be a string`);
  }
}
