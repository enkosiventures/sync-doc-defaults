import path from 'node:path';
import { discoverConfig } from './config.js';
import { inject, assert } from './api.js';
import { Options, TsMode } from './types.js';

// exit codes:
// 0 = success
// 1 = assertion/validation failure
// 2 = config not found

type Subcommand = 'inject' | 'assert';

function usage(msg?: string): never {
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
                        Defaults to searching upward for:
                          docdefaults.config.(mjs|cjs|js|json)
  --dry                 (inject) Show changes but don’t write files
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
  process.exit(1);
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
    const cmd = argv[0] as Subcommand;
    if (!cmd || (cmd !== 'inject' && cmd !== 'assert')) usage('Missing or invalid command');

    let configPath: string | undefined;
    let quiet = false;
    let debugPaths = false;
    let dryRun = false;
    let tsMode: TsMode | undefined;
    let tag: 'default' | 'defaultValue' | undefined;

    console.warn(argv);
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if ((a === '-c' || a === '--config') && argv[i + 1]) { configPath = path.resolve(argv[++i]); continue; }
      if (a === '--quiet') { quiet = true; continue; }
      if (a === '--debug-paths') { debugPaths = true; continue; }
      if (a === '--dry') { dryRun = true; continue; }
      if (a === '--ts') { tsMode = coerceTsMode(argv[++i]); continue; }
      if (a === '--tag') { tag = (argv[++i] === 'defaultValue' ? 'defaultValue' : 'default'); continue; }
      usage(`Unknown option: ${a}`);
    }

    if (!configPath) {
      const found = await discoverConfig(process.cwd());
      if (!found) {
        console.error('[sync-doc-defaults] No config found. Looked for docdefaults.config.(mjs|cjs|js|json) up from cwd.');
        process.exit(2);
      }
      configPath = found;
    }

    const repoRoot = process.cwd(); // treat cwd as project root
    const opts: Options = { repoRoot, quiet, debugPaths, dryRun, tsMode, tag };

    if (cmd === 'inject') await inject(configPath, opts);
    else await assert(configPath, { ...opts, dryRun: false });

    process.exit(0);
  } catch (err: any) {
    const code = typeof err?.code === 'number' ? err.code : 1;
    console.error(`[sync-doc-defaults] ${err?.message ?? err}`);
    process.exit(code);
  }
}

main();










// #!/usr/bin/env node
// import { inject, assert as assertCmd } from './index.js';

// // exit codes:
// // 0 = success
// // 1 = assertion/validation failure
// // 2 = config not found


// function parseArgs(argv: string[]) {
//   const out: any = { _: [] as string[] };
//   for (let i = 0; i < argv.length; i++) {
//     const a = argv[i];
//     if (!a.startsWith('-')) { out._.push(a); continue; }
//     if (a === '-c' || a === '--config') out.config = argv[++i];
//     else if (a === '--dry') out.dry = true;
//     else if (a === '--quiet') out.quiet = true;
//     else if (a === '--debug-paths') out.debugPaths = true;
//     else if (a === '--ts') out.ts = (argv[++i] ?? 'auto');
//     else {
//       console.error(`Unknown option: ${a}\n`);
//       printUsage();
//       process.exitCode = 1;
//       return out;
//     }
//   }
//   return out;
// }

// function printUsage() {
//   console.log(
// `Usage:
//   docdefaults <inject|assert> [options]

// Options:
//   -c, --config <file>   Explicit config file (defaults to searching upward for docdefaults.config.*)
//   --dry                 (inject) Show changes but do not write files
//   --quiet               Minimal output
//   --debug-paths         Verbose resolution info
//   --ts <auto|on|off>    Override TS handling mode (default: auto)

// Examples:
//   docdefaults inject
//   docdefaults assert --quiet
//   docdefaults inject --dry --debug-paths
// `);
// }

// async function main() {
//   const [, , subcmd, ...rest] = process.argv;
//   if (!subcmd || (subcmd !== 'inject' && subcmd !== 'assert')) {
//     printUsage();
//     process.exitCode = 1;
//     return;
//   }

//   const args = parseArgs(rest);
//   if (!args) return;

//   const tsMode = (args.ts === 'on' || args.ts === 'off' || args.ts === 'auto') ? args.ts : undefined;

//   const common = {
//     repoRoot: process.cwd(),
//     quiet: !!args.quiet,
//     debugPaths: !!args.debugPaths,
//     tsMode,
//   } as const;

//   try {
//     if (subcmd === 'inject') {
//       const r = await inject(args.config, { ...common, dryRun: !!args.dry });
//       if (!args.quiet) {
//         // after receiving InjectResult r
//         const label = r.projectLabel ?? 'Project';
//         const files = r.targetResults.length;
//         console.log(`[sync-doc-defaults] ${label}: injected ${r.updated} @default update(s) across ${files} file(s)${args.dry ? ' (dry-run)' : ''}`);

//         // const note = args.dry ? ' (dry-run)' : '';
//         // console.log(`[sync-doc-defaults] ${r.projectLabel ?? 'Project'}: injected ${r.updated} @default update(s) → ${r.dtsPath}${note}`);
//       }
//       // Dry or not, success is exit code 0
//       process.exitCode = 0;
//     } else {
//       await assertCmd(args.config, common);
//       if (!args.quiet) {
//         console.log('[sync-doc-defaults] All defaults asserted OK');
//       }
//       process.exitCode = 0;
//     }
//   } catch (err: any) {
//     if (!args.quiet) console.error(err?.message ?? String(err));
//     process.exitCode = 1;
//   }
// }

// main().catch((e) => {
//   console.error(e);
//   process.exitCode = 1;
// });



