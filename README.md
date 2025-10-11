# SyncDocDefaults

> Keep your TypeScript `.d.ts` files in sync with your runtime defaults.

[![npm version](https://img.shields.io/npm/v/sync-doc-defaults?color=blue)](https://www.npmjs.com/package/sync-doc-defaults)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tests](https://github.com/enkosiventures/sync-doc-defaults/actions/workflows/ci.yml/badge.svg)](https://github.com/enkosiventures/sync-doc-defaults/actions)

**SyncDocDefaults** automatically injects literal values from your runtime defaults into TypeScript declaration files (`.d.ts`) via JSDoc `@default` tags — and can assert that those declarations stay in sync in CI.

---

### Key benefits

| Feature           | Description                                        |
| ----------------- | -------------------------------------------------- |
| **Inject mode**   | Synchronize `@default` JSDoc tags automatically    |
| **Assert mode**   | Ensure `.d.ts` reflects real runtime values        |
| **TS-aware**      | Works with both TypeScript sources and compiled JS |
| **Simple config** | Just point to your defaults and interface          |
| **CI-ready**      | Clear exit codes and machine-readable results      |

---

## Why use it?

When writing library types, you often want consumers to see *real* default values inline:

```ts
export interface ExampleOptions {
  /**
   * Foo string.
   * @default "bar"
   */
  foo?: string;
}
```

...but those defaults actually live elsewhere:

```ts
// constants.ts
export const DEFAULTS = { foo: 'bar' };
```

Over time, those can drift apart. **SyncDocDefaults** eliminates that duplication.

✅ Source of truth = your runtime defaults
✅ `.d.ts` JSDoc updated automatically on build/publish
✅ CI can verify correctness (`assert` mode)

---

## Installation

```bash
pnpm add -D sync-doc-defaults
# or
npm i -D sync-doc-defaults
```

> Requires **Node 18+**

---

## CLI Overview

```bash
sync-doc-defaults inject    # Patch @default tags in .d.ts files
sync-doc-defaults assert    # Verify they are correct
```

Short alias:

```bash
sdd inject
sdd assert
```

### Typical usage

```bash
pnpm build
sdd inject
git diff   # View updated defaults in dist/*.d.ts
```

### In CI

```bash
pnpm build
sdd assert
```

### CLI Help

```
Usage:
  sync-doc-defaults <inject|assert> [options]
  sdd <inject|assert> [options]

Options:
  -c, --config <file>            Path to config file (searched upward if omitted)
  --dry                          (inject) Show changes without writing files
  --quiet                        Suppress normal logs
  --debug-paths                  Print detailed resolution breadcrumbs
  --ts <auto|on|off>             TypeScript mode (default: auto)
  --tag <default|defaultValue>   JSDoc tag to render for defaults (default: default)

Exit codes:
  0 success
  1 assertion / validation failure
  2 config not found
  3 loading or import error (missing file, tsx, etc.)
  4 invalid config
  5 CLI usage error
  6 unexpected / general error
```

---

## Configuration

By default, the CLI searches upward from `cwd` for one of:

* `docdefaults.config.(ts|mjs|cjs|js|json)` — **recommended**
* `sync-doc-defaults.config.(ts|mjs|cjs|js|json)` — explicit alternative

### Example (ESM)

```js
/** @type {import('sync-doc-defaults').DocDefaultsConfig} */
export default {
  // Path to the module exporting your defaults (TS, JS, or JSON)
  defaults: 'src/constants.ts',

  // Optional tsconfig path (used to infer declaration locations)
  tsconfig: 'tsconfig.json',

  // Optional preferred JSDoc tag to inject: 'default' (recommended) or 'defaultValue'
  tag: 'default',

  // One or more targets to sync
  targets: [
    {
      types: 'src/types.ts',           // Type source
      interface: 'ExampleOptions',     // Interface name
      dts: 'dist/types.d.ts',          // Optional explicit .d.ts path
      member: 'DEFAULTS',              // Exported symbol or dotted path
    },
  ],
};
```

### Resolution rules

* **Config discovery:** upward search for `docdefaults.config.*`, unless `--config` is provided.
* **Defaults module (`defaults`):** supports `.ts`, `.js`, `.json`.

  * `--ts auto` *(default)*: prefer built JS; fallback to `tsx` if present.
  * `--ts on`: require `tsx`; load TS directly.
  * `--ts off`: require compiled JS/JSON only.
  * Env override: `SYNCDOCDEFAULTS_TS=on|off|auto`
* **Built types (`dts`)**: inferred via your `tsconfig`’s `rootDir` and `declarationDir` if not specified.

---

## Build output requirements

`sync-doc-defaults` reads your **generated `.d.ts`** files to update JSDoc.
Ensure your build emits them before running.

**Example tsconfig:**

```jsonc
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist/src",
    "declaration": true,
    "declarationDir": "dist/types",
    "module": "ESNext",
    "target": "ES2020",
    "moduleResolution": "Bundler"
  }
}
```

> If using ESM, make sure all relative imports in your compiled JS include `.js` extensions (e.g. `import './util/logger.js'`).

---

## Example workflow

In `package.json`:

```json
{
  "scripts": {
    "build": "tsup",
    "test": "vitest",
    "types:inject": "pnpm build && sync-doc-defaults inject",
    "types:assert": "pnpm build && sync-doc-defaults assert"
  }
}
```

---

## Complex default values

**SyncDocDefaults** automatically serializes primitives (`string`, `number`, `boolean`, `null`) and JSON-serializable objects.

### Arrays and objects

Short values are written inline:

```ts
/** @default ["a","b","c"] */
items?: string[];
```

Nested or long objects are pretty-printed:

```ts
/**
 * @default
 * {
 *   "retry": 3,
 *   "backoffMs": 200
 * }
 */
options?: { retry?: number; backoffMs?: number };
```

### Computed or non-serializable values

Functions, classes, and other computed defaults cannot be serialized automatically.
Document them manually:

```ts
/**
 * @default computed at runtime
 * @remarks Derived from NODE_ENV and feature flags.
 */
transform?: (input: string) => string;
```

or:

```ts
/**
 * @default "DefaultTransform"
 * @remarks See src/transform/default.ts
 */
transform?: (input: string) => string;
```

---

## Development

* Modular architecture: `src/dts-ops/*`, `src/infra/*`, etc.
* Run tests locally:

  ```bash
  pnpm vitest
  ```
* Use `--dry` to preview injected blocks without writing files.

---

## Troubleshooting

### “The JS module appears to be ESM but is being loaded without ESM context”

**Fix**

* Add `"type": "module"` to the nearest `package.json`
* or rename the file to `.mjs`
* or run within a project that already uses ESM.

---

### “Failed to import built JS … (ts mode=off)”

Likely your compiled JS has missing `.js` extensions.

**Fix**

* Add `.js` to all **relative** imports in compiled JS
* or run with `--ts on` / `SYNCDOCDEFAULTS_TS=on`
* or `pnpm add -D tsx` and keep `--ts auto`

---

### “Could not load <path> … build, tsx, or --ts on”

**Fix**

* Build your project so compiled JS exists in your `outDir`
* or install `tsx` locally and keep `--ts auto`
* or force TypeScript loading with `--ts on`

---

### “ts mode is "on" but "tsx" is not installed in the target project”

**Fix**
Add `tsx` to your project (not globally):

```bash
pnpm add -D tsx
```

---

> For path-resolution breadcrumbs, pass `--debug-paths` or set `SYNCDOCDEFAULTS_DEBUG_PATHS=1`.

---

## License

MIT © [Enkosi Ventures](https://enkosiventures.com)

---

## Contributing & Security

See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started, and [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

---

### Related tools

* [`typedoc`](https://typedoc.org/) — generate full API docs
* [`changesets`](https://github.com/changesets/changesets) — version & release automation used here
