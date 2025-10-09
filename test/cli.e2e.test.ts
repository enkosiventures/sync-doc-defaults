import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const BIN = path.resolve(__dirname, '../dist/cli.js');
const FIX = path.resolve(__dirname, 'fixtures');

function runCli(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }):
  Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
    }, (err, stdout, stderr) => {
      const code = (err && (err as any).code != null) ? (err as any).code : 0;
      resolve({ code: code as number, stdout, stderr });
    });
  });
}

async function mkTmp() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docdefaults-cli-'));
  return tmp;
}

async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function read(file: string) {
  return fs.readFile(file, 'utf8');
}

describe('docdefaults CLI (e2e)', () => {
  let cwd: string;
  let constants: string;
  let dts: string;

  beforeEach(async () => {
    cwd = await mkTmp();
    constants = path.join(cwd, 'constants.js');
    dts = path.join(cwd, 'types.d.ts');
    await fs.copyFile(path.join(FIX, 'constants.js'), constants);
    await fs.copyFile(path.join(FIX, 'types.d.ts'), dts);
  });

  it('returns code=2 when config is missing and no discovery possible', async () => {
    const { code, stderr } = await runCli(['assert'], { cwd });
    expect(code).toBe(2);
    expect(stderr).toMatch(/No config found/i);
  });

  it('supports explicit --config and fails assert before injection (code=1)', async () => {
    const cfg = {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    };
    const cfgPath = path.join(cwd, 'docdefaults.config.json');
    await write(cfgPath, JSON.stringify(cfg));

    const { code, stderr } = await runCli(['assert', '--config', cfgPath], { cwd });
    expect(stderr).toMatch(/expected @default/i);
    expect(code).toBe(1);
  });

  it('inject works (code=0) and is idempotent via CLI', async () => {
    const cfgPath = path.join(cwd, 'docdefaults.config.mjs');
    await write(cfgPath, `export default {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }]
    }`);

    // First inject
    let r = await runCli(['inject', '--config', cfgPath], { cwd });
    expect(r.stdout).toMatch(/injected 3 @default update/);
    expect(r.code).toBe(0);
    const first = await read(dts);
    expect(first).toContain('@default "bar"');
    expect(first).toContain('@default 42');
    expect(first).toContain('@default true');

    // Second inject should be a no-op (still code 0, and file unchanged)
    r = await runCli(['inject', '--config', cfgPath], { cwd });
    expect(r.code).toBe(0);
    const second = await read(dts);
    expect(second).toBe(first);
  });

  it('--dry shows changes but does not write', async () => {
    const cfgPath = path.join(cwd, 'docdefaults.config.json');
    await write(cfgPath, JSON.stringify({
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    }));

    const before = await read(dts);
    const { code, stdout } = await runCli(['inject', '--config', cfgPath, '--dry'], { cwd });
    const after = await read(dts);

    expect(code).toBe(0);
    expect(stdout).toMatch(/dryRun/i);
    expect(after).toBe(before); // unchanged
  });

  it('--quiet suppresses normal logs but not errors', async () => {
    const cfgPath = path.join(cwd, 'docdefaults.config.json');
    await write(cfgPath, JSON.stringify({
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    }));
    const { code, stdout } = await runCli(['inject', '--config', cfgPath, '--quiet'], { cwd });
    expect(code).toBe(0);
    // stdout can be empty or minimal; we assert NOT containing the standard injected line
    expect(stdout).not.toMatch(/injected \d+ @defaultValue/);
  });

  it('--debug-paths prints path resolution breadcrumbs', async () => {
    const cfgPath = path.join(cwd, 'docdefaults.config.json');
    await write(cfgPath, JSON.stringify({
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    }));
    const { code, stdout } = await runCli(['inject', '--config', cfgPath, '--debug-paths'], { cwd });
    expect(code).toBe(0);
    expect(stdout).toMatch(/configPath=/);
    expect(stdout).toMatch(/repoRoot=/);
    expect(stdout).toMatch(/defaultsModulePathAbs=/);
  });

  it('config discovery (no --config) works when config is in cwd', async () => {
    // discovery: write a config named docdefaults.config.mjs in cwd
    await write(path.join(cwd, 'docdefaults.config.mjs'), `export default {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }]
    }`);
    const { code } = await runCli(['inject'], { cwd });
    expect(code).toBe(0);
  });

  it('assert passes after injection (code=0)', async () => {
    const cfgPath = path.join(cwd, 'docdefaults.config.mjs');
    await write(cfgPath, `export default {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }]
    }`);
    await runCli(['inject', '--config', cfgPath], { cwd });
    const r = await runCli(['assert', '--config', cfgPath], { cwd });
    expect(r.code).toBe(0);
  });
});
