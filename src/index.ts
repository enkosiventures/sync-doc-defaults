
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  injectDefaultsIntoDts,
  assertDefaultsInDts,
} from './dts-ops/index.js';

import { loadModuleSmart } from './source-loader.js';
import { findNearestTsconfig, loadTsProject } from './tsconfig-resolver.js';
import { DefaultTag, DocDefaultsConfig, RunOptions, TsMode } from './types.js';


// ===== Public API =====

/**
 * Injects @default literals into all targets.
 * Throws on critical errors (missing interface, missing defaults symbol, etc.)
 */
export async function inject(configPath?: string, opts: RunOptions = {}) {
  const { cfg, repoRoot } = await loadConfigResolved(configPath, opts);
  const defaultTag: DefaultTag = opts.defaultTag ?? cfg.defaultTag ?? 'default';

  // Resolve TypeScript paths (rootDir/outDir/declarationDir)
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, cfg.tsconfigPath);
  const ts = loadTsProject(tsconfigPathAbs);

  // Load constants module (built-js preferred, TS fallback via tsx)
  const defaultsModulePathAbs = path.resolve(repoRoot, cfg.defaultsModulePath);
  const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
    repoRoot,
    tsRootDir: ts.rootDir,
    tsOutDir: ts.outDir,
    tsDeclarationDir: ts.declarationDir,
    tsMode: opts.tsMode,      // auto/on/off
    quiet: opts.quiet,
  });

  if (opts.debugPaths) {
    console.log({
      projectRoot: ts.projectRoot,
      tsconfigPathAbs,
      rootDir: ts.rootDir,
      outDir: ts.outDir,
      declarationDir: ts.declarationDir,
      tsMode: opts.tsMode,
    });
  }

  let totalUpdates = 0;
  for (const t of cfg.targets) {
    const name = t.name ?? t.interfaceName;

    const srcAbs = path.resolve(repoRoot, t.srcPath);
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      srcPath: t.srcPath,
      dtsPath: t.dtsPath,
    });

    // defaults object for this target (flat { [prop]: value })
    const defaultsObj = selectDefaults(defaultsModule, t.defaultsRef);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new Error(
        `[docdefaults] ${name}: defaults symbol "${t.defaultsRef}" not found or not an object in ${rel(repoRoot, defaultsModulePathAbs)}`
      );
    }

    // read .d.ts
    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch {
      throw new Error(`[docdefaults] ${name}: .d.ts not found at ${rel(repoRoot, dtsPathAbs)}`);
    }

    // inject
    const { updatedText, updatedCount, missing } = injectDefaultsIntoDts({
      dtsText,
      interfaceName: t.interfaceName,
      defaults: defaultsObj as Record<string, unknown>,
      preferredTag: defaultTag,
    });

    if (missing.length) {
      for (const m of missing) {
        console.warn(`[docdefaults] ${name}: property "${m.prop}" not found in interface ${t.interfaceName}`);
      }
    }

    if (updatedCount > 0) {
      totalUpdates += updatedCount;
      if (!opts.dryRun) {
        await fs.writeFile(dtsPathAbs, updatedText, 'utf8');
      }
      if (!opts.quiet) {
        console.log(`[docdefaults] ${name}: injected ${updatedCount} @${defaultTag} update(s) → ${rel(repoRoot, dtsPathAbs)}`);
      }
    } else if (!opts.quiet) {
      console.log(`[docdefaults] ${name}: up-to-date`);
    }

    if (opts.debugPaths) {
      console.log(
        `[docdefaults:debug] target="${name}" src=${rel(repoRoot, srcAbs)} dts=${rel(repoRoot, dtsPathAbs)} tsconfig=${tsconfigPathAbs}`
      );
    }
  }

  return { updated: totalUpdates };
}

/**
 * Asserts that @default literals are in sync across all targets.
 * Throws when any mismatch is found (prints a concise report).
 */
