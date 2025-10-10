# SyncDocDefaults

> Keep your TypeScript `.d.ts` files in sync with your runtime defaults.

[![npm version](https://img.shields.io/npm/v/sync-doc-defaults?color=blue)](https://www.npmjs.com/package/sync-doc-defaults)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Tests](https://github.com/enkosiventures/sync-doc-defaults/actions/workflows/ci.yml/badge.svg)](https://github.com/enkosiventures/sync-doc-defaults/actions)

**SyncDocDefaults** automatically injects literal values from your runtime defaults into TypeScript declaration files (`.d.ts`) via JSDoc `@default` tags — and can assert that those declarations stay in sync in CI.

---

### Key benefits at a glance

| Feature           | Description                                     |
| ----------------- | ----------------------------------------------- |
| **Inject mode**   | Synchronize `@default` JSDoc tags automatically |
| **Assert mode**   | Ensure `.d.ts` reflects real runtime values     |
| **TS-aware**      | Works with both TS sources and compiled JS      |
| **Simple config** | Just point to your defaults and interface       |
| **CI-ready**      | Exit codes for clean automation                 |

---

## Why use it?

When writing library types, you often want consumers to see *real* default values inline:

```ts
export interface ExampleOptions {
  /**
   * Foo string.
   * 
   * @default "bar"
   */
  foo?: string;
}
```

...but those defaults actually live elsewhere:

```ts
// constants.ts
export const DEFAULTS = {
  foo: 'bar',
};
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

* Requirements: Node 18+

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
  1 assertion/validation failure
  2 config not found
  3 general error
```

---

## Configuration

By default, the CLI searches upward from `cwd` for:

* `docdefaults.config.(mjs|cjs|js|json)` — **recommended**, short and readable
* or `sync-doc-defaults.config.(mjs|cjs|js|json)` — explicit alternative

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
      // Type source declaring the interface
      types: 'src/types.ts',

      // Name of the interface in that file / in the emitted .d.ts
      interface: 'ExampleOptions',

      // Optional explicit .d.ts (inferred from tsconfig if omitted)
      dts: 'dist/types.d.ts',

      // Exported symbol or dotted path within your defaults module
      // e.g. "DEFAULTS" or "DEFAULTS.subsection"
      member: 'DEFAULTS',
    },
  ],
};
```

### Resolution rules

* **Config discovery:** upward search for `docdefaults.config.*` or `sync-doc-defaults.config.*`, unless `--config` is provided.
* **Defaults module (`defaults`):** supports `.ts`, `.js`, or `.json`.

  * `--ts auto` *(default)*: use compiled JS if available, else `tsx`.
  * `--ts on`: require `tsx`; load TS directly.
  * `--ts off`: require compiled JS/JSON only.
  * Environment override: `SYNCDOCDEFAULTS_TS=on|off|auto`.
* **Built types (`dts`)**: inferred via your `tsconfig`'s `rootDir` and `declarationDir` if not provided.

---

## Build output requirements

`syn​c-doc-defaults` reads your **generated `.d.ts`** files to update JSDoc. Make sure your build produces them:

**Option A — tsc**
```jsonc
// tsconfig.json
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

Then:

```bash
pnpm tsc -p tsconfig.json
```

**Option B — tsup**

```ts
// tsup.config.ts
export default {
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,         // emits .d.ts
  outDir: 'dist'
};
```

> **ESM note:** in compiled JS, include the `.js` extension on **all relative imports** (e.g., `import './util/logger.js'`), otherwise Node will error with `ERR_MODULE_NOT_FOUND`.

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

If declarations are emitted by a separate `tsc` step, ensure `.d.ts` files exist before running the tool.

---

## Complex default values

SyncDocDefaults handles simple literals (`string`, `number`, `boolean`, `null`) automatically.  
For more complex values like arrays or objects, the tool serializes them as JSON in the `@default` tag.

### Arrays and objects

Short values are written inline:

```ts
/** @default ["a","b","c"] */
items?: string[];
```

Longer or nested values are written as pretty-printed JSON on separate lines:

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

> Tip: Multiline `@default` blocks are supported and safe across CRLF/LF line endings.

### Computed or non-serializable values

