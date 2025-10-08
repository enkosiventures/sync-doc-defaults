
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  injectDefaultsIntoDts,
  assertDefaultsInDts,
  listInterfaceProps,
} from './dts-ops/index.js';

import type { DocDefaultsConfig, Options, PreferredTag, RunOptions, TsMode } from './types.js';
import { loadModuleSmart } from './infra/source-loader.js';
import { findNearestTsconfig, loadTsProject } from './infra/tsconfig-resolver.js';
import { resolveOptions } from './infra/config.js';
import { extractDeclarationBlock } from './dts-ops/dry-run-extract.js';
import { Logger } from './infra/log.js';
import { CONFIG_FILENAME_CANDIDATES } from './constants.js';


// ===== Public API =====

/**
 * Injects @default literals into all targets.
 * Throws on critical errors (missing interface, missing defaults symbol, etc.)
 */
export async function inject(configPath?: string, opts: RunOptions = {}) {
  const options = resolveOptions(opts);
  const logger = new Logger(options.quiet, options.debugPaths);
  const { cfg, repoRoot } = await loadConfigResolved(configPath, options);
  const tag: PreferredTag = opts.tag ?? cfg.tag ?? 'default';

  // Resolve TypeScript paths (rootDir/outDir/declarationDir)
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, cfg.tsconfig);
  const ts = loadTsProject(tsconfigPathAbs);

  // Load defaults module (built-js preferred, TS fallback via tsx)
  const defaultsModulePathAbs = validatePathWithinRoot(repoRoot, cfg.defaults, 'defaults');
  const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
    repoRoot,
    tsRootDir: ts.rootDir,
    tsOutDir: ts.outDir,
    tsDeclarationDir: ts.declarationDir,
    tsMode: options.tsMode,
    quiet: options.quiet,
    debug: options.debugPaths,
  });

  if (options.debugPaths) {
    console.log({
      projectRoot: ts.projectRoot,
      tsconfigPathAbs,
      rootDir: ts.rootDir,
      outDir: ts.outDir,
      declarationDir: ts.declarationDir,
      tsMode: options.tsMode,
    });
  }

  let totalUpdates = 0;
  for (const t of cfg.targets) {
    const name = t.name ?? t.interface;

    const srcAbs = validatePathWithinRoot(repoRoot, t.types, 'types');
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      typesPath: t.types,
      dtsPath: t.dts,
    });

    // defaults object for this target (flat { [prop]: value })
    const defaultsObj = selectDefaults(defaultsModule, t.member);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new Error(
        `[sync-doc-defaults] ${name}: defaults symbol "${t.member}" not found or not an object in ${rel(repoRoot, defaultsModulePathAbs)}`
      );
    }

    // read .d.ts
    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch {
      throw new Error(`[sync-doc-defaults] ${name}: .d.ts not found at ${rel(repoRoot, dtsPathAbs)}`);
    }

    // Ensure the requested interface exists; tests expect rejection when missing
    const props = listInterfaceProps(dtsText, t.interface);
    if (!props || props.length === 0) {
      throw new Error(
        `[sync-doc-defaults] ${name}: Interface "${t.interface}" not found in ${rel(repoRoot, dtsPathAbs)}`
      );
    }

    // inject
    const { updatedText, updatedCount, missing } = injectDefaultsIntoDts({
      dtsText,
      interfaceName: t.interface,
      defaults: defaultsObj as Record<string, unknown>,
      preferredTag: tag,
    });

    if (missing.length) {
      for (const m of missing) {
        logger.warn(`${name}: property "${m.prop}" not found in interface ${t.interface}`);
      }
    }

    if (updatedCount > 0) {
      totalUpdates += updatedCount;
      if (!opts.dryRun) {
        await fs.writeFile(dtsPathAbs, updatedText, 'utf8');
      } else {
        console.log(`--- [sync-doc-defaults] ${name}: updated .d.ts (dryRun) ---\n`);
        console.log(extractDeclarationBlock(updatedText, t.interface) ?? '(not found)');
        console.log(`\n--- end of ${name} ---\n`);
      }
      logger.log(`${name}: injected ${updatedCount} @${tag} update(s) → ${rel(repoRoot, dtsPathAbs)}`);
      
    } else {
      logger.log(`${name}: up-to-date`);
    }

    logger.dbg(
      `target="${name}" src=${rel(repoRoot, srcAbs)} dts=${rel(repoRoot, dtsPathAbs)} tsconfig=${tsconfigPathAbs}`
    );
  }

  return { updated: totalUpdates };
}

