---
name: release-management
description: CI/CD pipeline and publishing workflow for @nxsflow/amplify-email — GitHub Actions workflows, tiered quality gates (alpha/beta/stable), npm dist-tags, manual fallback, and rollback. Use when publishing to npm, setting up CI/CD, or managing releases.
---

# Release Management: @nxsflow/amplify-email

CI/CD pipeline and publishing workflow. How code gets from main to npm.

## Branch Strategy

| Branch | Purpose | Dist-tag | Trigger |
|--------|---------|----------|---------|
| `main` | Stable releases | `latest` | Merge "Version Packages" PR |
| `alpha/*` | Alpha pre-releases | `alpha` | Push to branch |
| `beta/*` | Beta pre-releases | `beta` | Push to branch |

Pre-release mode (`changeset pre enter`) is only used on feature branches, never on main.

---

## Tiered Quality Gates

| Channel | Gates | Rationale |
|---------|-------|-----------|
| `alpha` | `pnpm build` + `pnpm typecheck` | Fast iteration, types must be sound |
| `beta` | + `pnpm test` + `pnpm lint` | Feature-complete, full validation |
| `stable` | + manual approval (GitHub environment protection) | Rock-solid, human sign-off |

---

## GitHub Actions Workflows

### `ci.yml` — PR validation

Runs on all pull requests to main. All four gates must pass.

```yaml
name: CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm lint
```

### `release.yml` — stable release

Runs on push to main. Creates a "Version Packages" PR when changesets are pending, or publishes when that PR is merged.

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm lint
      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### `prerelease.yml` — alpha/beta release

Runs on push to `alpha/*` or `beta/*` branches. Alpha gets build+typecheck only; beta gets all four gates.

```yaml
name: Pre-release

on:
  push:
    branches:
      - "alpha/**"
      - "beta/**"

concurrency:
  group: prerelease-${{ github.ref }}
  cancel-in-progress: true

jobs:
  prerelease:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck
      # Beta branches get full validation
      - name: Run tests (beta only)
        if: startsWith(github.ref, 'refs/heads/beta/')
        run: pnpm test
      - name: Run lint (beta only)
        if: startsWith(github.ref, 'refs/heads/beta/')
        run: pnpm lint
      # Determine dist-tag from branch prefix
      - name: Publish pre-release
        run: |
          TAG=$(echo "${{ github.ref_name }}" | cut -d'/' -f1)
          pnpm changeset publish --tag "$TAG"
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## npm Setup

### Repository Secrets

| Secret | Purpose | Where to get it |
|--------|---------|-----------------|
| `NPM_TOKEN` | Publish to npm | npmjs.com → Access Tokens → Generate (Automation type) |
| `GITHUB_TOKEN` | Create PRs, push tags | Provided automatically by GitHub Actions |

### GitHub Environment

Create a `production` environment in GitHub repo settings:
1. Settings → Environments → New environment → "production"
2. Add required reviewers (at least one)
3. The `release.yml` workflow references this environment for manual approval

### First Publish

Scoped packages (`@nxsflow/*`) default to private on npm. The first publish must use:

```bash
pnpm publish --access public
```

After the first publish, subsequent publishes via `pnpm changeset publish` inherit the access level.

---

## What Gets Published

Only the `dist/` directory is published (controlled by `"files": ["dist"]` in `package.json`):

```
dist/
├── index.js      ← ESM entry
├── index.cjs     ← CJS entry
├── index.d.ts    ← TypeScript types
└── *.js.map      ← source maps
```

Consumers import as:

```typescript
import { defineEmail } from "@nxsflow/amplify-email";
```

---

## Manual Fallback

For publishing without CI (e.g., CI is broken, urgent hotfix):

### Stable Release

```bash
# 1. Ensure clean main branch
git checkout main && git pull

# 2. Build and verify (all gates)
pnpm build && pnpm typecheck && pnpm test && pnpm lint

# 3. Version bump
pnpm changeset version
git add package.json CHANGELOG.md .changeset
git commit -m "chore(release): bump version"

# 4. Publish with latest tag
pnpm changeset publish
git push --follow-tags
```

### Pre-release

```bash
# 1. Ensure correct branch
git checkout alpha/my-feature

# 2. Build and verify (alpha: build + typecheck only)
pnpm build && pnpm typecheck

# 3. Version bump
pnpm changeset version
git add package.json CHANGELOG.md .changeset
git commit -m "chore(release): bump alpha version"

# 4. Publish with explicit dist-tag
pnpm changeset publish --tag alpha
git push --follow-tags
```

### Safety Checklist

Before any manual publish:

- [ ] Correct branch? (`main` for stable, `alpha/*` or `beta/*` for pre-release)
- [ ] All tier-appropriate gates pass?
- [ ] Correct dist-tag? (never publish pre-release without `--tag`)
- [ ] `npm view @nxsflow/amplify-email dist-tags` shows expected state after publish?

---

## Rollback

| Scenario | Action |
|----------|--------|
| Within 72 hours | `npm unpublish @nxsflow/amplify-email@X.Y.Z` |
| After 72 hours | `npm deprecate @nxsflow/amplify-email@X.Y.Z "use X.Y.Z+1"` + publish patch |
| Pre-release | Publish the next pre-release number (`-alpha.1` replaces `-alpha.0`) |

**Note:** `npm unpublish` removes the version entirely. Use it only for broken releases, not for "I changed my mind about the version number."
