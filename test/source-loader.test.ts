import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { loadModuleSmart, getByPath, assertPlainObject } from '../src/source-loader.js';

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
function tsxAvailable(cwd?: string): boolean {
  if (cwd) {
    try {
      const reqFromUser = createRequire(path.join(cwd, 'package.json'));
      reqFromUser.resolve('tsx/esm');
      return true;
    } catch {
      return false;
    }
  }
  // global check
  try {
    req.resolve('tsx/esm');
    return true;
  } catch {
    return false;
  }
}

let TMP = '';
async function mkTmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-sl-'));
  return dir;
}
async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

describe('source-loader', () => {
  beforeEach(async () => {
    TMP = await mkTmp();
  });

  afterEach(async () => {
    try { await fs.rm(TMP, { recursive: true, force: true }); } catch {}
    TMP = '';
    delete (process.env as any).DOCDEFAULTS_TS;
  });

  it('loads a JS module (named export) and resolves default path access', async () => {
    const js = path.join(TMP, 'constants.js');
    await write(js, `export const DEFAULTS = { a: 1, b: "x" };`);

    const mod = await loadModuleSmart(js, { repoRoot: TMP });
    expect(mod).toBeDefined();
    expect(getByPath(mod, 'DEFAULTS')).toEqual({ a: 1, b: 'x' });
    expect(() => assertPlainObject(getByPath(mod, 'DEFAULTS'), 'ctx')).not.toThrow();
  });

  it('loads a JSON file', async () => {
    const json = path.join(TMP, 'constants.json');
    await write(json, JSON.stringify({ A: { x: 10 } }));
    const mod = await loadModuleSmart(json, { repoRoot: TMP });
    expect(mod).toEqual({ A: { x: 10 } });
    expect(getByPath(mod, 'A.x')).toBe(10);
  });

  it('for a TS file, prefers compiled JS when it exists (no tsx required)', async () => {
    // Simulate project layout:
    //   src/constants.ts (the path user points at)
    //   dist/constants.js (what we want to import)
    const srcTs = path.join(TMP, 'src/constants.ts');
    const distJs = path.join(TMP, 'dist/constants.js');
    await write(srcTs, `export const DEFAULTS = { foo: "from-ts" }`);
    await write(distJs, `export const DEFAULTS = { foo: "from-built-js" }`);

    const mod = await loadModuleSmart(srcTs, {
      repoRoot: TMP,
      tsRootDir: path.join(TMP, 'src'),
      tsOutDir: path.join(TMP, 'dist'),
      tsDeclarationDir: undefined,
    });

    expect(getByPath(mod, 'DEFAULTS.foo')).toBe('from-built-js'); // proves it imported compiled JS
  });

  it('for a TS file without build, throws helpful guidance unless DOCDEFAULTS_TS=1', async () => {
    const srcTs = path.join(TMP, 'src/constants.ts');
    await write(srcTs, `export const DEFAULTS = { n: 1 }`);

    await expect(loadModuleSmart(srcTs, {
      repoRoot: TMP,
      tsRootDir: path.join(TMP, 'src'),
      tsOutDir: path.join(TMP, 'dist'),
      tsDeclarationDir: undefined,
      tsMode: 'off',
    })).rejects.toThrow(/Either build your project|DOCDEFAULTS_TS=1/);
  });

  it('with DOCDEFAULTS_TS=1: if tsx missing -> helpful error; if present -> loads TS directly', async () => {
    const srcTs = path.join(TMP, 'src/constants.ts');
    await write(srcTs, `export const DEFAULTS = { n: 2 }`);
    (process.env as any).DOCDEFAULTS_TS = '1';

    const call = () => loadModuleSmart(srcTs, {
      repoRoot: TMP,
      tsRootDir: path.join(TMP, 'src'),
      tsOutDir: path.join(TMP, 'dist'),
      tsDeclarationDir: undefined,
    });

    if (tsxAvailable()) {
      const mod = await call();
      expect(mod && mod.DEFAULTS && mod.DEFAULTS.n).toBe(2);
    } else {
      await expect(call()).rejects.toThrow(/tsx.+not installed/i);
    }
  });

  describe('built-JS import failure falls back to TS via tsx', () => {
    it('falls back when tsx is present (mode=auto)', async () => {
      // fake package.json so createRequire resolves from here
      await fs.writeFile(path.join(TMP, 'package.json'), '{"type":"module"}', 'utf8');

      // TS source
      const ts = path.join(TMP, 'src', 'constants.ts');
      await fs.mkdir(path.dirname(ts), { recursive: true });
      await fs.writeFile(ts, 'export const DEFAULTS = { foo: "bar" }', 'utf8');

      // Built JS that will FAIL to import (extensionless import)
      const built = path.join(TMP, 'dist', 'src', 'constants.js');
      await fs.mkdir(path.dirname(built), { recursive: true });
      await fs.writeFile(
        built,
        `import './util/logger'; export const DEFAULTS = { foo: "bar" };`,
        'utf8'
      );
      await fs.mkdir(path.join(TMP, 'dist', 'src', 'util'), { recursive: true });
      // Intentionally DO include the file, but Node ESM will reject because the import has no .js suffix:
      await fs.writeFile(path.join(TMP, 'dist', 'src', 'util', 'logger.js'), 'export {};', 'utf8');

      const canTsx = tsxAvailable(TMP);
      if (!canTsx) {
        // No tsx installed in this test env -> we just assert we get a helpful message.
        await expect(
          loadModuleSmart(ts, {
            repoRoot: TMP,
            tsRootDir: path.join(TMP, 'src'),
            tsOutDir: path.join(TMP, 'dist', 'src'),
            tsDeclarationDir: path.join(TMP, 'dist', 'types'),
            tsMode: 'auto',
            quiet: true,
          })
        ).rejects.toThrow(/Either build your project|install tsx|--ts on/);
        return;
      }

      // With tsx available, we should fallback and succeed:
      const mod = await loadModuleSmart(ts, {
        repoRoot: TMP,
        tsRootDir: path.join(TMP, 'src'),
        tsOutDir: path.join(TMP, 'dist', 'src'),
        tsDeclarationDir: path.join(TMP, 'dist', 'types'),
        tsMode: 'auto',
        quiet: true,
      });
      expect(mod.DEFAULTS.foo).toBe('bar');
    });
  });
});

