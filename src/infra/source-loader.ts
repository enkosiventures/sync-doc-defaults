import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { TsMode } from '../types.js';
import { inferBuiltJsForTs } from './tsconfig-resolver.js';
import { createLogger } from './log.js';
import { SddError } from '../errors.js';
import { getRelativePath } from '../utils.js';


export function resolveTsxFrom(repoRoot: string): string | undefined {
  // Resolve relative to the target project ONLY
  const require = createRequire(path.join(repoRoot, 'package.json'));
  // Prefer the package entry; try esm entry as a fallback for older versions
  for (const id of ['tsx', 'tsx/esm']) {
    try {
      return require.resolve(id);
    } catch {}
  }
  return undefined;
}

/**
 * Intelligently loads a module (TypeScript or JavaScript) with automatic format detection and fallback strategies.
 * 
 * This function implements a sophisticated module loading strategy that prioritizes compiled JavaScript
 * when available but gracefully falls back to TypeScript source files when necessary. It handles the
 * complexity of mixed TypeScript/JavaScript projects where some files may be compiled and others not.
 * 
 * Loading priority:
 * 1. For `.json` files: Direct JSON.parse of file contents
 * 2. For `.js`, `.mjs`, `.cjs` files: Direct import (ESM or CJS via Node semantics)
 * 3. For `.ts`, `.tsx` files:
 *    a) try compiled JS inferred from tsconfig (rootDir/outDir/declarationDir)
 *    b) if that fails, try a `.cjs` twin next to the built JS (CJS fallback)
 *    c) if allowed and available, register `tsx` and import the TS source
 *    d) otherwise surface a guided error detailing likely fixes
 * 
 * @param defaultsModulePathAbs - Absolute path to the module to load
 * @param opts - Configuration options
 * @param opts.repoRoot - Repository root for relative path resolution
 * @param opts.tsRootDir - TypeScript rootDir from tsconfig (for inferring output paths)
 * @param opts.tsOutDir - TypeScript outDir from tsconfig (for finding compiled JS)
 * @param opts.tsDeclarationDir - TypeScript declarationDir (used as fallback for output inference)
 * @param opts.tsMode - How to handle TypeScript files:
 *                      'auto': Try compiled JS first, fall back to tsx if available
 *                      'on': Always use tsx for TS files (requires tsx installed)
 *                      'off': Never load TS directly, require compiled JS
 * @param opts.quiet - Suppress non-error log output
 * @param opts.debug - Enable detailed path resolution logging
 * 
 * @returns The loaded module (default export or full module object)
 * 
 * @throws {SddError} with codes:
 *    - `BUILT_JS_IMPORT_FAILED`   (e.g., ESM loaded without ESM context, missing .js extensions)
 *    - `TSX_NOT_INSTALLED`        (mode='on' but `tsx` is not present in the consumer project)
 *    - `COULD_NOT_LOAD_TS`        (no built JS; TS load disallowed/unavailable)
 *    - `INVALID_CONFIG`           (unsupported extension)
 * 
 * @example
 * // Load with automatic format detection
 * const defaults = await loadModuleSmart('/path/to/constants.ts', {
 *   repoRoot: '/project',
 *   tsRootDir: '/project/src',
 *   tsOutDir: '/project/dist',
 *   tsMode: 'auto'
 * });
 */