export async function assert(configPath?: string, opts: RunOptions = {}) {
  const { cfg, repoRoot } = await loadConfigResolved(configPath, opts);
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, cfg.tsconfigPath);
  const ts = loadTsProject(tsconfigPathAbs);

  const defaultsModulePathAbs = path.resolve(repoRoot, cfg.defaultsModulePath);
  const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
    repoRoot,
    tsRootDir: ts.rootDir,
    tsOutDir: ts.outDir,
    tsDeclarationDir: ts.declarationDir,
    tsMode: opts.tsMode,
    quiet: opts.quiet,
  });

  let anyMismatch = false;
  for (const t of cfg.targets) {
    const name = t.name ?? t.interfaceName;
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      srcPath: t.srcPath,
      dtsPath: t.dtsPath,
    });

    const defaultsObj = selectDefaults(defaultsModule, t.defaultsRef);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new Error(
        `[docdefaults] ${name}: defaults symbol "${t.defaultsRef}" not found or not an object in ${rel(repoRoot, defaultsModulePathAbs)}`
      );
    }

    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch {
      throw new Error(`[docdefaults] ${name}: .d.ts not found at ${rel(repoRoot, dtsPathAbs)}`);
    }

    const { ok, mismatches } = assertDefaultsInDts({
      dtsText,
      interfaceName: t.interfaceName,
      defaults: defaultsObj as Record<string, unknown>,
    });

    if (!ok) {
      anyMismatch = true;
      for (const m of mismatches) {
        const place = `${name}: ${t.interfaceName}.${m.prop}`;
        const msg = m.found
          ? `expected @default ${m.expected} (found ${m.found})`
          : `expected @default ${m.expected} (missing)`;
        console.error(`[docdefaults] ${place} ${msg}`);
      }
    }
  }

  if (anyMismatch) {
    const err: any = new Error('docdefaults assert failed');
    err.code = 1;
    throw err;
  }
}

// ===== Internals =====

async function loadConfigResolved(configPath: string | undefined, opts: RunOptions) {
  const repoRoot = (opts.repoRoot ? path.resolve(opts.repoRoot) : process.cwd());
  const cfgPath = await findConfigPath(repoRoot, configPath);
  if (!cfgPath) {
    throw new Error(
      `[docdefaults] config file not found. Looked for docdefaults.config.(mjs|cjs|js|ts) from ${repoRoot}`
    );
  }
  const cfg = await importConfig(cfgPath, { repoRoot, tsMode: opts.tsMode });
  validateConfig(cfg, cfgPath);
  if (opts.debugPaths) {
    console.log(`[docdefaults:debug] configPath=${cfgPath}`);
    console.log(`[docdefaults:debug] repoRoot=${repoRoot}`);
    console.log(`[docdefaults:debug] defaultsModulePathAbs=${path.resolve(repoRoot, cfg.defaultsModulePath)}`);
  }
  return { cfg, repoRoot };
}

function validateConfig(raw: any, cfgPath: string): asserts raw is DocDefaultsConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`[docdefaults] invalid config at ${cfgPath}`);
  const cfg = (raw.default ?? raw) as DocDefaultsConfig;
  if (!cfg || typeof cfg !== 'object') throw new Error(`[docdefaults] invalid config export at ${cfgPath}`);
  if (!cfg.defaultsModulePath || !cfg.targets) {
    throw new Error(`[docdefaults] config must include "defaultsModulePath" and "targets" at ${cfgPath}`);
  }
  // lightweight shape check:
  if (!Array.isArray(cfg.targets)) throw new Error(`[docdefaults] "targets" must be an array`);
  for (const t of cfg.targets) {
    if (!t || typeof t !== 'object') throw new Error(`[docdefaults] each target must be an object`);
    if (!t.srcPath || !t.interfaceName || !t.defaultsRef) {
      throw new Error(
        `[docdefaults] target missing required fields (need "srcPath", "interfaceName", "defaultsRef")`
      );
    }
  }
  // ok
  Object.assign(raw, { default: cfg }); // keep defaulted
}

async function resolveTsconfigPathAbs(repoRoot: string, tsconfigPath?: string) {
  if (tsconfigPath) {
    return path.resolve(repoRoot, tsconfigPath);
  }
  return await findNearestTsconfig(repoRoot);
}

/**
 * Infer the .d.ts path from srcPath using tsconfig's rootDir & declarationDir when dtsPath is not provided.
 * Example: srcPath="src/consent/types.ts", rootDir="src", declarationDir="dist/types"
 * → dist/types/consent/types.d.ts
 */
async function resolveDtsPathAbs(args: {
  repoRoot: string;
  tsRootDir?: string;
  tsDeclarationDir?: string;
  srcPath: string;
  dtsPath?: string;
}) {
  const { repoRoot, tsRootDir, tsDeclarationDir, srcPath, dtsPath } = args;
  if (dtsPath) return path.resolve(repoRoot, dtsPath);
  if (!tsRootDir || !tsDeclarationDir) {
    throw new Error(
      `[docdefaults] could not infer .d.ts for ${srcPath}. Ensure tsconfig has "rootDir" and "declarationDir", or provide "dtsPath".`
    );
  }
  const srcAbs = path.resolve(repoRoot, srcPath);
  const relFromRoot = path.relative(tsRootDir, srcAbs); // e.g. consent/types.ts
  const out = path.resolve(tsDeclarationDir, relFromRoot).replace(/\.tsx?$/i, '.d.ts');
  return out;
}

