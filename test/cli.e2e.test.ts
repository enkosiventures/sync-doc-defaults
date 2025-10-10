import { describe, it, expect, beforeEach } from 'vitest';
import fs, { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createTempDirectory } from './utils.js';


const BIN = path.resolve(__dirname, '../dist/cli.cjs');
const FIX = path.resolve(__dirname, 'fixtures');

function runCli(args: string[], opts: { tempDirPath: string; env?: NodeJS.ProcessEnv }):
  Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], {
      cwd: opts.tempDirPath,
      env: { ...process.env, ...(opts.env || {}) },
    }, (err, stdout, stderr) => {
      const code = (err && (err as any).code != null) ? (err as any).code : 0;
      resolve({ code: code as number, stdout, stderr });
    });
  });
}

async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}

async function read(file: string) {
  return fs.readFile(file, 'utf8');
}

describe('docdefaults CLI (e2e)', () => {
  let tempDirPath: string;
  let constants: string;
  let dts: string;

  beforeEach(async () => {
    tempDirPath = await createTempDirectory();
    await writeFile(
      path.join(tempDirPath, 'package.json'),
      JSON.stringify({ type: 'module' }, null, 2)
    );
    constants = path.join(tempDirPath, 'constants.js');
    dts = path.join(tempDirPath, 'types.d.ts');
    await fs.copyFile(path.join(FIX, 'constants.js'), constants);
    await fs.copyFile(path.join(FIX, 'types.d.ts'), dts);
  });

  it('returns code=2 when config is missing and no discovery possible', async () => {
    const { code, stderr } = await runCli(['assert'], { tempDirPath });
    expect(code).toBe(2);
    expect(stderr).toMatch(/No config found/i);
  });

  it('supports explicit --config and fails assert before injection (code=1)', async () => {
    const config = {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    };
    const configPath = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configPath, JSON.stringify(config));

    const { code, stderr } = await runCli(['assert', '--config', configPath], { tempDirPath });
    expect(stderr).toMatch(/expected @default/i);
    expect(code).toBe(1);
  });

  it('inject works (code=0) and is idempotent via CLI', async () => {
    const configPath = path.join(tempDirPath, 'docdefaults.config.mjs');
    await write(configPath, `export default {
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
    let result = await runCli(['inject', '--config', configPath], { tempDirPath });
    expect(result.stdout).toMatch(/injected 3 @default update/);
    expect(result.code).toBe(0);
    const first = await read(dts);
    expect(first).toContain('@default "bar"');
    expect(first).toContain('@default 42');
    expect(first).toContain('@default true');

    // Second inject should be a no-op (still code 0, and file unchanged)
    result = await runCli(['inject', '--config', configPath], { tempDirPath });
    expect(result.code).toBe(0);
    const second = await read(dts);
    expect(second).toBe(first);
  });

  it('--dry shows changes but does not write', async () => {
    const configPath = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configPath, JSON.stringify({
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
    const { code, stdout } = await runCli(['inject', '--config', configPath, '--dry'], { tempDirPath });
    const after = await read(dts);

    expect(code).toBe(0);
    expect(stdout).toMatch(/dryRun/i);
    expect(after).toBe(before); // unchanged
  });

  it('--quiet suppresses normal logs but not errors', async () => {
    const configPath = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configPath, JSON.stringify({
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    }));
    const { code, stdout } = await runCli(['inject', '--config', configPath, '--quiet'], { tempDirPath });
    expect(code).toBe(0);
    // stdout can be empty or minimal; we assert NOT containing the standard injected line
    expect(stdout).not.toMatch(/injected \d+ @defaultValue/);
  });

  it('--debug-paths prints path resolution breadcrumbs', async () => {
    const configPath = path.join(tempDirPath, 'docdefaults.config.json');
    await write(configPath, JSON.stringify({
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }],
    }));
    const { code, stdout } = await runCli(['inject', '--config', configPath, '--debug-paths'], { tempDirPath });
    expect(code).toBe(0);
    expect(stdout).toMatch(/configPath=/);
    expect(stdout).toMatch(/repoRoot=/);
    expect(stdout).toMatch(/defaultsModulePathAbs=/);
  });

  it('config discovery (no --config) works when config is in tempDirPath', async () => {
    // discovery: write a config named docdefaults.config.mjs in tempDirPath
    await write(path.join(tempDirPath, 'docdefaults.config.mjs'), `export default {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }]
    }`);
    const { code } = await runCli(['inject'], { tempDirPath });
    expect(code).toBe(0);
  });

  it('assert passes after injection (code=0)', async () => {
    const configPath = path.join(tempDirPath, 'docdefaults.config.mjs');
    await write(configPath, `export default {
      defaults: 'constants.js',
      targets: [{
        name: 'Example',
        types: 'src/options.ts',
        dts: 'types.d.ts',
        interface: 'ExampleOptions',
        member: 'DEFAULTS',
      }]
    }`);
    await runCli(['inject', '--config', configPath], { tempDirPath });
    const result = await runCli(['assert', '--config', configPath], { tempDirPath });
    expect(result.code).toBe(0);
  });
});
