
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
import { Logger, defaultLogger } from './infra/log.js';
import { CONFIG_FILENAME_CANDIDATES, LOG_PREFIX } from './constants.js';
import { SddError } from './errors.js';


// ===== Public API =====

/**
 * Injects runtime default values into TypeScript declaration files.
 * @param configPath - Path to configuration file
 * @param options - Runtime options
 * @returns Promise resolving to injection results
 * @throws {SddError} When config is invalid or files cannot be accessed
 */
export async function inject(configPath?: string, opts: RunOptions = {}) {
  const options = resolveOptions(opts);
  const logger = new Logger(options.quiet, options.debugPaths);
  const { config, repoRoot } = await loadConfigResolved(configPath, options);
  const tag: PreferredTag = opts.tag ?? config.tag ?? 'default';

  // Resolve TypeScript paths (rootDir/outDir/declarationDir)
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, config.tsconfig);
  const ts = loadTsProject(tsconfigPathAbs);

  // Load defaults module (built-js preferred, TS fallback via tsx)
  const defaultsModulePathAbs = validatePathWithinRoot(repoRoot, config.defaults, 'defaults');
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
    logger.log(String({
      projectRoot: ts.projectRoot,
      tsconfigPathAbs,
      rootDir: ts.rootDir,
      outDir: ts.outDir,
      declarationDir: ts.declarationDir,
      tsMode: options.tsMode,
    }));
  }

  let totalUpdates = 0;
  for (const target of config.targets) {
    const name = target.name ?? target.interface;

    const srcAbs = validatePathWithinRoot(repoRoot, target.types, 'types');
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      typesPath: target.types,
      dtsPath: target.dts,
    });

    // defaults object for this target (flat { [prop]: value })
    const defaultsObj = selectDefaults(defaultsModule, target.member);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new SddError(
        'DEFAULTS_SYMBOL_NOT_FOUND',
        `${name}: defaults symbol "${target.member}" not found or not an object in ${getRelativePath(repoRoot, defaultsModulePathAbs)}`,
        { details: { context: { path: defaultsModulePathAbs, member: target.member } } },
      );
    }

    // read .d.ts
    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch (err: any) {
      throw new SddError(
        'DTS_NOT_FOUND',
        `${name}: .d.ts not found at ${getRelativePath(repoRoot, dtsPathAbs)}`,
        { details: { context: { path: dtsPathAbs } }, cause: err },
      );
    }

    // Ensure the requested interface exists; tests expect rejection when missing
    const props = listInterfaceProps(dtsText, target.interface);
    if (!props || props.length === 0) {
      throw new SddError(
        'INTERFACE_NOT_FOUND',
        `${name}: Interface "${target.interface}" not found in ${getRelativePath(repoRoot, dtsPathAbs)}`,
        { details: { context: { path: dtsPathAbs } } },
      );
    }

    // inject
    const { updatedText, updatedCount, missing } = injectDefaultsIntoDts({
      dtsText,
      interfaceName: target.interface,
      defaults: defaultsObj as Record<string, unknown>,
      preferredTag: tag,
    });

    if (missing.length) {
      for (const m of missing) {
        logger.warn(`${name}: property "${m.prop}" not found in interface ${target.interface}`);
      }
    }

    if (updatedCount > 0) {
      totalUpdates += updatedCount;
      if (!opts.dryRun) {
        await fs.writeFile(dtsPathAbs, updatedText, 'utf8');
      } else {
        logger.log(`--- ${LOG_PREFIX} ${name}: updated .d.ts (dryRun) ---\n`, true);
        logger.log(extractDeclarationBlock(updatedText, target.interface) ?? '(not found)', true);
        logger.log(`\n--- end of ${name} ---\n`, true);
      }
      logger.log(`${name}: injected ${updatedCount} @${tag} update(s) → ${getRelativePath(repoRoot, dtsPathAbs)}`);
      
    } else {
      logger.log(`${name}: up-to-date`);
    }

    logger.dbg(
      `target="${name}" src=${getRelativePath(repoRoot, srcAbs)} dts=${getRelativePath(repoRoot, dtsPathAbs)} tsconfig=${tsconfigPathAbs}`
    );
  }

  return { updated: totalUpdates };
}

