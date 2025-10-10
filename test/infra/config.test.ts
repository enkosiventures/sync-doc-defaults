import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverConfig, loadConfig } from '../../src/infra/config.js';
import { createTempDirectory } from '../utils.js';


describe('config.ts', () => {
  let tempDirPath: string;

  beforeEach(async () => {
    tempDirPath = await createTempDirectory();
  });

  afterEach(async () => {
    // best-effort cleanup (ignore failures on Windows if files are busy)
    const rm = (p: string) => fs.rm(p, { recursive: true, force: true }).catch(() => {});
    await rm(tempDirPath);
  });

  describe('discoverConfig', () => {
    it('returns undefined when nothing found', async () => {
      const found = await discoverConfig(tempDirPath);
      expect(found).toBeUndefined();
    });

    it('finds any of the candidate files in the starting dir', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.mjs');
      await fs.writeFile(
        configPath,
        `export default { defaults: './defaults.mjs', targets: [] }`
      );
      const found = await discoverConfig(tempDirPath);
      expect(found).toBe(configPath);
    });

    it('walks up to find a config in a parent directory', async () => {
      const parent = tempDirPath;
      const child = path.join(parent, 'a', 'b', 'c');
      await fs.mkdir(child, { recursive: true });
      const configPath = path.join(parent, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({ defaults: './defaults.mjs', targets: [] }, null, 2));

      // start from deep child; should find the parent config
      const found = await discoverConfig(child);
      expect(found).toBe(configPath);
    });

    it('honors the candidate order (mjs > cjs > js > json)', async () => {
      // create multiple; discoverConfig returns the first matched in the array order
      const mjs = path.join(tempDirPath, 'docdefaults.config.mjs');
      const cjs = path.join(tempDirPath, 'docdefaults.config.cjs');
      const js  = path.join(tempDirPath, 'docdefaults.config.js');
      const json= path.join(tempDirPath, 'docdefaults.config.json');

      await fs.writeFile(json, JSON.stringify({ defaults: './d.mjs', targets: [] }));
      await fs.writeFile(js,   `export default { defaults: './d.mjs', targets: [] }`);
      await fs.writeFile(cjs,  `module.exports = { defaults: './d.mjs', targets: [] }`);
      await fs.writeFile(mjs,  `export default { defaults: './d.mjs', targets: [] }`);

      const found = await discoverConfig(tempDirPath);
      expect(found).toBe(mjs);
    });

    it('honors sync-doc-defaults.config.mjs format', async () => {
      const mjs = path.join(tempDirPath, 'sync-doc-defaults.config.mjs');
      await fs.writeFile(mjs,  `export default { defaults: './d.mjs', targets: [] }`);

      const found = await discoverConfig(tempDirPath);
      expect(found).toBe(mjs);
    });
  });

  describe('loadConfig', () => {
    it('loads a valid JSON config and returns the parsed object', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      const configObj = {
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
      await fs.writeFile(configPath, JSON.stringify(configObj, null, 2));

      const config = await loadConfig(configPath);
      expect(config).toEqual(configObj);
    });

    it('accepts config with optional name field', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      const configObj = {
        defaults: 'constants.js',
        targets: [{
          // no name field - should be valid
          types: 'src/options.ts',
          dts: 'types.d.ts',
          interface: 'ExampleOptions',
          member: 'DEFAULTS',
        }],
      };
      await fs.writeFile(configPath, JSON.stringify(configObj, null, 2));

      const config = await loadConfig(configPath);
      expect(config).toEqual(configObj);
    });

    it('loads a valid ESM .mjs config (default export)', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.mjs');
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
      await fs.writeFile(configPath, content);

      const config = await loadConfig(configPath);
      // dts is optional; everything else must be present
      expect(config.defaults).toBe('./defaults.mjs');
      expect(Array.isArray(config.targets)).toBe(true);
      expect(config.targets[0]).toMatchObject({
        name: 'Sample',
        types: './src/sample.ts',
        interface: 'Sample',
        member: 'DEFAULTS',
      });
    });

    it('throws when config is not an object', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify(null));
      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: not an object`)
      );
    });

    it('throws when "defaults" is missing or not a string', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({ targets: [] }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "defaults" must be a string`)
      );
    });

    it('throws when "targets" is not an array', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({ defaults: './x.mjs', targets: {} }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Invalid config in ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "targets" must be an array`)
      );
    });

    it('throws when a target is not an object', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [null],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Invalid target in ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: item is not an object`)
      );
    });

    it('throws when target.name is not a string', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 123 }],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        new RegExp(`Invalid target in ${configPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: "name" must be a string`)
      );
    });

    it('throws when target.srcPath is not a string (message includes the target name)', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: 42 }],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        /Invalid target "T": "types" must be a string/
      );
    });

    it('throws when target.dtsPath is provided but not a string', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', dts: 123, interface: 'I', member: 'DEF' }],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        /Invalid target "T": "dts" must be a string if provided/
      );
    });

    it('throws when target.interface is not a string', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 5, member: 'DEF' }],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        /Invalid target "T": "interface" must be a string/
      );
    });

    it('throws when target.member is not a string', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      await fs.writeFile(configPath, JSON.stringify({
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 'I', member: 0 }],
      }));
      await expect(loadConfig(configPath)).rejects.toThrow(
        /Invalid target "T": "member" must be a string/
      );
    });

    it('accepts minimal valid target (no dtsPath)', async () => {
      const configPath = path.join(tempDirPath, 'docdefaults.config.json');
      const config = {
        defaults: './x.mjs',
        targets: [{ name: 'T', types: './s.ts', interface: 'I', member: 'DEF' }],
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      const loaded = await loadConfig(configPath);
      expect(loaded).toEqual(config);
    });
  });
});
