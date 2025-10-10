import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadModuleSmart, getByPath, assertPlainObject, resolveTsxFrom } from '../../src/infra/source-loader.js';
import { createTempDirectory, write } from '../utils.js';


describe('source-loader', () => {
  let tempDirPath: string;

  beforeEach(async () => {
    tempDirPath = await createTempDirectory();
  });

  afterEach(async () => {
    try { await fs.rm(tempDirPath, { recursive: true, force: true }); } catch {}
    tempDirPath = '';
    delete (process.env as any).SYNCDOCDEFAULTS_TS;
  });

  it('loads a JS module (named export) and resolves default path access', async () => {
    const defaultsPath = path.join(tempDirPath, 'constants.js');
    await write(defaultsPath, `export const DEFAULTS = { a: 1, b: "x" };`);

    const defaultsModule = await loadModuleSmart(defaultsPath, { repoRoot: tempDirPath });
    expect(defaultsModule).toBeDefined();
    expect(getByPath(defaultsModule, 'DEFAULTS')).toEqual({ a: 1, b: 'x' });
    expect(() => assertPlainObject(getByPath(defaultsModule, 'DEFAULTS'), 'ctx')).not.toThrow();
  });

  it('loads a JSON file', async () => {
    const defaultsJsonPath = path.join(tempDirPath, 'constants.json');
    await write(defaultsJsonPath, JSON.stringify({ A: { x: 10 } }));
    const defaultsModule = await loadModuleSmart(defaultsJsonPath, { repoRoot: tempDirPath });
    expect(defaultsModule).toEqual({ A: { x: 10 } });
    expect(getByPath(defaultsModule, 'A.x')).toBe(10);
  });

  it('for a TS file, prefers compiled JS when it exists (no tsx required)', async () => {
    // Simulate project layout:
    //   src/constants.ts (the path user points at)
    //   dist/constants.js (what we want to import)
    const srcTsPath = path.join(tempDirPath, 'src/constants.ts');
    const distJsPath = path.join(tempDirPath, 'dist/constants.js');
    await write(srcTsPath, `export const DEFAULTS = { foo: "from-ts" }`);
    await write(distJsPath, `export const DEFAULTS = { foo: "from-built-js" }`);

    const defaultsModule = await loadModuleSmart(srcTsPath, {
      repoRoot: tempDirPath,
      tsRootDir: path.join(tempDirPath, 'src'),
      tsOutDir: path.join(tempDirPath, 'dist'),
      tsDeclarationDir: undefined,
    });

    expect(getByPath(defaultsModule, 'DEFAULTS.foo')).toBe('from-built-js'); // proves it imported compiled JS
  });

  it('for a TS file without build, throws helpful guidance unless SYNCDOCDEFAULTS_TS=on', async () => {
    const srcTsPath = path.join(tempDirPath, 'src/constants.ts');
    await write(srcTsPath, `export const DEFAULTS = { n: 1 }`);

    await expect(loadModuleSmart(srcTsPath, {
      repoRoot: tempDirPath,
      tsRootDir: path.join(tempDirPath, 'src'),
      tsOutDir: path.join(tempDirPath, 'dist'),
      tsDeclarationDir: undefined,
      tsMode: 'off',
    })).rejects.toThrow(/Either build your project|SYNCDOCDEFAULTS_TS=on/);
  });

  it('with SYNCDOCDEFAULTS_TS=on: if tsx missing -> helpful error; if present -> loads TS directly', async () => {
    const srcTsPath = path.join(tempDirPath, 'src/constants.ts');
    await write(srcTsPath, `export const DEFAULTS = { n: 2 }`);
    (process.env as any).SYNCDOCDEFAULTS_TS = 'on';

    const call = () => loadModuleSmart(srcTsPath, {
      repoRoot: tempDirPath,
      tsRootDir: path.join(tempDirPath, 'src'),
      tsOutDir: path.join(tempDirPath, 'dist'),
      tsDeclarationDir: undefined,
    });

    if (resolveTsxFrom(tempDirPath)) {
      const defaultsModule = await call();
      expect(defaultsModule && defaultsModule.DEFAULTS && defaultsModule.DEFAULTS.n).toBe(2);
    } else {
      await expect(call()).rejects.toThrow(/tsx.+not installed/i);
    }
  });

  describe('built-JS import failure falls back to TS via tsx', () => {
    it('falls back when tsx is present (mode=auto)', async () => {
      // fake package.json so createRequire resolves from here
      await fs.writeFile(path.join(tempDirPath, 'package.json'), '{"type":"module"}', 'utf8');

      // TS source
      const ts = path.join(tempDirPath, 'src', 'constants.ts');
      await fs.mkdir(path.dirname(ts), { recursive: true });
      await fs.writeFile(ts, 'export const DEFAULTS = { foo: "bar" }', 'utf8');

      // Built JS that will FAIL to import (extensionless import)
      const built = path.join(tempDirPath, 'dist', 'src', 'constants.js');
      await fs.mkdir(path.dirname(built), { recursive: true });
      await fs.writeFile(
        built,
        `import './util/does-not-exist.js'; export const DEFAULTS = { foo: "bar" };`,
        'utf8'
      );

      const tsxPath = resolveTsxFrom(tempDirPath);
      if (!tsxPath) {
        // No tsx installed in this test env -> we just assert we get a helpful message.
        await expect(
          loadModuleSmart(ts, {
            repoRoot: tempDirPath,
            tsRootDir: path.join(tempDirPath, 'src'),
            tsOutDir: path.join(tempDirPath, 'dist', 'src'),
            tsDeclarationDir: path.join(tempDirPath, 'dist', 'types'),
            tsMode: 'auto',
            quiet: true,
          })
        ).rejects.toThrow(/Either build your project|install tsx|--ts on/);
        return;
      }

      // With tsx available, we should fallback and succeed:
      const defaultsModule = await loadModuleSmart(ts, {
        repoRoot: tempDirPath,
        tsRootDir: path.join(tempDirPath, 'src'),
        tsOutDir: path.join(tempDirPath, 'dist', 'src'),
        tsDeclarationDir: path.join(tempDirPath, 'dist', 'types'),
        tsMode: 'auto',
        quiet: true,
      });
      expect(defaultsModule.DEFAULTS.foo).toBe('bar');
    });
  });
});

