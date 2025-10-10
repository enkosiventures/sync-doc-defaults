import path from 'node:path';
import type { Options, TsMode } from './types.js';
import { discoverConfig } from './infra/config.js';
import { inject, assert } from './api.js';
import { EXIT_CODES } from './constants.js';


// exit codes:
// 0 = success/help
// 1 = assertion/validation failure
// 2 = config not found
// 3 = general error

type Subcommand = 'inject' | 'assert';

function usage(code: number, msg?: string): never {
  if (msg) console.error(msg);
  console.error(`
sync-doc-defaults v1.0.0

Usage:
  sync-doc-defaults <inject|assert> [options]
  sdd <inject|assert> [options]

Commands:
  inject     Write @default docs into .d.ts files based on your constants module
  assert     Verify @default docs match your constants (no writes)

Options:
  -c, --config <file>   Path to config file.
                        Defaults to searching upward for either:
                          * docdefaults.config.(mjs|cjs|js|json)
                          * sync-doc-defaults.config.(mjs|cjs|js|json)
  --dry                 (inject) Show changes but don't write files
  --quiet               Minimal output
  --debug-paths         Print path-resolution breadcrumbs
  --ts <auto|on|off>    TypeScript handling mode (default: auto)
  --tag <default|defaultValue>
                        JSDoc tag to render for defaults (default: default)

Env:
  SYNCDOCDEFAULTS_TS=auto|on|off            Overrides --ts
  SYNCDOCDEFAULTS_TAG=default|defaultValue  Overrides --tag
  SYNCDOCDEFAULTS_QUIET=1                   Silences routine logs
  SYNCDOCDEFAULTS_DEBUG_PATHS=1             Enables path breadcrumbs

Examples:
  sync-doc-defaults inject
  sync-doc-defaults assert --quiet
  sdd inject --dry --debug-paths
  pnpm dlx sync-doc-defaults inject -c ./docdefaults.config.mjs
`);
  process.exit(code);
}

function coerceTsMode(val: any | undefined): TsMode | undefined {
  if (val == null) return undefined;
  const v = String(val).toLowerCase();
  if (v === 'on' || v === 'off' || v === 'auto') return v;
  throw new Error(`Invalid value for --ts: ${val}. Use on|off|auto.`);
}

async function main() {
  try {
    const argv = process.argv.slice(2);

    // --help / -h and --version fast paths
    if (argv.includes('--help') || argv.includes('-h')) usage(0);
    if (argv.includes('--version') || argv.includes('-v')) {
      // lazy load to avoid ESM import at top
      const pkg = await import('../package.json', { assert: { type: 'json' } } as any).catch(() => null);
      console.log(pkg?.default?.version ?? 'unknown');
      process.exit(0);
    }
    const cmd = argv[0] as Subcommand;
    if (!cmd || (cmd !== 'inject' && cmd !== 'assert')) usage(1, 'Missing or invalid command');

    let configPath: string | undefined;
    let quiet = false;
    let debugPaths = false;
    let dryRun = false;
    let tsMode: TsMode | undefined;
    let tag: 'default' | 'defaultValue' | undefined;

    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if ((a === '-c' || a === '--config') && argv[i + 1]) { configPath = path.resolve(argv[++i]); continue; }
      if (a === '--quiet') { quiet = true; continue; }
      if (a === '--debug-paths') { debugPaths = true; continue; }
      if (a === '--dry') { dryRun = true; continue; }
      if (a === '--tag') { tag = (argv[++i] === 'defaultValue' ? 'defaultValue' : 'default'); continue; }
      if (a === '--ts') {
        if (!argv[i + 1]) usage(1, 'Missing value for --ts (use on|off|auto)');
        tsMode = coerceTsMode(argv[++i]);
        continue;
      }
      usage(1, `Unknown option: ${a}`);
    }

    if (!configPath) {
      const found = await discoverConfig(process.cwd());
      if (!found) {
        console.error('[sync-doc-defaults] No config found. Looked for docdefaults.config.(mjs|cjs|js|json) up from cwd.');
        process.exit(EXIT_CODES.CONFIG_NOT_FOUND);
      }
      configPath = found;
    }

    const repoRoot = process.cwd(); // treat cwd as project root
    const opts: Options = { repoRoot, quiet, debugPaths, dryRun, tsMode, tag };

    if (cmd === 'inject') await inject(configPath, opts);
    else await assert(configPath, { ...opts, dryRun: false });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (err: any) {
    const code = typeof err?.code === 'number' ? err.code : EXIT_CODES.GENERAL_ERROR;
    console.error(`[sync-doc-defaults] ${err?.message ?? err}`);
    process.exit(code);
  }
}

main();