/**
 * Verifies that JSDoc @default tags in declaration files match runtime default values.
 * @param configPath - Path to configuration file. If omitted, searches upward from cwd
 * @param options - Runtime options for controlling behavior
 * @returns Promise that resolves if all defaults match
 * @throws {SddError} When any @default tag doesn't match the runtime value
 * @throws {SddError} When configuration is invalid or required files cannot be found
 * @example
 * // Check defaults are in sync
 * await assert('./docdefaults.config.mjs');
 * 
 * // Use in CI to ensure documentation stays current
 * await assert(undefined, { quiet: true });
 */
export async function assert(configPath?: string, opts: RunOptions = {}) {
  const options = resolveOptions(opts);
  const logger = new Logger(options.quiet, options.debugPaths);
  const { config, repoRoot } = await loadConfigResolved(configPath, options);
  const tsconfigPathAbs = await resolveTsconfigPathAbs(repoRoot, config.tsconfig);
  const ts = loadTsProject(tsconfigPathAbs);

  const defaultsModulePathAbs = validatePathWithinRoot(repoRoot, config.defaults, 'defaults');
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
  for (const target of config.targets) {
    const name = target.name ?? target.interface;
    const dtsPathAbs = await resolveDtsPathAbs({
      repoRoot,
      tsRootDir: ts.rootDir,
      tsDeclarationDir: ts.declarationDir,
      typesPath: target.types,
      dtsPath: target.dts,
    });

    const defaultsObj = selectDefaults(defaultsModule, target.member);
    if (!defaultsObj || typeof defaultsObj !== 'object') {
      throw new SddError(
        'DEFAULTS_SYMBOL_NOT_FOUND',
        `${name}: defaults symbol "${target.member}" not found or not an object in ${getRelativePath(repoRoot, defaultsModulePathAbs)}`,
        { details: { context: { path: defaultsModulePathAbs, member: target.member } } },
      );
    }

    let dtsText: string;
    try {
      dtsText = await fs.readFile(dtsPathAbs, 'utf8');
    } catch (err: any) {
      throw new SddError(
        'DTS_NOT_FOUND',
        `${name}: .d.ts not found at ${getRelativePath(repoRoot, dtsPathAbs)}`,
        { details: { context: { path: dtsPathAbs } }, cause: err },
      );
    }

    const { ok, mismatches } = assertDefaultsInDts({
      dtsText,
      interfaceName: target.interface,
      defaults: defaultsObj as Record<string, unknown>,
    });

    if (!ok) {
      anyMismatch = true;
      for (const m of mismatches) {
        const place = `${name}: ${target.interface}.${m.prop}`;
        const msg = m.found
          ? `expected @default ${m.expected} (found ${m.found})`
          : `expected @default ${m.expected} (missing)`;
        logger.error(`${place} ${msg}`);
      }
    }
  }

  if (anyMismatch) {
    throw new SddError(
      'ASSERT_FAILED',
      'assert failed',
    );
  }
}

// ===== Internals =====

function validatePathWithinRoot(rootDir: string, targetPath: string, label: string): string {
  const resolved = path.resolve(rootDir, targetPath);
  const normalizedRoot = path.normalize(rootDir) + path.sep;
  const normalizedResolved = path.normalize(resolved) + (resolved.endsWith(path.sep) ? path.sep : '');
  
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new SddError(
      'CLI_USAGE',
      `${label} path escapes project root: ${targetPath}`,
    );
  }
  return resolved;
}

async function loadConfigResolved(configPath: string | undefined, opts: Options) {
  const logger = new Logger(opts.quiet, opts.debugPaths);
  const repoRoot = opts.repoRoot;
  const configPathAbs = await findConfigPath(repoRoot, configPath);
  if (!configPathAbs) {
    throw new SddError(
      'CONFIG_NOT_FOUND',
      `Config file not found. Looked for docdefaults.config.(mjs|cjs|js|ts|json) from ${repoRoot}`,
    );
  }
  const config = await importConfig(
    configPathAbs,
    {
      repoRoot,
      tsMode: opts.tsMode,
      quiet: opts.quiet,
      debug: opts.debugPaths,
    }
  );
  validateConfig(config, configPathAbs);
  logger.dbg(`configPath=${configPathAbs}`);
  logger.dbg(`repoRoot=${repoRoot}`);
  logger.dbg(`defaultsModulePathAbs=${path.resolve(repoRoot, config.defaults)}`);
  return { config, repoRoot };
}

