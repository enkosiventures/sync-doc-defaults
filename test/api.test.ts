import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inject, assert } from '../src/api.js';
import type { DocDefaultsConfig } from '../src/types.js';
import { createTempDirectory } from './utils.js';


const FIX_DIR = path.resolve(__dirname, 'fixtures');

async function makeTempCopy() {
  const tempDirPath = await createTempDirectory();
  const constants = path.join(tempDirPath, 'constants.js');
  const dts = path.join(tempDirPath, 'types.d.ts');
  await fs.copyFile(path.join(FIX_DIR, 'constants.js'), constants);
  await fs.copyFile(path.join(FIX_DIR, 'types.d.ts'), dts);
  return { tempDirPath, constants, dts };
}

describe('docdefaults', () => {
  let tempDirPath: string;
  let dts: string;
  let constants: string;
  let config: DocDefaultsConfig;

  beforeEach(async () => {
    ({ tempDirPath, constants, dts } = await makeTempCopy());
    config = {
      defaults: path.relative(tempDirPath, constants),
      targets: [
        {
          name: 'Example',
          types: 'src/options.ts', // dummy (not used in inference here)
          dts: path.relative(tempDirPath, dts),
          interface: 'ExampleOptions',
          member: 'DEFAULTS',
        },
      ],
    };
  });

  it('fails assert before injection', async () => {
    await expect(assertConfig()).rejects.toThrow();
  });

  it('injects defaults correctly', async () => {
    await injectConfig();
    const text = await fs.readFile(dts, 'utf8');
    expect(text).toContain('@default "bar"');
    expect(text).toContain('@default 42');
    expect(text).toContain('@default true');
  });

  it('makes inject idempotent', async () => {
    await injectConfig();
    const first = await fs.readFile(dts, 'utf8');
    await injectConfig();
    const second = await fs.readFile(dts, 'utf8');
    expect(second).toBe(first);
  });

  it('passes assert after injection', async () => {
    await injectConfig();
    await expect(assertConfig()).resolves.not.toThrow();
  });

  it('rejects path traversal attempts', async () => {
    const maliciousConfig = {
      defaults: '../../../etc/passwd',
      targets: [{
        name: 'Evil',
        types: 'src/types.ts',
        dts: '../../../../etc/passwd',
        interface: 'Example',
        member: 'DEFAULTS',
      }],
    };
    const configFile = path.join(tempDirPath, 'evil.config.json');
    await fs.writeFile(configFile, JSON.stringify(maliciousConfig), 'utf8');
    await expect(inject(configFile, { repoRoot: tempDirPath })).rejects.toThrow(/escapes project root/);
  });

  async function injectConfig() {
    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await fs.writeFile(configFile, JSON.stringify(config), 'utf8');
    await inject(configFile, { repoRoot: tempDirPath });
  }

  async function assertConfig() {
    const configFile = path.join(tempDirPath, 'docdefaults.config.json');
    await fs.writeFile(configFile, JSON.stringify(config), 'utf8');
    return assert(configFile, { repoRoot: tempDirPath });
  }
});