/**
 * Asserts that @default literals are in sync across all targets.
 * Throws when any mismatch is found (prints a concise report).
 */
export async function assert(configPath?: string, opts: RunOptions = {}) {
  const options = resolveOptions(opts);
  const logger = new Logger(options.quiet, options.debugPaths);
  const { cfg, repoRoot } = await loadConfigResolved(configPath, options);
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, cfg.tsconfig);
  const ts = loadTsProject(tsconfigPathAbs);

  const defaultsModulePathAbs = validatePathWithinRoot(repoRoot, cfg.defaults, 'defaults');
  const defaultsModule = await loadModuleSmart(defaultsModulePathAbs, {
    repoRoot,
    tsRootDir: ts.rootDir,
    tsOutDir: ts.outDir,
    tsDeclarationDir: ts.declarationDir,
    tsMode: options.tsMode,
    quiet: options.quiet,
    debug: options.debugPaths,
  });

  let anyMismatch = false;
  for (const t of cfg.targets) {
    const name = t.name ?? t.interface;
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      typesPath: t.types,
      dtsPath: t.dts,
    });

    const defaultsObj = selectDefaults(defaultsModule, t.member);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new Error(
        `[sync-doc-defaults] ${name}: defaults symbol "${t.member}" not found or not an object in ${rel(repoRoot, defaultsModulePathAbs)}`
      );
    }

    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch {
      throw new Error(`[sync-doc-defaults] ${name}: .d.ts not found at ${rel(repoRoot, dtsPathAbs)}`);
    }

    const { ok, mismatches } = assertDefaultsInDts({
      dtsText,
      interfaceName: t.interface,
      defaults: defaultsObj as Record<string, unknown>,
    });

    if (!ok) {
      anyMismatch = true;
      for (const m of mismatches) {
        const place = `${name}: ${t.interface}.${m.prop}`;
        const msg = m.found
          ? `expected @default ${m.expected} (found ${m.found})`
          : `expected @default ${m.expected} (missing)`;
        logger.error(`${place} ${msg}`);
      }
    }
  }

  if (anyMismatch) {
    const err: any = new Error('sync-doc-defaults assert failed');
    err.code = 1;
    throw err;
  }
}

// ===== Internals =====

function validatePathWithinRoot(rootDir: string, targetPath: string, label: string): string {
  const resolved = path.resolve(rootDir, targetPath);
  const normalizedRoot = path.normalize(rootDir) + path.sep;
  const normalizedResolved = path.normalize(resolved) + (resolved.endsWith(path.sep) ? path.sep : '');
  
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(`[sync-doc-defaults] Security: ${label} path escapes project root: ${targetPath}`);
  }
  return resolved;
}

async function loadConfigResolved(configPath: string | undefined, opts: Options) {
  const logger = new Logger(opts.quiet, opts.debugPaths);
  const repoRoot = opts.repoRoot;
  const cfgPath = await findConfigPath(repoRoot, configPath);
  if (!cfgPath) {
    throw new Error(
      `[sync-doc-defaults] config file not found. Looked for docdefaults.config.(mjs|cjs|js|ts|json) from ${repoRoot}`
    );
  }
  const cfg = await importConfig(
    cfgPath,
    {
      repoRoot,
      tsMode: opts.tsMode,
      quiet: opts.quiet,
      debug: opts.debugPaths,
    }
  );
  validateConfig(cfg, cfgPath);
  logger.dbg(`configPath=${cfgPath}`);
  logger.dbg(`repoRoot=${repoRoot}`);
  logger.dbg(`defaultsModulePathAbs=${path.resolve(repoRoot, cfg.defaults)}`);
  return { cfg, repoRoot };
}

