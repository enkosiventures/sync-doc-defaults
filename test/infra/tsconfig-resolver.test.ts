import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  findNearestTsconfig,
  loadTsProject,
  inferDtsFromSrc,
  inferBuiltJsForTs
} from '../../src/infra/tsconfig-resolver.js';

let TMP = '';
async function mkTmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-tsc-'));
  return dir;
}
async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

describe('tsconfig-resolver', () => {
  beforeEach(async () => {
    TMP = await mkTmp();
  });

  afterEach(async () => {
    try { await fs.rm(TMP, { recursive: true, force: true }); } catch {}
    TMP = '';
  });

  it('findNearestTsconfig finds the closest ancestor', async () => {
    const rootTsconfig = path.join(TMP, 'tsconfig.json');
    await write(rootTsconfig, JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'dist' } }));

    const deepDir = path.join(TMP, 'packages/app/src/feature');
    await fs.mkdir(deepDir, { recursive: true });

    const found = findNearestTsconfig(deepDir);
    expect(found).toBe(rootTsconfig);
  });

  it('loadTsProject parses rootDir/outDir/declarationDir correctly', async () => {
    const tsc = path.join(TMP, 'tsconfig.json');
    await write(tsc, JSON.stringify({
      compilerOptions: { rootDir: 'src', outDir: 'out', declarationDir: 'types' }
    }));

    const ts = loadTsProject(tsc);
    expect(ts.projectRoot).toBe(path.dirname(tsc));
    expect(ts.rootDir?.endsWith('/src') || ts.rootDir?.endsWith('\\src')).toBe(true);
    expect(ts.outDir?.endsWith('/out') || ts.outDir?.endsWith('\\out')).toBe(true);
    expect(ts.declarationDir?.endsWith('/types') || ts.declarationDir?.endsWith('\\types')).toBe(true);
  });

  it('inferDtsFromSrc maps src file -> emitted .d.ts under declarationDir/outDir', async () => {
    const tsc = path.join(TMP, 'tsconfig.json');
    await write(tsc, JSON.stringify({
      compilerOptions: { rootDir: 'src', declarationDir: 'types' }
    }));
    const ts = loadTsProject(tsc);

    const srcAbs = path.join(TMP, 'src/foo/bar.ts');
    await write(srcAbs, 'export {}');

    const dts = inferDtsFromSrc(ts, srcAbs);
    expect(dts).toBe(path.join(TMP, 'types/foo/bar.d.ts'));
  });

  it('inferBuiltJsForTs maps TS file -> built JS using outDir (or declarationDir)', async () => {
    const tsRootDir = path.join(TMP, 'src');
    const tsOutDir = path.join(TMP, 'dist');
    const tsFileAbs = path.join(TMP, 'src/utils/constants.ts');

    const built = inferBuiltJsForTs({
      tsRootDir,
      tsOutDir,
      tsDeclarationDir: undefined,
      repoRoot: TMP,
      tsFileAbs,
    });
    expect(built).toBe(path.join(TMP, 'dist/utils/constants.js'));
  });
});
