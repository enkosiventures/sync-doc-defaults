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

  it('rejects path traversal attempts in defaults path', async () => {
    const dts = path.join(cwd, 'types.d.ts');
    await write(dts, `export interface Example { foo?: string; }`);
    
    const cfg: DocDefaultsConfig = {
      defaults: '../../../etc/passwd',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const cfgFile = path.join(cwd, 'malicious.config.json');
    await write(cfgFile, JSON.stringify(cfg));
    
    await expect(inject(cfgFile, { repoRoot: cwd }))
      .rejects.toThrow(/escapes project root/);
  });

  it('rejects path traversal attempts in dts path', async () => {
    const constants = path.join(cwd, 'constants.js');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    
    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: '../../../../etc/passwd', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const cfgFile = path.join(cwd, 'malicious.config.json');
    await write(cfgFile, JSON.stringify(cfg));
    
    await expect(inject(cfgFile, { repoRoot: cwd }))
      .rejects.toThrow(/escapes project root/);
  });

  it('supports nested member paths with dot notation', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `
      export const DEFAULTS = { 
        subsection: {
          foo: "nested-bar"
        }
      }
    `);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS.subsection' 
      }],
    };
    
    const cfgFile = path.join(cwd, 'nested.config.json');
    await write(cfgFile, JSON.stringify(cfg));
    
    await inject(cfgFile, { repoRoot: cwd });
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "nested-bar"/);
  });

  it('accepts config targets without optional name field', async () => {
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        // no name field - should be valid
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const cfgFile = path.join(cwd, 'no-name.config.json');
    await write(cfgFile, JSON.stringify(cfg));
    
    await expect(inject(cfgFile, { repoRoot: cwd })).resolves.not.toThrow();
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "bar"/);
  });

  it('handles defaults module with throwing getters gracefully', async () => { // FAILING
    const constants = path.join(cwd, 'constants.js');
    const dts = path.join(cwd, 'types.d.ts');
    
    // Create a module with a throwing getter
    await write(constants, `
      export const DEFAULTS = {
        get foo() { throw new Error("Getter explosion!"); }
      };
    `);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const cfg: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const cfgFile = path.join(cwd, 'throwing.config.json');
    await write(cfgFile, JSON.stringify(cfg));
    
    // Should handle the error gracefully (might log but not crash)
    await inject(cfgFile, { repoRoot: cwd });
    
    // The property with throwing getter won't be injected
    const text = await fs.readFile(dts, 'utf8');
    expect(text).not.toContain('@default');
  });
});
