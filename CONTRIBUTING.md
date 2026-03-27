# Contributing to @nxsflow/amplify-email

## Getting Started

```bash
git clone https://github.com/nxsflow/amplify-email.git
cd amplify-email
pnpm install
```

### Development Commands

```bash
pnpm build        # Compile to dist/ (tsup, ESM + CJS)
pnpm dev          # Watch mode
pnpm test         # Run vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check
pnpm format       # biome format --write
```

## Project Structure

```
src/
├── index.ts         # Public API barrel
├── types.ts         # EmailProps, EmailResources interfaces
├── factory.ts       # EmailFactory + defineEmail()
└── construct.ts     # AmplifyEmail CDK construct

test/
├── unit/            # Factory logic, prop validation (no CDK Stack)
└── construct/       # CDK Template assertions (SES, DNS, Lambda, IAM)

dist/                # Build output (not committed)
```

## Testing

Run all tests:

```bash
pnpm test
```

### When to Write Which Test

- **Unit tests** (`test/unit/`): Pure logic — factory behavior, prop validation, error messages. No `App` or `Stack` needed.
- **Construct tests** (`test/construct/`): CloudFormation output assertions using `Template.fromStack()`. Test that the synthesized template contains the expected AWS resources.

## Making Changes

### 1. Branch from main

```bash
git checkout -b feat/my-feature main
```

### 2. Make your changes

Follow the existing code style. Run `pnpm format` before committing.

### 3. Add a changeset

Every user-facing change needs a changeset:

```bash
pnpm changeset
```

Choose the bump type:
- **patch**: Bug fix, docs, internal refactor
- **minor**: New feature, new export, new optional prop
- **major**: Breaking change to public API

Commit the `.changeset/*.md` file with your feature.

### 4. Open a PR

Push your branch and open a pull request against `main`. CI runs build, typecheck, test, and lint.

## Versioning

This project uses [Changesets](https://github.com/changesets/changesets) for version management. Versions follow [Semantic Versioning](https://semver.org/):

| Bump | When | Example |
|------|------|---------|
| `patch` | Bug fix, docs, internal refactor, new optional prop with default | Fix DKIM record name |
| `minor` | New optional `EmailProps` field, new export, new utility | Add `wireEmailToAuth()` |
| `major` | Rename prop, change `EmailResources` shape, remove export | Rename `domain` to `mailDomain` |

### Pre-release Channels

Pre-releases allow testing unreleased versions before they reach `latest`:

| Channel | Version format | Install command |
|---------|---------------|-----------------|
| Alpha | `0.2.0-alpha.0` | `pnpm add @nxsflow/amplify-email@alpha` |
| Beta | `0.2.0-beta.0` | `pnpm add @nxsflow/amplify-email@beta` |
| Stable | `0.2.0` | `pnpm add @nxsflow/amplify-email` |

**Alpha** is for early iteration (breaking changes expected). **Beta** is feature-complete and fully validated. **Stable** requires manual approval.

## Release Process

### Stable Releases

1. Merge your PR (with changeset) to `main`
2. CI creates a "Version Packages" PR that bumps `package.json` and updates `CHANGELOG.md`
3. A maintainer reviews and merges the Version Packages PR
4. CI publishes to npm with the `latest` tag

### Pre-releases

1. Create a branch: `git checkout -b alpha/my-feature`
2. Enter pre-release mode: `pnpm changeset pre enter alpha`
3. Add changesets: `pnpm changeset`
4. Bump version: `pnpm changeset version`
5. Push to the branch — CI publishes with the `alpha` dist-tag

Replace `alpha` with `beta` for beta releases (which run full test + lint gates).

## Claude Code Users

This project includes Claude Code skills with deeper guidance:

- **cdk-testing**: Test organization, CDK assertions API, concrete assertion recipes
- **version-management**: Changesets workflow, pre-release channels, dist-tags
- **release-management**: CI/CD pipeline, GitHub Actions, tiered quality gates
