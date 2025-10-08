import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { inferBuiltJsForTs } from './tsconfig-resolver.js';
import { Logger } from './log.js';


function resolveTsxFrom(repoRoot: string): string | undefined {
  try {
    // resolve from consumer project first
    const requireFromUser = createRequire(path.join(repoRoot, 'package.json'));
    return requireFromUser.resolve('tsx/esm');
  } catch {}
  try {
    // fallback: resolve from this package (unlikely needed)
    const requireSelf = createRequire(import.meta.url);
    return requireSelf.resolve('tsx/esm');
  } catch {}
  return undefined;
}

export async function loadModuleSmart(
  defaultsModulePathAbs: string,
  opts: {
    repoRoot: string;
    tsRootDir?: string;
    tsOutDir?: string;
    tsDeclarationDir?: string;
    tsMode?: 'auto' | 'on' | 'off';
    quiet?: boolean;
    debug?: boolean;
  }
): Promise<any> {
  const logger = new Logger(opts.quiet, opts.debug);
  const ext = path.extname(defaultsModulePathAbs).toLowerCase();

  if (ext === '.json') {
    logger.log(`Loading JSON module ${rel(opts.repoRoot, defaultsModulePathAbs)}`);
    return JSON.parse(await fs.promises.readFile(defaultsModulePathAbs, 'utf8'));
  }

  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    logger.log(`Loading JS module ${rel(opts.repoRoot, defaultsModulePathAbs)}`);
    const mod = await import(pathToFileURL(defaultsModulePathAbs).href);
    return mod?.default ?? mod;
  }

  if (ext === '.ts' || ext === '.tsx') {
    logger.log(`Loading TS/TSX module ${rel(opts.repoRoot, defaultsModulePathAbs)}`);
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
      tsFileAbs: defaultsModulePathAbs,
    });

    if (built && fs.existsSync(built)) {
      try {
        const mod = await import(pathToFileURL(built).href);
        return mod?.default ?? mod;
      } catch (err: any) {
        logger.warn(
          `Failed to import built JS ${rel(
            opts.repoRoot,
            built
          )} (will try fallback options).\n→ ${String(err?.message || err)}`
        );
        // 1a) Optional CJS fallback if a .cjs twin exists
        const cjs = built.replace(/\.js$/i, '.cjs');
        if (fs.existsSync(cjs)) {
          logger.log(`Attempting to load .cjs fallback ${rel(opts.repoRoot, cjs)}`);
          const req = createRequire(path.join(opts.repoRoot, 'package.json'));
          const m = req(cjs);
          return (m && m.__esModule) ? (m.default ?? m) : m;
        }

        // 1b) If TS is allowed, gracefully fallback to TS via tsx
        if (mode !== 'off') {
          const tsx = resolveTsxFrom(opts.repoRoot);
          if (tsx) {
            if (!opts.quiet) {
              logger.warn(
                `Built JS failed to import (${rel(
                  opts.repoRoot,
                  built
                )}); falling back to TS via tsx.\n→ ${String(err?.message || err)}`
              );
            }
            await import(pathToFileURL(tsx).href); // activate tsx loader
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
          // mode=off → respect user choice; rethrow with context
          const msg = String(err?.message || err);
          throw new Error(
            `[sync-doc-defaults] Failed to import built JS ${rel(
              opts.repoRoot,
              built
            )} (ts mode=off).\n` +
              `Fix your ESM imports (add ".js" to relative paths), or run with "--ts on" / SYNCDOCDEFAULTS_TS=on.\n` +
              `Original error: ${msg}`
          );
        }
      }
    }

    // 2) No built JS or couldn't use it → try TS if allowed
    if (mode !== 'off') {
      const tsx = resolveTsxFrom(opts.repoRoot);
      if (tsx) {
        await import(pathToFileURL(tsx).href);
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
      `Could not load ${rel(opts.repoRoot, defaultsModulePathAbs)}.\n` +
        `Either build your project (so the compiled JS exists), or install tsx (pnpm add -D tsx), or run with "--ts on".`
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

function rel(base: string, p: string) {
  return path.relative(base, p) || '.';
}
