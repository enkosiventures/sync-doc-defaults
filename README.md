# SyncDocDefaults

**SyncDocDefaults** keeps your generated TypeScript declaration files (`.d.ts`) in sync with your runtime defaults.

It automatically **injects** literal values into JSDoc `@default` tags in `.d.ts` files, and can **assert** that the declarations remain aligned during CI.

---

## Why?

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

…but those defaults actually live in runtime code:

```ts
// defaults.ts (or constants.ts — your choice)
export const DEFAULTS = {
  foo: "bar",
};
```

Without automation, the two can drift. **SyncDocDefaults** eliminates this duplication:

* Source of truth = your runtime defaults object.
* `.d.ts` JSDoc is patched at build/publish time.
* CI can enforce correctness.

---

## Install

```bash
pnpm add -D sync-doc-defaults
# or
npm i -D sync-doc-defaults
```

---

## CLI

SyncDocDefaults has two commands:

```bash
sync-doc-defaults inject    # patch @default tags in .d.ts
sync-doc-defaults assert    # verify they are correct
```

A short alias is also provided:

```bash
sdd inject
sdd assert
```

### Usage

```bash
pnpm build
sdd inject
git diff   # see updated defaults in dist/*.d.ts
```

In CI:

```bash
pnpm build
sdd assert
```

### Help

```
Usage:
  sync-doc-defaults <inject|assert> [options]

Options:
  -c, --config <file>   Explicit config file (otherwise searched)
  --dry                 (inject) Show changes but do not write files
  --quiet               Minimal output
  --debug-paths         Verbose resolution info
  --ts <auto|on|off>    TypeScript loading mode (default: auto)

Examples:
  sync-doc-defaults inject
  sync-doc-defaults assert --quiet
  sync-doc-defaults inject --dry --debug-paths
```

Exit codes:

* `0` success
* `1` assertion/validation failure
* `2` config file not found

---

## Configuration

Place a config at your project root. By default we search upward from `cwd` for either:

* `docdefaults.config.(mjs|cjs|js|json)` ← nice, short, and reads well, or
* `sync-doc-defaults.config.(mjs|cjs|js|json)` ← explicit package name

**Recommended (ESM):**

```js
/** @type {import('sync-doc-defaults').DocDefaultsConfig} */
export default {
  // Path (relative to repo root) to the module that exports your defaults.
  // Can be TS or JS/JSON; when TS is used, we load it via compiled JS if present
  // or via tsx when allowed by --ts=auto|on.
  defaults: 'src/constants.ts',

  // Optional: path to the tsconfig we should inspect to infer built .d.ts locations
  tsconfig: 'tsconfig.json',

  // Which tag the tool should render into JSDoc: 'default' (recommended) or 'defaultValue'
  defaultTag: 'default',

  // One or more targets to sync
  targets: [
    {
      // Path to the source type that declares the interface
      types: 'src/types.ts',

      // Name of the interface in that file / in the emitted .d.ts
      interface: 'ExampleOptions',

      // Optional explicit path to the built .d.ts (if omitted, inferred from tsconfig)
      builtTypes: 'dist/types.d.ts',

      // The exported member (symbol or dotted path) inside your defaults module
      // e.g. "DEFAULTS" or "DEFAULTS.subsection"
      member: 'DEFAULTS',
    },
  ],
};
```

### Resolution rules

* **Config discovery:** searches for `docdefaults.config.*` or `sync-doc-defaults.config.*` from `cwd` upward unless `--config` is given.
* **Defaults module (`defaults`):** may be TS/JS/JSON.

  * `--ts auto` (default): if compiled JS exists, use it; otherwise try `tsx` to load TS.
  * `--ts on`: require `tsx`; load TS directly.
  * `--ts off`: require compiled JS/JSON; do not attempt TS.
  * Env override supported: `SYNCDOCDEFAULTS_TS=on|off|auto` (legacy `DOCDEFAULTS_TS` also accepted).
* **Built types (`builtTypes`):** if omitted, inferred from your `tsconfig` (`rootDir` + `outDir` or `declarationDir`). Provide it explicitly if your layout is unusual.

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

If you emit declarations with a separate `tsc` step, just ensure `builtTypes` (or a tsconfig that leads there) is available before running the tool.

---

## Development

* Modular code (`src/config.ts`, `src/source-loader.ts`, `src/dts-ops/*`, etc.).
* Tests use [Vitest](https://vitest.dev/). Run with:

  ```bash
  pnpm vitest
  ```
* Dry runs (`--dry`) show the exact interface block(s) that would be changed.

---

## FAQ

**Why `@default` and not `@defaultValue`?**
We support either, but we recommend `@default` for static values. (Pass `defaultTag: 'defaultValue'` if you prefer.)

**Do I need `tsup`/`tsx` to use the CLI?**
No. They’re internal dev deps for *this* package. As a consumer you just install `sync-doc-defaults`. If you point `defaults` at TS and don’t have compiled JS, `--ts auto` will use `tsx` if you have it; otherwise set `--ts off` and provide compiled JS/JSON.

---

## License

MIT. Contributions welcome!

---
