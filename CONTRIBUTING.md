# Contributing to sync-doc-defaults

Thanks for helping improve **sync-doc-defaults**!

## Development setup

- Node **18+**
- PNPM (see `packageManager` in package.json)

```bash
pnpm i
pnpm build
pnpm test
```

### Running tests

* Unit tests:

  ```bash
  pnpm test
  ```
* Watch mode:

  ```bash
  pnpm test:watch
  ```
* Coverage:

  ```bash
  pnpm test:coverage
  ```

### Project structure

* `src/` – library + CLI
* `src/dts-ops/` – parsing/injection/assertion internals
* `test/` – unit + e2e tests

### Commit style

Use clear, conventional commit messages (e.g., `fix:`, `feat:`, `chore:`).
This helps with changelogs and release notes.

### Pull requests

1. Fork & create a feature branch
2. Add tests for changes
3. `pnpm build && pnpm test` must pass
4. Update docs if needed (README, examples)
5. Open a PR with a clear summary

### Releasing (maintainers)

* Ensure CI is green
* Bump version
* `pnpm publish --access public`
* Create a GitHub release with highlights

Thanks 💙