function validateConfig(raw: any, configPath: string): asserts raw is DocDefaultsConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`[sync-doc-defaults] invalid config at ${configPath}`);
  const config = (raw.default ?? raw) as DocDefaultsConfig;
  if (!config || typeof config !== 'object') throw new Error(`[sync-doc-defaults] invalid config export at ${configPath}`);
  if (!config.defaults || !config.targets) {
    throw new SddError(
      'INVALID_CONFIG',
      `Could not load config at ${configPath}: must include "defaults" and "targets"`,
      { details: { context: { path: configPath } } }
    );
  }
  // lightweight shape check:
  if (!Array.isArray(config.targets)) throw new SddError(
    'INVALID_CONFIG',
    `Could not load config at ${configPath}: "targets" must be an array`,
    { details: { context: { path: configPath } } },
  );
  for (const target of config.targets) {
    if (!target || typeof target !== 'object') throw new SddError(
      'INVALID_CONFIG',
      `Could not load config at ${configPath}: each target must be an object`,
      { details: { context: { path: configPath } } },
    );
    if (!target.types || !target.interface || !target.member) {
      throw new SddError(
        'INVALID_CONFIG',
        `Could not load config at ${configPath}: target missing required fields (need "types", "interface", "member")`,
        { details: { context: { path: configPath } } },
      );
    }
  }
  // ok
  Object.assign(raw, { default: config }); // keep defaulted
}

async function resolveTsconfigPathAbs(repoRoot: string, tsconfigPath?: string) {
  if (tsconfigPath) {
    return path.resolve(repoRoot, tsconfigPath);
  }
  return await findNearestTsconfig(repoRoot);
}

/**
 * Infers the output .d.ts path for a TypeScript source file based on tsconfig settings.
 * Uses the relationship between rootDir and declarationDir to map source to output.
 * @param args - Path resolution parameters
 * @returns Absolute path to the expected .d.ts file
 * @throws {SddError} When .d.ts location cannot be inferred and no explicit path provided
 * @example
 * // With rootDir="src", declarationDir="dist/types", typesPath="src/index.ts"
 * // Returns: "/absolute/path/to/dist/types/index.d.ts"
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
    throw new SddError(
      'CLI_USAGE',
      `Could not infer .d.ts for ${typesPath}. Ensure tsconfig has "rootDir" and "declarationDir", or provide "dts" in config`,
    );
  }
  const srcAbs = validatePathWithinRoot(repoRoot, typesPath, 'types');
  const relFromRoot = path.relative(tsRootDir, srcAbs); // e.g. consent/types.ts
  const out = path.resolve(tsDeclarationDir, relFromRoot).replace(/\.tsx?$/i, '.d.ts');
  return out;
}

/**
 * Resolves a (possibly nested) property from a module object using dot notation.
 * Handles ES module default exports and CommonJS interop.
 * @param mod - Module object to traverse
 * @param pathExpr - Dot-separated path (e.g., "DEFAULTS" or "config.defaults.ui")
 * @returns The resolved value, or undefined if not found or if a getter throws
 * @example
 * selectDefaults(module, "DEFAULTS") // returns module.DEFAULTS
 * selectDefaults(module, "config.nested.value") // returns module.config.nested.value
 */
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
    defaultLogger.error(`Error accessing defaults path "${pathExpr}":`, e);
    return undefined;
  }
  
  return cur;
}

function getRelativePath(base: string, p: string) {
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

async function importConfig(configPathAbs: string, opts: { repoRoot: string; tsMode?: TsMode; quiet?: boolean; debug?: boolean }) {
  const ext = path.extname(configPathAbs).toLowerCase();
  if (ext === '.json') {
    const raw = await fs.readFile(configPathAbs, 'utf8');
    return JSON.parse(raw);
  }
  if (ext === '.ts' || ext === '.tsx') {
    // import .ts config via the same smart loader (tsx if available)
    const mod = await loadModuleSmart(configPathAbs, {
      repoRoot: opts.repoRoot,
      tsMode: opts.tsMode ?? 'auto',
      quiet: opts.quiet,
      debug: opts.debug,
    });
    return mod.default ?? mod;
  }
  const mod = await import(pathToFileURL(configPathAbs).href);
  return mod.default ?? mod;
}
