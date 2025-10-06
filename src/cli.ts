import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverConfig } from './config.js';
import { inject, assert } from './index.js';
import { TsMode } from './types.js';

// exit codes:
// 0 = success
// 1 = assertion/validation failure
// 2 = config not found

type Subcommand = 'inject' | 'assert';

function parseArgs(argv: string[]) {
  const out: any = { _: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) { out._.push(a); continue; }
    if (a === '-c' || a === '--config') out.config = argv[++i];
    else if (a === '--dry') out.dry = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--debug-paths') out.debugPaths = true;
    else if (a === '--ts') out.ts = (argv[++i] ?? 'auto');
    else {
      console.error(`Unknown option: ${a}\n`);
      printUsage();
      process.exitCode = 1;
      return out;
    }
  }
  return out;
}

function printUsage() {
  console.log(
`Usage:
  docdefaults <inject|assert> [options]

Options:
  -c, --config <file>   Explicit config file (defaults to searching upward for docdefaults.config.*)
  --dry                 (inject) Show changes but do not write files
  --quiet               Minimal output
  --debug-paths         Verbose resolution info
  --ts <auto|on|off>    Override TS handling mode (default: auto)

Examples:
  docdefaults inject
  docdefaults assert --quiet
  docdefaults inject --dry --debug-paths
`);
}

function usage(msg?: string): never {
  if (msg) console.error(msg);
  console.error(`
Usage:
  docdefaults <inject|assert> [options]

Options:
  -c, --config <file>   Explicit config file (defaults to searching upward for docdefaults.config.*)
  --dry                 (inject) Show changes but do not write files
  --quiet               Minimal output
  --debug-paths         Verbose resolution info
  --ts <auto|on|off>    Override TS handling mode (default: auto)

Examples:
  docdefaults inject
  docdefaults assert --quiet
  docdefaults inject --dry --debug-paths
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

    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if ((a === '-c' || a === '--config') && argv[i + 1]) { configPath = path.resolve(argv[++i]); continue; }
      if (a === '--quiet') { quiet = true; continue; }
      if (a === '--debug-paths') { debugPaths = true; continue; }
      if (a === '--dry') { dryRun = true; continue; }
      if (a === '--ts') tsMode = coerceTsMode(argv[++i]);
      usage(`Unknown option: ${a}`);
    }

    if (!configPath) {
      const found = await discoverConfig(process.cwd());
      if (!found) {
        console.error('[docdefaults] No config found. Looked for docdefaults.config.(mjs|cjs|js|json) up from cwd.');
        process.exit(2);
      }
      configPath = found;
    }

    const repoRoot = process.cwd(); // treat cwd as project root
    const opts = { repoRoot, quiet, debugPaths, dryRun, tsMode };

    if (cmd === 'inject') await inject(configPath, opts);
    else await assert(configPath, { ...opts, dryRun: false });

    process.exit(0);
  } catch (err: any) {
    const code = typeof err?.code === 'number' ? err.code : 1;
    console.error(`[docdefaults] ${err?.message ?? err}`);
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
//         console.log(`[docdefaults] ${label}: injected ${r.updated} @default update(s) across ${files} file(s)${args.dry ? ' (dry-run)' : ''}`);

//         // const note = args.dry ? ' (dry-run)' : '';
//         // console.log(`[docdefaults] ${r.projectLabel ?? 'Project'}: injected ${r.updated} @default update(s) → ${r.dtsPath}${note}`);
//       }
//       // Dry or not, success is exit code 0
//       process.exitCode = 0;
//     } else {
//       await assertCmd(args.config, common);
//       if (!args.quiet) {
//         console.log('[docdefaults] All defaults asserted OK');
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