Functions, classes, `Date`, `RegExp`, and other computed defaults are **not injected directly**, since they can't be represented as static JSON.
Instead, document them using a descriptive string:

```ts
/**
 * @default computed at runtime
 * @remarks Derived from NODE_ENV and feature flags.
 */
transform?: (input: string) => string;
```

or reference the symbolic name:

```ts
/**
 * @default "DefaultTransform"
 * @remarks See src/transform/default.ts
 */
transform?: (input: string) => string;
```

### Advanced customization

If you need more control, future versions will support a custom serializer hook in config, e.g.:

```js
serializeDefault(prop, value) {
  if (typeof value === 'function') return '"<computed>"';
  return JSON.stringify(value);
}
```

This will let you override how specific property values are rendered without breaking assertions.

---

## Development

* Modular architecture: `src/infra/*`, `src/dts-ops/*`, etc.

* Tests run with [Vitest](https://vitest.dev/):

  ```bash
  pnpm vitest
  ```

* `--dry` mode shows the exact interface block(s) that would be changed.

---

## FAQ

**Why use `@default` instead of `@defaultValue`?**
Both are supported. `@default` is recommended for literal values (`defaultTag: 'defaultValue'` to use the alternative).

**Do I need `tsup` or `tsx` installed?**
No. They're used only for *this* package's own build.
If your defaults are TS and no compiled JS exists, `--ts auto` will use `tsx` if available; otherwise set `--ts off` and reference built JS/JSON instead.

---

## Troubleshooting

### “The JS module appears to be ESM but is being loaded without ESM context”
You’ll see something like:
```

[sync-doc-defaults] The JS module appears to be ESM but is being loaded without ESM context.
Add {"type":"module"} to the nearest package.json or rename the file to ".mjs".
Path: <path>
Original error: To load an ES module ... / Unexpected token 'export'

```
**Fixes**
- Add `"type": "module"` to the nearest `package.json`, or
- Rename the file to `.mjs`, or
- Run your config/defaults from within a package that already has `"type": "module"`.

---

### “Failed to import built JS … (ts mode=off)”
Typical when ESM imports inside your built JS are missing extensions:
```

[sync-doc-defaults] Failed to import built JS dist/src/constants.js (ts mode=off).
Likely fixes:
• If using ESM, add ".js" to all relative imports (e.g., "./util/logger.js").
• Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to load TS via tsx.
• Or install tsx locally: pnpm add -D tsx
Paths: rootDir=<rootDir>  outDir=<outDir>  declarationDir=<declarationDir>
Original error: ERR_MODULE_NOT_FOUND ...

```
**Fixes**
- Add `.js` to all **relative** ESM imports in your compiled JS (Node ESM requires the extension).
- Or run with `--ts on` / `SYNCDOCDEFAULTS_TS=on` to load TypeScript via `tsx`.
- Or `pnpm add -D tsx` and keep `--ts auto`.

---

### “Could not load <path> … build, tsx, or --ts on”
```

Could not load src/constants.ts.
Options:
• Build your project so compiled JS exists in dist/src.
• Or install tsx locally: pnpm add -D tsx
• Or run with "--ts on" (or set SYNCDOCDEFAULTS_TS=on) to force TS loading.

```
**Fixes**
- Run your JS build so the compiled file exists in your `outDir`, or
- Install `tsx` locally and keep `--ts auto`, or
- Force TypeScript loading with `--ts on`.

---

### “SYNCDOCDEFAULTS_TS=on / --ts on … ‘tsx’ is not installed”
```

SYNCDOCDEFAULTS_TS=on / --ts on set but "tsx" is not installed in the target project.
Install with: pnpm add -D tsx

```
**Fix**
- Add `tsx` to **your project** (not just globally): `pnpm add -D tsx`.

---

> **Tip:** For path resolution breadcrumbs, pass `--debug-paths` (or set `SYNCDOCDEFAULTS_DEBUG_PATHS=1`).

---

## License

MIT © [Enkosi Ventures](https://enkosiventures.com).
Contributions and PRs welcome!

---

## Contributing & Security

See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started, and [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

---

### Related packages

* [`typedoc`](https://typedoc.org/) — complementary tool for generating API docs

---
