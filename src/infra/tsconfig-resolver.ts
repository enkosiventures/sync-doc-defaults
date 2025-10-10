import fs from 'node:fs';
import path from 'node:path';
import type { TsMode, LoadedTsProject } from '../types.js';
import { TSCONFIG_FILENAME_CANDIDATES } from '../constants.js';


export function findNearestTsconfig(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    for (const name of TSCONFIG_FILENAME_CANDIDATES) {
      const pathFromStart = path.join(dir, name);
      if (fs.existsSync(pathFromStart)) return pathFromStart;
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
    const options = raw?.compilerOptions ?? {};
    return {
      projectRoot: dir,
      tsconfigPathAbs,
      rootDir: options.rootDir ? path.resolve(dir, options.rootDir) : undefined,
      outDir: options.outDir ? path.resolve(dir, options.outDir) : undefined,
      declarationDir: options.declarationDir ? path.resolve(dir, options.declarationDir) : undefined,
      tsMode: options.tsMode as TsMode | undefined,
    };
  } catch {
    return { projectRoot: dir, tsconfigPathAbs };
  }
}

export function inferDtsFromSrc(ts: LoadedTsProject, srcAbs: string): string | undefined {
  const outBase = ts.declarationDir ?? ts.outDir;
  const root = ts.rootDir;
  if (!outBase || !root) return undefined;
  const relativePath = path.relative(root, srcAbs);
  if (relativePath.startsWith('..')) return undefined;
  return path.resolve(outBase, replaceExtension(relativePath, '.d.ts'));
}

export function inferBuiltJsForTs(args: {
  tsRootDir?: string;
  tsOutDir?: string;
  tsDeclarationDir?: string;
  repoRoot: string;
  defaultsModulePathAbs: string;
}): string | undefined {
  const { tsRootDir, tsOutDir, tsDeclarationDir, defaultsModulePathAbs } = args;
  const outBase = tsOutDir ?? tsDeclarationDir;
  const root = tsRootDir;
  if (!outBase || !root) return undefined;
  const relativePathFromRoot = path.relative(root, defaultsModulePathAbs);
  if (relativePathFromRoot.startsWith('..')) return undefined;
  return path.resolve(outBase, replaceExtension(relativePathFromRoot, '.js'));
}

function replaceExtension(pathStr: string, newExtension: string) {
  const i = pathStr.lastIndexOf('.');
  return i === -1 ? pathStr + newExtension : pathStr.slice(0, i) + newExtension;
}
