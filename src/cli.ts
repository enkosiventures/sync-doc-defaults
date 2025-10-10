import path from 'node:path';
import type { Options, TsMode } from './types.js';
import { discoverConfig } from './infra/config.js';
import { inject, assert } from './api.js';
import { EXIT_CODES } from './constants.js';
import { configNotFound, usageError } from './errors.js';
import { defaultLogger } from './infra/log.js';


// exit codes:
// 0 = success/help
// 1 = assertion/validation failure
// 2 = config not found
// 3 = loading error
// 4 = invalid config
// 5 = usage error
// 6 = general error

type Subcommand = 'inject' | 'assert';

function usage(code: number, message?: string): never {
  if (message) defaultLogger.error(message);
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

function coerceTsMode(value: any | undefined): TsMode | undefined {
  if (value == null) return undefined;
  const coerced = String(value).toLowerCase();
  if (coerced === 'on' || coerced === 'off' || coerced === 'auto') return coerced;
  throw usageError(`Invalid value for --ts: ${coerced}. Use on|off|auto.`);
}

async function main() {
  try {
    const argv = process.argv.slice(2);

    // --help / -h and --version fast paths
    if (argv.includes('--help') || argv.includes('-h')) usage(0);
    if (argv.includes('--version') || argv.includes('-v')) {
      // lazy load to avoid ESM import at top
      const pkg = await import('../package.json', { assert: { type: 'json' } } as any).catch(() => null);
      defaultLogger.log(pkg?.default?.version ?? 'unknown');
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
        if (!argv[i + 1]) throw usageError('Missing value for --ts (use on|off|auto)');
        tsMode = coerceTsMode(argv[++i]);
        continue;
      }
      throw usageError(`Unknown option: ${a}`);
    }

    if (!configPath) {
      const found = await discoverConfig(process.cwd());
      if (!found) {
        throw configNotFound(process.cwd());
      }
      configPath = found;
    }

    const repoRoot = process.cwd(); // treat cwd as project root
    const options: Options = { repoRoot, quiet, debugPaths, dryRun, tsMode, tag };

    if (cmd === 'inject') await inject(configPath, options);
    else await assert(configPath, { ...options, dryRun: false });

    process.exit(EXIT_CODES.SUCCESS);
  } catch (err: any) {
    const exitCode =
      typeof err?.exitCode === 'number' ? err.exitCode :
      typeof err?.code === 'number' ? err.code :
      EXIT_CODES.GENERAL_ERROR;
    defaultLogger.error(err?.message ?? String(err));
    process.exit(exitCode);
  }
}

main();