export async function loadModuleSmart(
  defaultsModulePathAbs: string,
  options: {
    repoRoot: string;
    tsRootDir?: string;
    tsOutDir?: string;
    tsDeclarationDir?: string;
    tsMode?: TsMode;
    quiet?: boolean;
    debug?: boolean;
  }
): Promise<any> {
  const logger = createLogger(options);
  const extension = path.extname(defaultsModulePathAbs).toLowerCase();

  if (extension === '.json') {
    logger.dbg(`Loading JSON module ${getRelativePath(options.repoRoot, defaultsModulePathAbs)}`);
    return JSON.parse(await fs.promises.readFile(defaultsModulePathAbs, 'utf8'));
  }

  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    logger.dbg(`Loading JS module ${getRelativePath(options.repoRoot, defaultsModulePathAbs)}`);
    try {
      const module = await import(pathToFileURL(defaultsModulePathAbs).href);
      return module?.default ?? module;
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Helpful hints for common DX issues
      if (/To load an ES module|Unexpected token 'export'/.test(msg)) {
        throw new SddError(
          'BUILT_JS_IMPORT_FAILED',
          `The JS module appears to be ESM but is being loaded without ESM context.\n` +
          `Add {"type":"module"} to the nearest package.json or rename the file to ".mjs".\n`,
          { cause: err,
            details: { context: { path: defaultsModulePathAbs } },
          }
        );
      }
      if (/ERR_MODULE_NOT_FOUND/.test(msg)) {
        throw new SddError(
          'BUILT_JS_IMPORT_FAILED',
          `Failed to import ${getRelativePath(options.repoRoot, defaultsModulePathAbs)} due to a missing nested import.\n` +
          `If you're using ESM, ensure all relative imports include the ".js" extension (e.g., "./foo.js").\n`,
          { cause: err }
        );
      }
      throw err;
    }
  }

  if (extension === '.ts' || extension === '.tsx') {
    logger.dbg(`Loading TS/TSX module ${getRelativePath(options.repoRoot, defaultsModulePathAbs)}`);
    // Decide TS mode up-front so the built-JS path can fallback to TS when it fails.
    const mode =
      options.tsMode ??
      (process.env.SYNCDOCDEFAULTS_TS === 'off'
        ? 'off'
        : process.env.SYNCDOCDEFAULTS_TS === 'on'
        ? 'on'
        : 'auto');

    // 1) Prefer compiled JS if we can infer it.
    const built = inferBuiltJsForTs({
      tsRootDir: options.tsRootDir,
      tsOutDir: options.tsOutDir,
      tsDeclarationDir: options.tsDeclarationDir,
      repoRoot: options.repoRoot,
      defaultsModulePathAbs,
    });

    if (built && fs.existsSync(built)) {
      try {
        const module = await import(pathToFileURL(built).href);
        return module?.default ?? module;
      } catch (err: any) {
        logger.warn(
          `Failed to import built JS ${getRelativePath(
            options.repoRoot,
            built
          )} (will try fallback options).\n→ ${String(err?.message || err)}`
        );
        // 1a) Optional CJS fallback if a .cjs twin exists
        const cjs = built.replace(/\.js$/i, '.cjs');
        if (fs.existsSync(cjs)) {
          logger.log(`Attempting to load .cjs fallback ${getRelativePath(options.repoRoot, cjs)}`);
          const req = createRequire(path.join(options.repoRoot, 'package.json'));
          const m = req(cjs);
          return (m && m.__esModule) ? (m.default ?? m) : m;
        }

        // 1b) If TS is allowed, gracefully fallback to TS via tsx
        if (mode !== 'off') {
          const tsxPath = resolveTsxFrom(options.repoRoot);
          if (tsxPath) {
            if (!options.quiet) {
              logger.warn(
                `Built JS failed to import (${getRelativePath(
                  options.repoRoot,
                  built
                )}); falling back to TS via tsx.\n→ ${String(err?.message || err)}`
              );
            }
            logger.dbg?.(`tsx register: ${getRelativePath(options.repoRoot, tsxPath)}`);
            await import(pathToFileURL(tsxPath).href); // activate tsx loader
            const module = await import(pathToFileURL(defaultsModulePathAbs).href);
            return module?.default ?? module;
          }
          if (mode === 'on') {
            throw new SddError(
              'TSX_NOT_INSTALLED',
              `ts mode is "on" but "tsx" is not installed in the target project.\n` +
              `Install with: pnpm add -D tsx`,
              { cause: err }
            );
          }
          // mode=auto and no tsx → fall through to guidance below
        } else {
          // mode=off → respect user choice; rethrow with actionable context
          throw new SddError(
            'BUILT_JS_IMPORT_FAILED',
            `Failed to import built JS ${getRelativePath(options.repoRoot, built)} (ts mode=off).\n` +
            `Likely fixes:\n` +
            `  • If using ESM, add ".js" to all relative imports (e.g., "./util/logger.js").\n` +
            `  • Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to load TS via tsx.\n` +
            `  • Or install tsx locally: pnpm add -D tsx\n`,
            { cause: err,
              details: { context: {
                tsRootDir: options.tsRootDir,
                tsOutDir: options.tsOutDir,
                tsDeclarationDir: options.tsDeclarationDir,
                tsMode: mode,
              } },
            }
          );
        }
      }
    }

    // 2) No built JS or couldn't use it → try TS if allowed
    if (mode !== 'off') {
      const tsxPath = resolveTsxFrom(options.repoRoot);
      if (tsxPath) {
        await import(pathToFileURL(tsxPath).href);
        const module = await import(pathToFileURL(defaultsModulePathAbs).href);
        return module?.default ?? module;
      }
      if (mode === 'on') {
        throw new SddError(
          'TSX_NOT_INSTALLED',
          `ts mode is "on" but "tsx" is not installed in the target project.\n` +
          `Install with: pnpm add -D tsx`,
        );
      }
    }

    // 3) Helpful guidance (mode=off or tsx not available)
    throw new SddError(
      'COULD_NOT_LOAD_TS',
      `Could not load ${getRelativePath(options.repoRoot, defaultsModulePathAbs)}.\n` +
      `Options:\n` +
      `  • Build your project so compiled JS exists in ${getRelativePath(options.repoRoot, options.tsOutDir ?? '<outDir>')}.\n` +
      `  • Or install tsx locally: pnpm add -D tsx\n` +
      `  • Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to force TS loading.\n`,
      { details: { context: {
          tsRootDir: options.tsRootDir,
          tsOutDir: options.tsOutDir,
          tsDeclarationDir: options.tsDeclarationDir,
          tsMode: mode,
        } },
      }
    );
  }

  throw new SddError(
    'INVALID_CONFIG',
    `Unsupported file extension for ${defaultsModulePathAbs}`,
  );
}
