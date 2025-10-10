import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createTempDirectory, write } from './utils.js';


function runCli(tempDirPath: string, args: string[], env?: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const ps = spawn('node', [path.resolve(__dirname, '../dist/cli.cjs'), ...args], {
      cwd: tempDirPath,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    ps.stdout.on('data', d => (out += d.toString()));
    ps.stderr.on('data', d => (err += d.toString()));
    ps.on('close', code => resolve({ code: code ?? 0, out, err }));
  });
}

describe('CLI --ts flag', () => {
  let tempDirPath: string;
  const config = 'docdefaults.config.mjs';

  beforeAll(async () => {
    tempDirPath = await createTempDirectory();

    // minimal project: TS constants + d.ts to inject into + config + tsconfig
    await write(path.join(tempDirPath, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
    await write(path.join(tempDirPath, 'src/constants.ts'), `export const DEFAULTS = { foo: "bar" }`);
    await write(path.join(tempDirPath, 'src/types.ts'), `export interface Example { foo?: string; }`);
    await write(path.join(tempDirPath, 'dist/types/types.d.ts'), `export interface Example { foo?: string; }`);
    await write(path.join(tempDirPath, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        rootDir: "src",
        outDir: "dist/src",
        declaration: true,
        declarationDir: "dist/types",
        module: "ESNext",
        target: "ES2020",
        moduleResolution: "node"
      }
    }));
    await write(path.join(tempDirPath, config), `
      export default {
        tsconfigPath: 'tsconfig.json',
        defaults: 'src/constants.ts',
        targets: [{
          name: 'X',
          types: 'src/types.ts',
          dts: 'dist/types/types.d.ts',
          interface: 'Example',
          member: 'DEFAULTS'
        }]
      };
    `);
  });

  it('--ts off → fails when build missing', async () => {
    const { code, err } = await runCli(tempDirPath, ['inject', '--ts', 'off']);
    expect(code).not.toBe(0);
    expect(err).toMatch(/Either build your project|install tsx|Could not load/i);
  });

  it('--ts on → explicit tsx error if not installed', async () => {
     // If tsx is available from the temp project, the CLI will succeed with --ts on.
     // Otherwise it should fail with the explicit "tsx not installed" error.
     let tsxAvailable = false;
     try {
       // Check resolution relative to the temp workspace, not the repo root
       require.resolve('tsx', { paths: [tempDirPath] });
       tsxAvailable = true;
     } catch {}

     const { code, err } = await runCli(tempDirPath, ['inject', '--ts', 'on']);
     if (tsxAvailable) {
       expect(code).toBe(0);
     } else {
       expect(code).not.toBe(0);
       expect(err).toMatch(/tsx.+not installed|Either build your project|--ts on/i);
     }
   });

  it('--ts auto → succeeds when built JS exists', async () => {
    // simulate a built JS that loader will prefer
    await write(path.join(tempDirPath, 'dist/src/constants.js'), `export const DEFAULTS = { foo: "bar" };`);

    const result = await runCli(tempDirPath, ['inject', '--ts', 'auto']);
    expect(result.code).toBe(0);

    const dts = await fs.readFile(path.join(tempDirPath, 'dist/types/types.d.ts'), 'utf8');
    expect(dts).toMatch(`export interface Example {  /**
  * @default \"bar\"
  */
foo?: string; }`);
  });
});
