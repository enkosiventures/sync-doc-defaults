/**
 * Shared types used across the doc-defaults tool.
 * These types are intentionally framework-agnostic and small so they can be
 * imported from both the library code and the CLI.
 */

/**
 * How TypeScript sources should be handled at runtime. 
 * - 'auto': Try using pre-compiled `.js`, fallback to importing TypeScript sources via `tsx` if available
 * - 'on': Always import TypeScript sources via `tsx` (ESM loader).
 * - 'off': Never import TypeScript sources. Require built JS to exist
 */
export type TsMode = 'auto' | 'on' | 'off';

/**
 * Which JSDoc tag to emit for defaults in `.d.ts` files.
 *  - `@default` is the modern, widely-supported choice.
 *  - `@defaultValue` is sometimes preferred by older tooling.
 */
export type DefaultTag = 'default' | 'defaultValue';

/**
 * Parsed JSDoc block for a property/interface member.
 */
export type Jsdoc = {
  /** Lines of human description above the tags (no leading `*`). */
  description: string[];
  /** Structured tags (`@tag …`) preserved in order of appearance. */
  tags: Array<{ tag: string; text: string }>;
};

/**
 * Common knobs for commands (library & CLI) that operate in a repository.
 */
export interface RunOptions {
  /**
   * Absolute path to the project root the user intends to operate in.
   * If omitted, callers typically default this to `process.cwd()`.
   */
  repoRoot?: string;

  /**
   * When true, write nothing to disk. Operations still compute diffs and
   * return results as if they had written, so callers can preview changes.
   */
  dryRun?: boolean;

  /** Suppress routine logs; still print actionable errors. */
  quiet?: boolean;

  /** Verbose path-resolution breadcrumbs for debugging. */
  debugPaths?: boolean;

  /**
   * TypeScript handling mode. See {@link TsMode}.
   * Defaults to `'auto'` unless overridden by CLI flags or env.
   */
  tsMode?: TsMode;

  /**
   * Which JSDoc tag to render for defaults. See {@link DefaultTag}.
   * Defaults to `'default'`.
   */
  defaultTag?: DefaultTag;
}

/**
 * A resolved snapshot of how the target project builds TypeScript.
 * These paths are read from the nearest tsconfig (or supplied overrides).
 */
export type LoadedTsProject = {
  /** Absolute path to the project root whose tsconfig was used. */
  projectRoot: string;

  /** Absolute path to the tsconfig that was resolved (if any). */
  tsconfigPathAbs?: string;

  /**
   * `compilerOptions.rootDir` (absolute), if present.
   * Used to map `.ts` files in `src` and `.js` files in `dist` when inferring built output.
   */
  rootDir?: string;

  /**
   * `compilerOptions.outDir` (absolute), if present.
   * When set, built JS is expected under this directory.
   */
  outDir?: string;

  /**
   * `compilerOptions.declarationDir` (absolute), if present.
   * When set, generated `.d.ts` files are expected here.
   */
  declarationDir?: string;

  /** The effective TypeScript handling mode used while loading. */
  tsMode?: TsMode;
};

/**
 * Lightweight, internal options used by lower-level helpers that don’t need
 * the full `RunOptions` surface (e.g., they’re called with a resolved root).
 */
export type Options = {
  /** Absolute repo root these operations should treat as the base. */
  repoRoot: string;

  /** Suppress routine logs; still print actionable errors. */
  quiet?: boolean;

  /** Verbose path-resolution breadcrumbs for debugging. */
  debugPaths?: boolean;

  /**
   * When true, write nothing to disk. Helpers that can modify files should
   * honor this and return the would-be content instead.
   */
  dryRun?: boolean;

  /** Effective TypeScript handling mode (see {@link TsMode}). */
  tsMode?: TsMode;
};

/* ----------------------------------------------------------------------------
 * High-level configuration and results
 * ------------------------------------------------------------------------- */