/** Get a (possibly dotted) symbol from a module object. e.g. "DEFAULTS" or "DEFAULTS.consent" */
function selectDefaults(mod: any, pathExpr: string): unknown {
  const parts = pathExpr.split('.');
  let cur = mod;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  // if the symbol is the default export itself
  if (cur == null && parts.length === 1 && (mod?.default != null)) {
    cur = mod.default[parts[0]];
  }
  return cur;
}

function rel(base: string, p: string) {
  return path.relative(base, p) || '.';
}

// ===== Config loader (supports mjs/cjs/js/ts) =====

async function findConfigPath(startDir: string, explicit?: string) {
  if (explicit) return path.resolve(explicit);

  const candidates = [
    'docdefaults.config.mjs',
    'docdefaults.config.cjs',
    'docdefaults.config.js',
    'docdefaults.config.ts',
  ];

  let dir = startDir;
  // walk up until filesystem root
  while (true) {
    for (const name of candidates) {
      const p = path.join(dir, name);
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

async function importConfig(cfgAbs: string, opts: { repoRoot: string; tsMode?: TsMode }) {
  const ext = path.extname(cfgAbs).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') {
    // import .ts config via the same smart loader (tsx if available)
    const mod = await loadModuleSmart(cfgAbs, {
      repoRoot: opts.repoRoot,
      tsMode: opts.tsMode ?? 'auto',
    });
    return mod.default ?? mod;
  }
  const mod = await import(pathToFileURL(cfgAbs).href);
  return mod.default ?? mod;
}








// export async function inject(configPathOrObj?: string | object, opts: RunOptions = {}): Promise<InjectResult> {
//   const repoRoot = opts.repoRoot ?? process.cwd();
//   const cfg = await loadConfig(configPathOrObj);
//   const preferredTag = cfg.defaultTag ?? 'default';

//   // load constants module once
//   const defaultsModulePathAbs = path.resolve(repoRoot, cfg.defaultsModulePath);
//   const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
//     repoRoot,
//     tsMode: opts.tsMode,        // 'auto'|'on'|'off' respected by your loader
//     // ...pass any tsRoot/outDir/declarationDir if you gather them elsewhere
//   });

//   let totalUpdated = 0;
//   const perTarget: InjectTargetResult[] = [];

//   for (const target of cfg.targets) {
//     const dtsPathRel = path.resolve(repoRoot, target.dtsPath);
//     let dtsText = await readFile(dtsPathRel, 'utf8');

//     // find properties in this interface
//     const props = listInterfaceProps(dtsText, target.interface);

//     // ▶ throw here if the interface doesn’t exist in this d.ts
//     if (props.length === 0) {
//       const dtsPath = path.relative(repoRoot, dtsPathRel);
//       throw new Error(`Interface "${target.interface}" not found in ${dtsPath}`);
//     }

//     // For this target, compute updates
//     let updatedCount = 0;
//     const missing: Array<{ prop: string }> = [];

//     // You likely have a map of propName -> path-in-constants (or direct values)
//     // I’ll assume `target.map` looks like { propName: "CONSENT_DEFAULTS.requireExplicit" }.
//     for (const p of props) {
//       const pathOrLiteral = (target as any).map?.[p.name];
//       if (!pathOrLiteral) {
//         // property not in config map — you can choose to ignore or mark missing
//         continue;
//       }

//       // Resolve the default value from constants (or treat as a literal if you support that)
//       let value: unknown;
//       if (typeof pathOrLiteral === 'string') {
//         value = resolvePathFromModule(defaultsModule, pathOrLiteral); // implement tiny dot-path resolver
//       } else {
//         value = pathOrLiteral; // if config allows raw values
//       }

//       const literal = formatDefaultLiteral(value); // returns `"foo"`, `true`, `42`, etc.

//       const before = dtsText;
//       dtsText = upsertDefaultForProp(
//         dtsText,
//         p.headStart,
//         p.indent,
//         literal,
//         preferredTag
//       );
//       if (dtsText !== before) updatedCount++;
//       else missing.push({ prop: p.name }); // couldn’t insert/replace (rare, but keep for report)
//     }

//     // write (unless dry)
//     if (!opts.dryRun) {
//       await writeFile(dtsPathRel, dtsText, 'utf8');
//     }

//     totalUpdated += updatedCount;
//     perTarget.push({
//       interfaceName: target.interface,
//       dtsPath: path.relative(repoRoot, dtsPathRel),
//       updated: updatedCount,
//       missing,
//     });
//   }

//   return {
//     updated: totalUpdated,
//     projectLabel: cfg.label, // optional nice label for CLI
//     targetResults: perTarget,
//   };
// }

// // tiny safe resolver "A.B.C" from a module object
// function resolvePathFromModule(mod: any, dotPath: string): unknown {
//   return dotPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), mod);
// }

// /**
//  * Asserts that @default literals are in sync across all targets.
//  * Throws when any mismatch is found (prints a concise report).
//  */
// export async function assert(configPath?: string, opts: RunOptions = {}) {
//   const { cfg, repoRoot } = await loadConfigResolved(configPath, opts);
//   const tsconfigAbs = await resolveTsconfigAbs(repoRoot, cfg.tsconfigPath);
//   const ts = readtsPathRels(tsconfigAbs);

//   const defaultsModulePathAbs = path.resolve(repoRoot, cfg.defaultsModulePath);
//   const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
//     repoRoot,
//     tsRootDir: ts.rootDir,
//     tsOutDir: ts.outDir,
//     tsDeclarationDir: ts.declarationDir,
//     tsMode: opts.tsMode,
//     quiet: opts.quiet,
//   });

//   let anyMismatch = false;
//   for (const t of cfg.targets) {
//     const name = t.name ?? t.interfaceName;
//     const dtsPathAbs = await resolveDtsPathAbs({
//       repoRoot,
//       tsRootDir: ts.rootDir,
//       tsDeclarationDir: ts.declarationDir,
//       srcPath: t.srcPath,
//       dtsPath: t.dtsPath,
//     });

//     const defaultsObj = selectDefaults(defaultsModule, t.defaultsRef);
//     if (!defaultsObj || typeof defaultsObj !== 'object') {
//       throw new Error(
//         `[docdefaults] ${name}: defaults symbol "${t.defaultsRef}" not found or not an object in ${rel(repoRoot, defaultsModulePathAbs)}`
//       );
//     }

//     let dtsText: string;
//     try {
//       dtsText = await fs.readFile(dtsPathAbs, 'utf8');
//     } catch {
//       throw new Error(`[docdefaults] ${name}: .d.ts not found at ${rel(repoRoot, dtsPathAbs)}`);
//     }

//     const { ok, mismatches } = assertDefaultsInDts({
//       dtsText,
//       interfaceName: t.interfaceName,
//       defaults: defaultsObj as Record<string, unknown>,
//     });

//     if (!ok) {
//       anyMismatch = true;
//       for (const m of mismatches) {
//         const place = `${name}: ${t.interfaceName}.${m.prop}`;
//         const msg = m.found
//           ? `expected @default ${m.expected} (found ${m.found})`
//           : `expected @default ${m.expected} (missing)`;
//         console.error(`[docdefaults] ${place} ${msg}`);
//       }
//     }
//   }

//   if (anyMismatch) {
//     const err: any = new Error('docdefaults assert failed');
//     err.code = 1;
//     throw err;
//   }
// }

// // ===== Internals =====

// async function loadConfigResolved(configPath: string | undefined, opts: RunOptions) {
//   const repoRoot = (opts.repoRoot ? path.resolve(opts.repoRoot) : process.cwd());
//   const cfgPath = await findConfigPath(repoRoot, configPath);
//   if (!cfgPath) {
//     throw new Error(
//       `[docdefaults] config file not found. Looked for docdefaults.config.(mjs|cjs|js|ts) from ${repoRoot}`
//     );
//   }
//   const cfg = await importConfig(cfgPath, { repoRoot, tsMode: opts.tsMode });
//   validateConfig(cfg, cfgPath);
//   if (opts.debugPaths) {
//     console.log(`[docdefaults:debug] configPath=${cfgPath}`);
//     console.log(`[docdefaults:debug] repoRoot=${repoRoot}`);
//     console.log(`[docdefaults:debug] defaultsModulePathAbs=${path.resolve(repoRoot, cfg.defaultsModulePath)}`);
//   }
//   return { cfg, repoRoot };
// }

// function validateConfig(raw: any, cfgPath: string): asserts raw is DocDefaultsConfig {
//   if (!raw || typeof raw !== 'object') throw new Error(`[docdefaults] invalid config at ${cfgPath}`);
//   const cfg = (raw.default ?? raw) as DocDefaultsConfig;
//   if (!cfg || typeof cfg !== 'object') throw new Error(`[docdefaults] invalid config export at ${cfgPath}`);
//   if (!cfg.defaultsModulePath || !cfg.targets) {
//     throw new Error(`[docdefaults] config must include "defaultsModulePath" and "targets" at ${cfgPath}`);
//   }
//   // lightweight shape check:
//   if (!Array.isArray(cfg.targets)) throw new Error(`[docdefaults] "targets" must be an array`);
//   for (const t of cfg.targets) {
//     if (!t || typeof t !== 'object') throw new Error(`[docdefaults] each target must be an object`);
//     if (!t.srcPath || !t.interfaceName || !t.defaultsRef) {
//       throw new Error(
//         `[docdefaults] target missing required fields (need "srcPath", "interfaceName", "defaultsRef")`
//       );
//     }
//   }
//   // ok
//   Object.assign(raw, { default: cfg }); // keep defaulted
// }

// async function resolveTsconfigAbs(repoRoot: string, tsconfigPath?: string) {
//   if (tsconfigPath) {
//     return path.resolve(repoRoot, tsconfigPath);
//   }
//   return await findNearestTsconfig(repoRoot);
// }

// /**
//  * Infer the .d.ts path from srcPath using tsconfig's rootDir & declarationDir when dtsPath is not provided.
//  * Example: srcPath="src/consent/types.ts", rootDir="src", declarationDir="dist/types"
//  * → dist/types/consent/types.d.ts
//  */
// async function resolveDtsPathAbs(args: {
//   repoRoot: string;
//   tsRootDir?: string;
//   tsDeclarationDir?: string;
//   srcPath: string;
//   dtsPath?: string;
// }) {
//   const { repoRoot, tsRootDir, tsDeclarationDir, srcPath, dtsPath } = args;
//   if (dtsPath) return path.resolve(repoRoot, dtsPath);
//   if (!tsRootDir || !tsDeclarationDir) {
//     throw new Error(
//       `[docdefaults] could not infer .d.ts for ${srcPath}. Ensure tsconfig has "rootDir" and "declarationDir", or provide "dtsPath".`
//     );
//   }
//   const srcAbs = path.resolve(repoRoot, srcPath);
//   const relFromRoot = path.relative(tsRootDir, srcAbs); // e.g. consent/types.ts
//   const out = path.resolve(tsDeclarationDir, relFromRoot).replace(/\.tsx?$/i, '.d.ts');
//   return out;
// }

// /** Get a (possibly dotted) symbol from a module object. e.g. "DEFAULTS" or "DEFAULTS.consent" */
// function selectDefaults(mod: any, pathExpr: string): unknown {
//   const parts = pathExpr.split('.');
//   let cur = mod;
//   for (const p of parts) {
//     if (cur == null) return undefined;
//     cur = cur[p];
//   }
//   // if the symbol is the default export itself
//   if (cur == null && parts.length === 1 && (mod?.default != null)) {
//     cur = mod.default[parts[0]];
//   }
//   return cur;
// }

// function rel(base: string, p: string) {
//   return path.relative(base, p) || '.';
// }

// // ===== Config loader (supports mjs/cjs/js/ts) =====

// async function findConfigPath(startDir: string, explicit?: string) {
//   if (explicit) return path.resolve(explicit);

//   const candidates = [
//     'docdefaults.config.mjs',
//     'docdefaults.config.cjs',
//     'docdefaults.config.js',
//     'docdefaults.config.ts',
//   ];

//   let dir = startDir;
//   // walk up until filesystem root
//   while (true) {
//     for (const name of candidates) {
//       const p = path.join(dir, name);
//       try {
//         await fs.access(p);
//         return p;
//       } catch {}
//     }
//     const parent = path.dirname(dir);
//     if (parent === dir) break;
//     dir = parent;
//   }
//   return undefined;
// }

// async function importConfig(cfgAbs: string, opts: { repoRoot: string; tsMode?: TsMode }) {
//   const ext = path.extname(cfgAbs).toLowerCase();
//   if (ext === '.ts' || ext === '.tsx') {
//     // import .ts config via the same smart loader (tsx if available)
//     const mod = await loadModuleSmart(cfgAbs, {
//       repoRoot: opts.repoRoot,
//       tsMode: opts.tsMode ?? 'auto',
//     });
//     return mod.default ?? mod;
//   }
//   const mod = await import(pathToFileURL(cfgAbs).href);
//   return mod.default ?? mod;
// }
