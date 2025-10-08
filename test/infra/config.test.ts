import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverConfig, loadConfig } from '../../src/infra/config.js';

async function mkTmpDir(prefix = 'config-tests-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}
const w = (p: string, data: string | Buffer) => fs.writeFile(p, data);

describe('config.ts', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTmpDir();
  });

  afterEach(async () => {
    // best-effort cleanup (ignore failures on Windows if files are busy)
    const rm = (p: string) => fs.rm(p, { recursive: true, force: true }).catch(() => {});
    await rm(tmp);
  });

  describe('discoverConfig', () => {
    it('returns undefined when nothing found', async () => {
      const found = await discoverConfig(tmp);
      expect(found).toBeUndefined();
    });

    it('finds any of the candidate files in the starting dir', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.mjs');
      await w(
        cfgPath,
        `export default { defaults: './defaults.mjs', targets: [] }`
      );
      const found = await discoverConfig(tmp);
      expect(found).toBe(cfgPath);
    });

    it('walks up to find a config in a parent directory', async () => {
      const parent = tmp;
      const child = path.join(parent, 'a', 'b', 'c');
      await fs.mkdir(child, { recursive: true });
      const cfgPath = path.join(parent, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({ defaults: './defaults.mjs', targets: [] }, null, 2));

      // start from deep child; should find the parent config
      const found = await discoverConfig(child);
      expect(found).toBe(cfgPath);
    });

    it('honors the candidate order (mjs > cjs > js > json)', async () => {
      // create multiple; discoverConfig returns the first matched in the array order
      const mjs = path.join(tmp, 'docdefaults.config.mjs');
      const cjs = path.join(tmp, 'docdefaults.config.cjs');
      const js  = path.join(tmp, 'docdefaults.config.js');
      const json= path.join(tmp, 'docdefaults.config.json');

      await w(json, JSON.stringify({ defaults: './d.mjs', targets: [] }));
      await w(js,   `export default { defaults: './d.mjs', targets: [] }`);
      await w(cjs,  `module.exports = { defaults: './d.mjs', targets: [] }`);
      await w(mjs,  `export default { defaults: './d.mjs', targets: [] }`);

      const found = await discoverConfig(tmp);
      expect(found).toBe(mjs); // first in your CANDIDATE_FILES array
    });
  });

  describe('loadConfig', () => {
    it('loads a valid JSON config and returns the parsed object', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      const cfgObj = {
        defaults: './defaults.mjs',
        targets: [
          {
            name: 'X',
            types: './src/x.ts',
            dts: './dist/x.d.ts',
            interface: 'X',
            member: 'DEFAULTS',
          },
        ],
      };
      await w(cfgPath, JSON.stringify(cfgObj, null, 2));

      const cfg = await loadConfig(cfgPath);
      expect(cfg).toEqual(cfgObj);
    });

    it('loads a valid ESM .mjs config (default export)', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.mjs');
      const content = `
        export default {
          defaults: './defaults.mjs',
          targets: [
            {
              name: 'Sample',
              types: './src/sample.ts',
              interface: 'Sample',
              member: 'DEFAULTS'
            }
          ]
        };
      `.trim();
      await w(cfgPath, content);

      const cfg = await loadConfig(cfgPath);
      // dts is optional; everything else must be present
      expect(cfg.defaults).toBe('./defaults.mjs');
      expect(Array.isArray(cfg.targets)).toBe(true);
      expect(cfg.targets[0]).toMatchObject({
        name: 'Sample',
        types: './src/sample.ts',
        interface: 'Sample',
        member: 'DEFAULTS',
      });
    });

    it('throws when config is not an object', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify(null));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${cfgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: not an object`)
      );
    });

    it('throws when "defaults" is missing or not a string', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({ targets: [] }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${cfgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "defaults" must be a string`)
      );
    });

    it('throws when "targets" is not an array', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({ defaults: './x.mjs', targets: {} }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${cfgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "targets" must be an array`)
      );
    });

    it('throws when a target is not an object', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [null],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        new RegExp(`Invalid target in ${cfgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: item is not an object`)
      );
    });

    it('throws when target.name is not a string', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 123 }],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        new RegExp(`Invalid target in ${cfgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "name" must be a string`)
      );
    });

    it('throws when target.srcPath is not a string (message includes the target name)', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: 42 }],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        /Invalid target "T": "types" must be a string/
      );
    });

    it('throws when target.dtsPath is provided but not a string', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', dts: 123, interface: 'I', member: 'DEF' }],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        /Invalid target "T": "dts" must be a string if provided/
      );
    });

    it('throws when target.interface is not a string', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 5, member: 'DEF' }],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        /Invalid target "T": "interface" must be a string/
      );
    });

    it('throws when target.member is not a string', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      await w(cfgPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 'I', member: 0 }],
      }));
      await expect(loadConfig(cfgPath)).rejects.toThrow(
        /Invalid target "T": "member" must be a string/
      );
    });

    it('accepts minimal valid target (no dtsPath)', async () => {
      const cfgPath = path.join(tmp, 'docdefaults.config.json');
      const cfg = {
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 'I', member: 'DEF' }],
      };
      await w(cfgPath, JSON.stringify(cfg, null, 2));
      const loaded = await loadConfig(cfgPath);
      expect(loaded).toEqual(cfg);
    });
  });
});
