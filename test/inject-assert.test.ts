import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { inject, assert } from '../src/index.js';
import type { DocDefaultsConfig } from '../src/types.js';

const FIX_DIR = path.resolve(__dirname, 'fixtures');

async function makeTempCopy() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-'));
  const constants = path.join(tmp, 'constants.js');
  const dts = path.join(tmp, 'types.d.ts');
  await fs.copyFile(path.join(FIX_DIR, 'constants.js'), constants);
  await fs.copyFile(path.join(FIX_DIR, 'types.d.ts'), dts);
  return { tmp, constants, dts };
}

describe('docdefaults', () => {
  let tmp: string, constants: string, dts: string, config: DocDefaultsConfig;

  beforeEach(async () => {
    ({ tmp, constants, dts } = await makeTempCopy());
    config = {
      defaultsModulePath: path.relative(tmp, constants),
      targets: [
        {
          name: 'Example',
          srcPath: 'src/options.ts', // dummy (not used in inference here)
          dtsPath: path.relative(tmp, dts),
          interfaceName: 'ExampleOptions',
          defaultsRef: 'DEFAULTS',
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

  async function injectConfig() {
    const cfgFile = path.join(tmp, 'docdefaults.config.json');
    await fs.writeFile(cfgFile, JSON.stringify(config), 'utf8');
    await inject(cfgFile, { repoRoot: tmp });
  }

  async function assertConfig() {
    const cfgFile = path.join(tmp, 'docdefaults.config.json');
    await fs.writeFile(cfgFile, JSON.stringify(config), 'utf8');
    return assert(cfgFile, { repoRoot: tmp });
  }
});
