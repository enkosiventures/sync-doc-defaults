import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inject, assert } from '../src/api.js';
import type { DocDefaultsConfig } from '../src/types.js';
import { createTempDirectory, write } from './utils.js';


describe('index (errors & branches)', () => {
  let tempDirPath: string;

  beforeEach(async () => {
    tempDirPath = await createTempDirectory();
  });

  it('fails when interface is not found', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Other { foo?: string; }`);

    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Missing', member: 'DEFAULTS' }],
    };

    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configFile, JSON.stringify(config));

    await expect(inject(configFile, { repoRoot: tempDirPath })).rejects.toThrow(/Interface "Missing" not found/);
  });

  it('fails when defaults symbol is missing', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const NOT_DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Example { foo?: string; }`);

    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configFile, JSON.stringify(config));

    await expect(inject(configFile, { repoRoot: tempDirPath })).rejects.toThrow(/symbol "DEFAULTS" not found/);
  });

  it('warn path: extra keys in defaults (inject still succeeds)', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar", unused: 1 }`);
    await write(dts, `export interface Example { foo?: string; }`);

    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configFile, JSON.stringify(config));

    await inject(configFile, { repoRoot: tempDirPath, quiet: true });
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "bar"/);
  });

  it('dryRun does not modify files', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { a: 1 }`);
    await write(dts, `export interface Example { a?: number; }`);

    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };

    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configFile, JSON.stringify(config));

    const before = await fs.readFile(dts, 'utf8');
    await inject(configFile, { repoRoot: tempDirPath, dryRun: true });
    const after = await fs.readFile(dts, 'utf8');
    expect(after).toBe(before);
  });

  it('assert reports mismatch and resolves after inject', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { a: 1 }`);
    await write(dts, `export interface Example { a?: number; }`);

    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ name: 'X', types: 'src/x.ts', dts: 'types.d.ts', interface: 'Example', member: 'DEFAULTS' }],
    };
    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configFile, JSON.stringify(config));

    await expect(assert(configFile, { repoRoot: tempDirPath })).rejects.toThrow();
    await inject(configFile, { repoRoot: tempDirPath });
    await expect(assert(configFile, { repoRoot: tempDirPath })).resolves.not.toThrow();
  });

  it('rejects path traversal attempts in defaults path', async () => {
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(dts, `export interface Example { foo?: string; }`);
    
    const config: DocDefaultsConfig = {
      defaults: '../../../etc/passwd',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const configFile = path.join(tempDirPath, 'malicious.config.json');
    await write(configFile, JSON.stringify(config));
    
    await expect(inject(configFile, { repoRoot: tempDirPath }))
      .rejects.toThrow(/escapes project root/);
  });

  it('rejects path traversal attempts in dts path', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    
    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: '../../../../etc/passwd', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const configFile = path.join(tempDirPath, 'malicious.config.json');
    await write(configFile, JSON.stringify(config));
    
    await expect(inject(configFile, { repoRoot: tempDirPath }))
      .rejects.toThrow(/escapes project root/);
  });

  it('supports nested member paths with dot notation', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `
      export const DEFAULTS = { 
        subsection: {
          foo: "nested-bar"
        }
      }
    `);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS.subsection' 
      }],
    };
    
    const configFile = path.join(tempDirPath, 'nested.config.json');
    await write(configFile, JSON.stringify(config));
    
    await inject(configFile, { repoRoot: tempDirPath });
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "nested-bar"/);
  });

  it('accepts config targets without optional name field', async () => {
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    await write(constants, `export const DEFAULTS = { foo: "bar" }`);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        // no name field - should be valid
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const configFile = path.join(tempDirPath, 'no-name.config.json');
    await write(configFile, JSON.stringify(config));
    
    await expect(inject(configFile, { repoRoot: tempDirPath })).resolves.not.toThrow();
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toMatch(/@default "bar"/);
  });

  it('handles defaults module with throwing getters gracefully', async () => { // FAILING
    const constants = path.join(tempDirPath, 'constants.js');
    const dts = path.join(tempDirPath, 'types.d.ts');
    
    // Create a module with a throwing getter
    await write(constants, `
      export const DEFAULTS = {
        get foo() { throw new Error("Getter explosion!"); }
      };
    `);
    await write(dts, `export interface Example { foo?: string; }`);
    
    const config: DocDefaultsConfig = {
      defaults: 'constants.js',
      targets: [{ 
        name: 'X', 
        types: 'src/x.ts', 
        dts: 'types.d.ts', 
        interface: 'Example', 
        member: 'DEFAULTS' 
      }],
    };
    
    const configFile = path.join(tempDirPath, 'throwing.config.json');
    await write(configFile, JSON.stringify(config));
    
    // Should handle the error gracefully (might log but not crash)
    await inject(configFile, { repoRoot: tempDirPath });
    
    // The property with throwing getter won't be injected
    const text = await fs.readFile(dts, 'utf8');
    expect(text).not.toContain('@default');
  });
});
