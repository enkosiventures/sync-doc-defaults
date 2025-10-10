import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findNearestTsconfig,
  loadTsProject,
  inferDtsFromSrc,
  inferBuiltJsForTs
} from '../../src/infra/tsconfig-resolver.js';
import { createTempDirectory, write } from '../utils.js';


describe('tsconfig-resolver', () => {
  let tempDirPath: string;

  beforeEach(async () => {
    tempDirPath = await createTempDirectory();
  });

  afterEach(async () => {
    try { await fs.rm(tempDirPath, { recursive: true, force: true }); } catch {}
    tempDirPath = '';
  });

  it('findNearestTsconfig finds the closest ancestor', async () => {
    const rootTsconfig = path.join(tempDirPath, 'tsconfig.json');
    await write(rootTsconfig, JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'dist' } }));

    const deepDir = path.join(tempDirPath, 'packages/app/src/feature');
    await fs.mkdir(deepDir, { recursive: true });

    const found = findNearestTsconfig(deepDir);
    expect(found).toBe(rootTsconfig);
  });

  it('loadTsProject parses rootDir/outDir/declarationDir correctly', async () => {
    const tsconfigPath = path.join(tempDirPath, 'tsconfig.json');
    await write(tsconfigPath, JSON.stringify({
      compilerOptions: { rootDir: 'src', outDir: 'out', declarationDir: 'types' }
    }));

    const tsProject = loadTsProject(tsconfigPath);
    expect(tsProject.projectRoot).toBe(path.dirname(tsconfigPath));
    expect(tsProject.rootDir?.endsWith('/src') || tsProject.rootDir?.endsWith('\\src')).toBe(true);
    expect(tsProject.outDir?.endsWith('/out') || tsProject.outDir?.endsWith('\\out')).toBe(true);
    expect(tsProject.declarationDir?.endsWith('/types') || tsProject.declarationDir?.endsWith('\\types')).toBe(true);
  });

  it('inferDtsFromSrc maps src file -> emitted .d.ts under declarationDir/outDir', async () => {
    const tsconfigPath = path.join(tempDirPath, 'tsconfig.json');
    await write(tsconfigPath, JSON.stringify({
      compilerOptions: { rootDir: 'src', declarationDir: 'types' }
    }));
    const tsProject = loadTsProject(tsconfigPath);

    const srcAbs = path.join(tempDirPath, 'src/foo/bar.ts');
    await write(srcAbs, 'export {}');

    const dts = inferDtsFromSrc(tsProject, srcAbs);
    expect(dts).toBe(path.join(tempDirPath, 'types/foo/bar.d.ts'));
  });

  it('inferBuiltJsForTs maps TS file -> built JS using outDir (or declarationDir)', async () => {
    const tsRootDir = path.join(tempDirPath, 'src');
    const tsOutDir = path.join(tempDirPath, 'dist');
    const defaultsModulePathAbs = path.join(tempDirPath, 'src/utils/constants.ts');

    const built = inferBuiltJsForTs({
      tsRootDir,
      tsOutDir,
      tsDeclarationDir: undefined,
      repoRoot: tempDirPath,
      defaultsModulePathAbs,
    });
    expect(built).toBe(path.join(tempDirPath, 'dist/utils/constants.js'));
  });
});
