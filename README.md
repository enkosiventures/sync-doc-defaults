# DocDefaults

**DocDefaults** is a lightweight utility that keeps your generated TypeScript declaration files (`.d.ts`) in sync with your runtime defaults.

It automatically **injects** literal values into JSDoc `@defaultValue` tags in `.d.ts` files, and can **assert** that the declarations remain aligned during CI.

---

## Why?

When writing library types, you often want consumers to see real default values inline:

```ts
export interface ExampleOptions {
  /**
   * Foo string.
   * @defaultValue "bar"
   */
  foo?: string;
}
````

…but those defaults actually live in runtime code:

```ts
// constants.ts
export const DEFAULTS = {
  foo: "bar",
};
```

Without automation, the two can drift. **DocDefaults** eliminates this duplication:

* Source of truth = your runtime defaults object.
* `.d.ts` JSDoc is patched at build/publish time.
* CI can enforce correctness.

---

## Install

```bash
npm install --save-dev docdefaults
# or
pnpm add -D docdefaults
```

---

## Usage

DocDefaults has two commands:

```bash
docdefaults inject    # patch @defaultValue tags in .d.ts
docdefaults assert    # verify they are correct
```

### Example

```bash
pnpm build
pnpm docdefaults inject
git diff # see updated defaults in dist/types/*.d.ts
```

In CI:

```bash
pnpm build
pnpm docdefaults assert
```

---

## Configuration

Place a `docdefaults.config.mjs` in your project root:

```js
export default {
  // Path to the compiled module (JS/JSON) that exports your defaults
  defaultsModulePath: "dist/constants.js",

  // One or more target interfaces
  targets: [
    {
      name: "Example options",         // just an optional label for logs
      srcPath: "src/options.ts",        // source file declaring the interface
      // dtsPath optional — inferred from tsconfig if omitted
      interfaceName: "ExampleOptions",         // interface name
      defaultsRef: "DEFAULTS",       // exported symbol with defaults
    },
  ],
};
```

### Resolution rules

* **Config discovery**: if `--config` is not provided, DocDefaults searches upward from `cwd` for `docdefaults.config.(mjs|cjs|js|json)`.
* **Defaults source**: only `source` imports are supported — no inline constants in config. This ensures a single source of truth.
* **d.ts inference**: if `dtsPath` is omitted, DocDefaults inspects your nearest `tsconfig.json` (`rootDir` + `outDir` / `declarationDir`) to locate the emitted `.d.ts`.

---

## CLI Options

```bash
docdefaults inject [--config <file>] [--dry] [--quiet] [--debug-paths]
docdefaults assert [--config <file>] [--quiet] [--debug-paths]
```

* `--config <file>`: explicit config file path. If omitted, search upwards.
* `--dry`: with `inject`, preview changes but do not write files.
* `--quiet`: minimal logging.
* `--debug-paths`: verbose logging of path resolution.
* `--ts on|off|auto`: Control TypeScript loading (default: auto)
  * `auto` - Use compiled JS if found; otherwise use TS via tsx if available
  * `on` -   Force TS via tsx; error if tsx is not installed
  * `off` -  Do not use tsx; require compiled JS to exist


Exit codes:

* `0` success
* `1` assertion or validation failure
* `2` config file not found

---

## Example Workflow

In `package.json`:

```json
{
  "scripts": {
    "build:types": "tsc -p tsconfig.types.json",
    "types:inject": "pnpm build:types && docdefaults inject",
    "types:assert": "pnpm build:types && docdefaults assert"
  }
}
```

---

## Development

* Code is modular and testable (`src/config.ts`, `src/source-loader.ts`, `src/dts-ops.ts`, etc.).
* Tests use [Vitest](https://vitest.dev/).
* Run tests with:

```bash
pnpm vitest
```

---

### Loading TypeScript constants (zero-config by default)

DocDefaults will import your `src/constants.ts` without a build if you have `tsx` installed:

```bash
pnpm add -D tsx
```

Then `docdefaults inject` “just works” on `.ts`.
If there’s a compiled JS next to it (inferred from your tsconfig), we use that instead (fast & deterministic).

You can force behavior:

* `DOCDEFAULTS_TS=1` or `--ts on` → always import `.ts` via tsx; error if tsx isn’t installed.

* `DOCDEFAULTS_TS=0` or `--ts off` → never import `.ts`; require a build.

We recommend keeping `tsx` as a devDependency for the best DX in development, and letting CI rely on built JS for speed.

---

## FAQ

**Can I use inline defaults in config?**
No. Inline constants are not supported — DocDefaults enforces a single source of truth by reading directly from your runtime defaults module.

**Do I need to run it before or after build?**
Run after build, so that `defaultsModulePath` points to compiled JS/JSON.

---

## License

MIT. Contributions welcome!

```

---
