import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-cli-ts-'));
}
async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}
function runCli(cwd: string, args: string[], env?: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const ps = spawn('node', [path.resolve(__dirname, '../dist/cli.cjs'), ...args], {
      cwd,
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
  let cwd: string;
  const cfg = 'docdefaults.config.mjs';

  beforeAll(async () => {
    cwd = await mkTmp();

    // minimal project: TS constants + d.ts to inject into + config + tsconfig
    await write(path.join(cwd, 'src/constants.ts'), `export const DEFAULTS = { foo: "bar" }`);
    await write(path.join(cwd, 'src/types.ts'), `export interface Example { foo?: string; }`);
    await write(path.join(cwd, 'dist/types/types.d.ts'), `export interface Example { foo?: string; }`);
    await write(path.join(cwd, 'tsconfig.json'), JSON.stringify({
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
    await write(path.join(cwd, cfg), `
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
    const { code, err } = await runCli(cwd, ['inject', '--ts', 'off']);
    expect(code).not.toBe(0);
    expect(err).toMatch(/Either build your project|install tsx|Could not load/i);
  });

  it('--ts on → explicit tsx error if not installed', async () => {
    const { code } = await runCli(cwd, ['inject', '--ts', 'on']);
    expect(code).not.toBe(0);
  });

  it('--ts auto → succeeds when built JS exists', async () => {
    // simulate a built JS that loader will prefer
    await write(path.join(cwd, 'dist/src/constants.js'), `export const DEFAULTS = { foo: "bar" };`);

    const r = await runCli(cwd, ['inject', '--ts', 'auto']);
    expect(r.code).toBe(0);

    const dts = await fs.readFile(path.join(cwd, 'dist/types/types.d.ts'), 'utf8');
    expect(dts).toMatch(`export interface Example {  /**
  * @default \"bar\"
  */
foo?: string; }`);
  });
});
