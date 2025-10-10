import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { TsMode } from '../types.js';
import { inferBuiltJsForTs } from './tsconfig-resolver.js';
import { Logger } from './log.js';


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

export async function loadModuleSmart(
  defaultsModulePathAbs: string,
  opts: {
    repoRoot: string;
    tsRootDir?: string;
    tsOutDir?: string;
    tsDeclarationDir?: string;
    tsMode?: TsMode;
    quiet?: boolean;
    debug?: boolean;
  }
): Promise<any> {
  const logger = new Logger(opts.quiet, opts.debug);
  const ext = path.extname(defaultsModulePathAbs).toLowerCase();

  if (ext === '.json') {
    logger.dbg(`Loading JSON module ${getRelativePath(opts.repoRoot, defaultsModulePathAbs)}`);
    return JSON.parse(await fs.promises.readFile(defaultsModulePathAbs, 'utf8'));
  }

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    logger.dbg(`Loading JS module ${getRelativePath(opts.repoRoot, defaultsModulePathAbs)}`);
    try {
      const mod = await import(pathToFileURL(defaultsModulePathAbs).href);
      return mod?.default ?? mod;
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Helpful hints for common DX issues
      if (/To load an ES module|Unexpected token 'export'/.test(msg)) {
        throw new Error(
          `[sync-doc-defaults] The JS module appears to be ESM but is being loaded without ESM context.\n` +
          `Add {"type":"module"} to the nearest package.json or rename the file to ".mjs".\n` +
          `Path: ${defaultsModulePathAbs}\n` +
          `Original error: ${msg}`
        );
      }
      if (/ERR_MODULE_NOT_FOUND/.test(msg)) {
        throw new Error(
          `[sync-doc-defaults] Failed to import ${getRelativePath(opts.repoRoot, defaultsModulePathAbs)} due to a missing nested import.\n` +
          `If you're using ESM, ensure all relative imports include the ".js" extension (e.g., "./foo.js").\n` +
          `Original error: ${msg}`
        );
      }
      throw err;
    }
  }

  if (ext === '.ts' || ext === '.tsx') {
    logger.dbg(`Loading TS/TSX module ${getRelativePath(opts.repoRoot, defaultsModulePathAbs)}`);
    // Decide TS mode up-front so the built-JS path can fallback to TS when it fails.
    const mode =
      opts.tsMode ??
      (process.env.SYNCDOCDEFAULTS_TS === 'off'
        ? 'off'
        : process.env.SYNCDOCDEFAULTS_TS === 'on'
        ? 'on'
        : 'auto');

    // 1) Prefer compiled JS if we can infer it.
    const built = inferBuiltJsForTs({
      tsRootDir: opts.tsRootDir,
      tsOutDir: opts.tsOutDir,
      tsDeclarationDir: opts.tsDeclarationDir,
      repoRoot: opts.repoRoot,
      defaultsModulePathAbs,
    });

    if (built && fs.existsSync(built)) {
      try {
        const mod = await import(pathToFileURL(built).href);
        return mod?.default ?? mod;
      } catch (err: any) {
        logger.warn(
          `Failed to import built JS ${getRelativePath(
            opts.repoRoot,
            built
          )} (will try fallback options).\n→ ${String(err?.message || err)}`
        );
        // 1a) Optional CJS fallback if a .cjs twin exists
        const cjs = built.replace(/\.js$/i, '.cjs');
        if (fs.existsSync(cjs)) {
          logger.log(`Attempting to load .cjs fallback ${getRelativePath(opts.repoRoot, cjs)}`);
          const req = createRequire(path.join(opts.repoRoot, 'package.json'));
          const m = req(cjs);
          return (m && m.__esModule) ? (m.default ?? m) : m;
        }

        // 1b) If TS is allowed, gracefully fallback to TS via tsx
        if (mode !== 'off') {
          const tsxPath = resolveTsxFrom(opts.repoRoot);
          if (tsxPath) {
            if (!opts.quiet) {
              logger.warn(
                `Built JS failed to import (${getRelativePath(
                  opts.repoRoot,
                  built
                )}); falling back to TS via tsx.\n→ ${String(err?.message || err)}`
              );
            }
            logger.dbg?.(`tsx register: ${getRelativePath(opts.repoRoot, tsxPath)}`);
            await import(pathToFileURL(tsxPath).href); // activate tsx loader
            const mod = await import(pathToFileURL(defaultsModulePathAbs).href);
            return mod?.default ?? mod;
          }
          if (mode === 'on') {
            throw new Error(
              'SYNCDOCDEFAULTS_TS=on / --ts on set but "tsx" is not installed in the target project. Install with: pnpm add -D tsx'
            );
          }
          // mode=auto and no tsx → fall through to guidance below
        } else {
          // mode=off → respect user choice; rethrow with actionable context
          const msg = String(err?.message || err);
          throw new Error(
            `[sync-doc-defaults] Failed to import built JS ${getRelativePath(opts.repoRoot, built)} (ts mode=off).\n` +
            `Likely fixes:\n` +
            `  • If using ESM, add ".js" to all relative imports (e.g., "./util/logger.js").\n` +
            `  • Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to load TS via tsx.\n` +
            `  • Or install tsx locally: pnpm add -D tsx\n` +
            `Paths: rootDir=${opts.tsRootDir ?? '-'}  outDir=${opts.tsOutDir ?? '-'}  declarationDir=${opts.tsDeclarationDir ?? '-'}\n` +
            `Original error: ${msg}`
          );
        }
      }
    }

    // 2) No built JS or couldn't use it → try TS if allowed
    if (mode !== 'off') {
      const tsxPath = resolveTsxFrom(opts.repoRoot);
      if (tsxPath) {
        await import(pathToFileURL(tsxPath).href);
        const mod = await import(pathToFileURL(defaultsModulePathAbs).href);
        return mod?.default ?? mod;
      }
      if (mode === 'on') {
        throw new Error(
          'SYNCDOCDEFAULTS_TS=on / --ts on set but "tsx" is not installed in the target project. Install with: pnpm add -D tsx'
        );
      }
    }

    // 3) Helpful guidance (mode=off or tsx not available)
    throw new Error(
      `Could not load ${getRelativePath(opts.repoRoot, defaultsModulePathAbs)}.\n` +
      `Options:\n` +
      `  • Build your project so compiled JS exists in ${getRelativePath(opts.repoRoot, opts.tsOutDir ?? '<outDir>')}.\n` +
      `  • Or install tsx locally: pnpm add -D tsx\n` +
      `  • Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to force TS loading.\n`
    );
  }

  throw new Error(`Unsupported file extension for ${defaultsModulePathAbs}`);
}

export function getByPath(obj: any, pathStr: string): any {
  const segs = pathStr.split('.');
  let cur = obj;
  for (const s of segs) {
    if (cur == null) return undefined;
    cur = cur[s];
  }
  return cur;
}

export function assertPlainObject(val: any, ctx: string) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    throw new Error(`${ctx} must be a plain object (got ${val === null ? 'null' : typeof val})`);
  }
}

function getRelativePath(base: string, p: string) {
  return path.relative(base, p) || '.';
}
