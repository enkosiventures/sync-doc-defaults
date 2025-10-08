import fs from 'node:fs';
import path from 'node:path';
import type { TsMode, LoadedTsProject } from '../types.js';
import { TSCONFIG_FILENAME_CANDIDATES } from '../constants.js';


export function findNearestTsconfig(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    for (const name of TSCONFIG_FILENAME_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadTsProject(tsconfigPathAbs: string | undefined): LoadedTsProject {
  if (!tsconfigPathAbs) return { projectRoot: process.cwd() };
  const dir = path.dirname(tsconfigPathAbs);
  try {
    const raw = JSON.parse(fs.readFileSync(tsconfigPathAbs, 'utf8'));
    const co = raw?.compilerOptions ?? {};
    return {
      projectRoot: dir,
      tsconfigPathAbs,
      rootDir: co.rootDir ? path.resolve(dir, co.rootDir) : undefined,
      outDir: co.outDir ? path.resolve(dir, co.outDir) : undefined,
      declarationDir: co.declarationDir ? path.resolve(dir, co.declarationDir) : undefined,
      tsMode: co.tsMode as TsMode | undefined,
    };
  } catch {
    return { projectRoot: dir, tsconfigPathAbs };
  }
}

export function inferDtsFromSrc(ts: LoadedTsProject, srcAbs: string): string | undefined {
  const outBase = ts.declarationDir ?? ts.outDir;
  const root = ts.rootDir;
  if (!outBase || !root) return undefined;
  const rel = path.relative(root, srcAbs);
  if (rel.startsWith('..')) return undefined;
  return path.resolve(outBase, replaceExt(rel, '.d.ts'));
}

export function inferBuiltJsForTs(args: {
  tsRootDir?: string;
  tsOutDir?: string;
  tsDeclarationDir?: string;
  repoRoot: string;
  tsFileAbs: string;
}): string | undefined {
  const { tsRootDir, tsOutDir, tsDeclarationDir, tsFileAbs } = args;
  const outBase = tsOutDir ?? tsDeclarationDir;
  const root = tsRootDir;
  if (!outBase || !root) return undefined;
  const relFromRoot = path.relative(root, tsFileAbs);
  if (relFromRoot.startsWith('..')) return undefined;
  return path.resolve(outBase, replaceExt(relFromRoot, '.js'));
}

export function replaceExt(p: string, newExt: string) {
  const i = p.lastIndexOf('.');
  return i === -1 ? p + newExt : p.slice(0, i) + newExt;
}
