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

We use **Changesets** for automated versioning & publishing.

1. Ensure CI is green.
2. For each user-visible change, authors should have added a changeset:
   ```bash
   pnpm changeset
   ```

(choose patch/minor/major and write a short description)
3. Merge PRs as normal. The **Release** workflow will open/update a PR called **“Version Packages”**.
4. Review that PR (version bump + CHANGELOG). When it looks good, **merge it**.
5. CI on `main` will run `changeset publish` and publish to npm automatically.

**Notes**

* `assert` jobs in CI should remain on; publishing only happens on `main` with `NPM_TOKEN` present.
* If you need to include manual changes in a release (rare), create a changeset yourself and commit it to the branch.

Thanks 💙