/**
 * A single “target” to inject/assert defaults for.
 * Each target binds a TypeScript **source** (where the interface is declared),
 * a **.d.ts** surface (where we inject doc comments), and a **defaults symbol**
 * in your constants module.
 */
export interface DocDefaultsTarget {
  /**
   * Short cosmetic label for logs (e.g., the feature or bundle name).
   */
  name?: string;

  /**
   * Repo-relative path to the TypeScript file that declares the interface
   * (e.g., `packages/foo/src/types.ts`).
   * Used to infer the emitted `.d.ts` location when `dtsPath` is omitted.
   */
  srcPath: string;

  /**
   * Optional repo-relative path to the concrete `.d.ts` to rewrite
   * (e.g., `packages/foo/dist/types/types.d.ts`).
   * If omitted, we attempt to infer it from `tsconfig` (`rootDir`/`declarationDir`).
   */
  dtsPath?: string;

  /**
   * The **interface name** inside the `.d.ts` that should receive `@default`
   * doc comments.
   */
  interfaceName: string;

  /**
   * The symbol (or dotted path) inside your constants module to read defaults from.
   * Examples:
   *   - `"DEFAULTS"` (top-level object)
   *   - `"DEFAULTS.consent"` (nested property)
   */
  defaultsRef: string;
};

/**
 * Top-level configuration for the tool. Usually stored in `docdefaults.config.*`.
 */
export interface DocDefaultsConfig {
  /**
   * Optional repo-relative tsconfig path.
   * If omitted, the tool searches upward from `repoRoot` for a suitable tsconfig.
   * Used to discover `rootDir`, `outDir`, and `declarationDir`.
   */
  tsconfigPath?: string;

  /**
   * Repo-relative module path for the defaults (constants) source.
   * This is imported (built JS first, then TS via `tsx` if needed) so we can
   * read the object referenced by `defaultsRef` in each target.
   */
  defaultsModulePath: string;

  /**
   * Preferred JSDoc tag to render when injecting defaults.
   */
  defaultTag?: DefaultTag;

  /**
   * Optional human-readable project label (appears in CLI output).
   * Does not affect behavior.
   */
  label?: string;

  /**
   * One or more targets to process in order.
   */
  targets: DocDefaultsTarget[];
}

/**
 * Per-target result for an **inject** run.
 */
export interface InjectTargetResult {
  /** The interface name that was processed. */
  interfaceName: string;

  /** Repo-relative path to the `.d.ts` that was updated. */
  dtsPath: string;

  /** Number of properties that received an inserted/replaced default doc. */
  updated: number;

  /**
   * Properties that were requested but not found in the interface body.
   * The interface still counts as processed even if some props were missing.
   */
  missing: Array<{ prop: string }>;
}

/**
 * Aggregated result for an **inject** run across all targets.
 */
export interface InjectResult {
  /**
   * Total number of per-property updates across all targets.
   * (Sum of `InjectTargetResult.updated`.)
   */
  updated: number;

  /** Echo of {@link DocDefaultsConfig.label} if provided. */
  projectLabel?: string;

  /** Detailed per-target outcomes. */
  targetResults: InjectTargetResult[];
}

/**
 * Per-target result for an **assert** run.
 * Only contains mismatches/missing properties (no updates occur).
 */
export interface AssertTargetResult {
  /** The interface name that was asserted. */
  interfaceName: string;

  /** Repo-relative path to the `.d.ts` file that was checked. */
  dtsPath: string;

  /**
   * Each entry describes a property whose doc default did not match
   * the expected literal (or was missing).
   */
  missing: Array<{ prop: string; expected: string; found?: string }>;
}

/**
 * Aggregated result for an **assert** run across all targets.
 */
export interface AssertResult {
  /** Echo of {@link DocDefaultsConfig.label} if provided. */
  projectLabel?: string;

  /** Detailed per-target mismatches. */
  targetResults: AssertTargetResult[];
}