function validateConfig(raw: any, cfgPath: string): asserts raw is DocDefaultsConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`[sync-doc-defaults] invalid config at ${cfgPath}`);
  const cfg = (raw.default ?? raw) as DocDefaultsConfig;
  if (!cfg || typeof cfg !== 'object') throw new Error(`[sync-doc-defaults] invalid config export at ${cfgPath}`);
  if (!cfg.defaults || !cfg.targets) {
    // throw new Error(`[sync-doc-defaults] config must include "defaults" and "targets" at ${cfgPath}`);
    throw new Error(`[sync-doc-defaults] Could not load config at ${cfgPath}: must include "defaults" and "targets"`);
  }
  // lightweight shape check:
  if (!Array.isArray(cfg.targets)) throw new Error(`[sync-doc-defaults] "targets" must be an array`);
  for (const t of cfg.targets) {
    if (!t || typeof t !== 'object') throw new Error(`[sync-doc-defaults] each target must be an object`);
    if (!t.types || !t.interface || !t.member) {
      throw new Error(
        `[sync-doc-defaults] target missing required fields (need "types", "interface", "member")`
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
  typesPath: string;
  dtsPath?: string;
}) {
  const { repoRoot, tsRootDir, tsDeclarationDir, typesPath, dtsPath } = args;
  if (dtsPath) return validatePathWithinRoot(repoRoot, dtsPath, 'dts');
  if (!tsRootDir || !tsDeclarationDir) {
    throw new Error(
      `[sync-doc-defaults] could not infer .d.ts for ${typesPath}. Ensure tsconfig has "rootDir" and "declarationDir", or provide "dtsPath".`
    );
  }
  const srcAbs = validatePathWithinRoot(repoRoot, typesPath, 'types');
  const relFromRoot = path.relative(tsRootDir, srcAbs); // e.g. consent/types.ts
  const out = path.resolve(tsDeclarationDir, relFromRoot).replace(/\.tsx?$/i, '.d.ts');
  return out;
}

/** Get a (possibly dotted) symbol from a module object. e.g. "DEFAULTS" or "DEFAULTS.consent" */
function selectDefaults(mod: any, pathExpr: string): unknown {
  const parts = pathExpr.split('.');
  let cur = mod;
  
  try {
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    
    // if the symbol is the default export itself
    if (cur == null && parts.length === 1 && (mod?.default != null)) {
      try {
        cur = mod.default[parts[0]];
      } catch (_) {
        // Getter on default export threw
        return undefined;
      }
    }
  } catch (e) {
    // Getter or proxy trap threw while accessing property
    console.error(`[sync-doc-defaults] Error accessing defaults path "${pathExpr}":`, e);
    return undefined;
  }
  
  return cur;
}

function rel(base: string, p: string) {
  return path.relative(base, p) || '.';
}

// ===== Config loader (supports mjs/cjs/js/ts) =====

async function findConfigPath(startDir: string, explicit?: string) {
  if (explicit) return path.resolve(explicit);

  let dir = startDir;
  // walk up until filesystem root
  while (true) {
    for (const name of CONFIG_FILENAME_CANDIDATES) {
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

async function importConfig(cfgAbs: string, opts: { repoRoot: string; tsMode?: TsMode; quiet?: boolean; debug?: boolean }) {
  const ext = path.extname(cfgAbs).toLowerCase();
  if (ext === '.json') {
    const raw = await fs.readFile(cfgAbs, 'utf8');
    return JSON.parse(raw);
  }
  if (ext === '.ts' || ext === '.tsx') {
    // import .ts config via the same smart loader (tsx if available)
    const mod = await loadModuleSmart(cfgAbs, {
      repoRoot: opts.repoRoot,
      tsMode: opts.tsMode ?? 'auto',
      quiet: opts.quiet,
      debug: opts.debug,
    });
    return mod.default ?? mod;
  }
  const mod = await import(pathToFileURL(cfgAbs).href);
  return mod.default ?? mod;
}
