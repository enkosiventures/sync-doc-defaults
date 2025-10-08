import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inject, assert } from '../src/api.js';
import type { DocDefaultsConfig } from '../src/types.js';

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-index-'));
}
async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

describe('index (errors & branches)', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await tmpdir();
  });

  it('fails when interface is not found', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Other { foo?: string; }`);

    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Missing', member: 'DEFAULTS' }],
    };

    const cfgFile = path.join(cwd, 'docdefaults.config.json');
    await write(cfgFile, JSON.stringify(cfg));

    await expect(inject(cfgFile, { repoRoot: cwd })).rejects.toThrow(/Interface "Missing" not found/);
  });

  it('fails when defaults symbol is missing', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const NOT_DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Example { foo?: string; }`);

    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const cfgFile = path.join(cwd, 'docdefaults.config.json');
    await write(cfgFile, JSON.stringify(cfg));

    await expect(inject(cfgFile, { repoRoot: cwd })).rejects.toThrow(/symbol "DEFAULTS" not found/);
  });

  it('warn path: extra keys in defaults (inject still succeeds)', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar", unused: 1 }`);
    await write(dts, `export interface Example { foo?: string; }`);

    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const cfgFile = path.join(cwd, 'docdefaults.config.json');
    await write(cfgFile, JSON.stringify(cfg));

    await inject(cfgFile, { repoRoot: cwd, quiet: true });
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "bar"/);
  });

  it('dryRun does not modify files', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { a: 1 }`);
    await write(dts, `export interface Example { a?: number; }`);

    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const cfgFile = path.join(cwd, 'docdefaults.config.json');
    await write(cfgFile, JSON.stringify(cfg));

    const before = await fs.readFile(dts, 'utf8');
    await inject(cfgFile, { repoRoot: cwd, dryRun: true });
    const after = await fs.readFile(dts, 'utf8');
    expect(after).toBe(before);
  });

  it('assert reports mismatch and resolves after inject', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { a: 1 }`);
    await write(dts, `export interface Example { a?: number; }`);

    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };
    const cfgFile = path.join(cwd, 'docdefaults.config.json');
    await write(cfgFile, JSON.stringify(cfg));

    await expect(assert(cfgFile, { repoRoot: cwd })).rejects.toThrow();
    await inject(cfgFile, { repoRoot: cwd });
    await expect(assert(cfgFile, { repoRoot: cwd })).resolves.not.toThrow();
  });
});
