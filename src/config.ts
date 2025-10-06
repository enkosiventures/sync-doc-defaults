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
  if (typeof cfg.defaultsModulePath !== 'string') throw new Error(`Invalid config in ${fromPath}: "defaultsModulePath" must be a string`);
  if (!Array.isArray(cfg.targets)) throw new Error(`Invalid config in ${fromPath}: "targets" must be an array`);
  for (const t of cfg.targets) {
    if (!t || typeof t !== 'object') throw new Error(`Invalid target in ${fromPath}: item is not an object`);
    if (typeof t.name !== 'string') throw new Error(`Invalid target in ${fromPath}: "name" must be a string`);
    if (typeof t.srcPath !== 'string') throw new Error(`Invalid target "${t.name}": "srcPath" must be a string`);
    if (t.dtsPath && typeof t.dtsPath !== 'string') throw new Error(`Invalid target "${t.name}": "dtsPath" must be a string if provided`);
    if (typeof t.interfaceName !== 'string') throw new Error(`Invalid target "${t.name}": "interfaceName" must be a string`);
    if (typeof t.defaultsRef !== 'string') throw new Error(`Invalid target "${t.name}": "defaultsRef" must be a string`);
  }
}





// import fs from 'node:fs';
// import path from 'node:path';
// import { pathToFileURL } from 'node:url';
// import { createRequire } from 'node:module';
// import { readFile } from 'node:fs/promises';
// import type { DocDefaultsConfig } from './types.js';

// const CANDIDATE_FILES = [
//   'docdefaults.config.mjs',
//   'docdefaults.config.cjs',
//   'docdefaults.config.js',
//   'docdefaults.config.json',
// ];

// export async function discoverConfig(startDir: string): Promise<string | undefined> {
//   let dir = path.resolve(startDir);
//   while (true) {
//     for (const f of CANDIDATE_FILES) {
//       const p = path.join(dir, f);
//       if (fs.existsSync(p)) return p;
//     }
//     const parent = path.dirname(dir);
//     if (parent === dir) break;
//     dir = parent;
//   }
//   return undefined;
// }

// export async function findAndLoadRootConfig(file: string): Promise<DocDefaultsConfig> {
//   const ext = path.extname(file).toLowerCase();
//   let cfg: any;
//   if (ext === '.json') {
//     cfg = JSON.parse(await fs.promises.readFile(file, 'utf8'));
//   } else {
//     const mod = await import(pathToFileURL(file).href);
//     cfg = mod?.default ?? mod;
//   }
//   validateConfig(cfg, file);
//   return cfg;
// }

// function validateConfig(cfg: any, fromPath: string): asserts cfg is DocDefaultsConfig {
//   if (!cfg || typeof cfg !== 'object') throw new Error(`Invalid config in ${fromPath}: not an object`);
//   if (typeof cfg.defaultsModulePath !== 'string') throw new Error(`Invalid config in ${fromPath}: "defaultsModulePath" must be a string`);
//   if (!Array.isArray(cfg.targets)) throw new Error(`Invalid config in ${fromPath}: "targets" must be an array`);
//   for (const t of cfg.targets) {
//     if (!t || typeof t !== 'object') throw new Error(`Invalid target in ${fromPath}: item is not an object`);
//     if (typeof t.name !== 'string') throw new Error(`Invalid target in ${fromPath}: "name" must be a string`);
//     if (typeof t.srcPath !== 'string') throw new Error(`Invalid target "${t.name}": "srcPath" must be a string`);
//     if (t.dtsPath && typeof t.dtsPath !== 'string') throw new Error(`Invalid target "${t.name}": "dtsPath" must be a string if provided`);
//     if (typeof t.interfaceName !== 'string') throw new Error(`Invalid target "${t.name}": "interfaceName" must be a string`);
//     if (typeof t.defaultsRef !== 'string') throw new Error(`Invalid target "${t.name}": "defaultsRef" must be a string`);
//   }
// }

// export async function loadConfig(configPathOrObject?: string | Record<string, any>) {
//   if (!configPathOrObject) return await findAndLoadRootConfig(process.cwd());

//   if (typeof configPathOrObject === 'object') return configPathOrObject;

//   const p = path.resolve(configPathOrObject);
//   const ext = path.extname(p).toLowerCase();

//   if (ext === '.json') {
//     const text = await readFile(p, 'utf8');
//     return JSON.parse(text);
//   }

//   if (ext === '.cjs') {
//     const req = createRequire(import.meta.url);
//     const mod = req(p);
//     return mod.default ?? mod;
//   }

//   // .mjs or .js (ESM)
//   const mod = await import(pathToFileURL(p).href);
//   return (mod as any).default ?? mod;
// }
