# HagiCode Release Drafter - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

`@hagicode/hagi-release-drafter` is a composite GitHub Action (`action.yml`) that drafts the next stable `vX.Y.Z` release from Conventional Commits since the last release tag. It creates or updates a draft release and never publishes it. The same engine ships as the `hagi-release-drafter` CLI (`version` and `notes` subcommands) for local previews; the CLI reads git history only and never calls the GitHub API.

HagiCode repositories consume it as `HagiCode-org/hagi-release-drafter@<tag>` from their `release-draft-action.yml` workflows.

## Working Directory

Run commands from `repos/hagi-release-drafter/`.

## Key Commands

```bash
pnpm install
pnpm run typecheck
pnpm test                # node --test "test/**/*.test.ts"
pnpm run build           # tsc -p tsconfig.build.json -> dist/ (CLI only; gitignored)
pnpm run pack:check      # npm pack --dry-run
node dist/cli.js --help # run the compiled CLI after a build
```

Requires Node.js 24+. Scripts are TypeScript run directly by Node, so there is no bundle step for the action.

## Key Paths

- `action.yml`: composite action (inputs `version`, `title-template`, `github-token`; outputs `version`, `tag`, `notes-file`, `release-url`)
- `scripts/release-notes.ts`: the action's entry point (version derivation and notes rendering)
- `scripts/cli.ts`: CLI entry (`dist/cli.js` is the npm bin)
- `scripts/lib/`: shared engine (`release-tags.ts`, `commits.ts`, `aggregate.ts`, `render.ts`, `repo-input.ts`)
- `scripts/publish-draft.sh`: creates or edits the draft release through `gh`
- `scripts/npm-release.ts`: maintainer-only npm release tooling (`dev`, `verify`, `stamp`, `publish`); excluded from the package tarball
- `test/`: node tests, with `test/fixtures/` (including `make-fixture-repo.sh`), `test/golden/`, and `test/support/`
- `README*.md`: English plus nine translations (`zh-CN`, `zh-Hant`, `ja-JP`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`, `pt-BR`, `ru-RU`)
- `.github/workflows/`: `ci.yml`, `npm-publish.yml`, `release-draft.yml`

## Release & Publishing

- `ci.yml` (push and pull request, Node 24): typecheck, test, build, `npm pack --dry-run`, a compiled-CLI smoke test, and an action self-test against the fixture repository with a stub `gh`.
- `release-draft.yml` runs `uses: ./` on pushes to `main` (or manual dispatch with an optional stable `X.Y.Z`) to draft this repository's own release; publishing the draft stays manual.
- `npm-publish.yml` uses npm trusted publishing (OIDC) with provenance: pushes to `main` publish a `-dev.<run>.<attempt>.g<sha7>` prerelease to the `dev` dist-tag; a published stable `vX.Y.Z` release publishes to `latest`. Do not publish by hand.
- Consumers pin an immutable `vX.Y.Z` tag or the movable major tag `v1`; creating those tags is part of the action's own release process.

## Agent Guidelines

- Keep the action and the CLI on the same engine; their notes output must stay byte-identical (`test/cli-parity.test.ts`). `test/action-contract.test.ts` checks `action.yml`, so update it with any input, output, or step change.
- The action must never publish a release, delete drafts, or create or move git tags. Do not add a `publish` or `draft: false` input.
- Keep the action free of runtime dependencies and build steps; it runs `scripts/release-notes.ts` directly on Node.js 24. Dev dependencies are exact-pinned.
- Changes to version-bump rules, section mapping, the 100-entry limit, tier ordering, the `skip-release-notes` subject marker, or `--start-tag` / `--end-tag` semantics need matching updates to the golden tests and to every `README*.md`.
- Shallow checkouts must keep failing fast; consumers need `fetch-depth: 0` and `fetch-tags: true`.

## References

- `README.md`
- `action.yml`

## Package management

- The repository uses pnpm, pinned in `package.json` `packageManager`. Run `corepack enable` once, then `pnpm install`. `pnpm-lock.yaml` is the only lockfile; do not commit `package-lock.json`.
- Settings live in `pnpm-workspace.yaml`. `allowBuilds` lists the dependencies whose install scripts may run (reviewed individually, `false` means reviewed and denied); review any new dependency that has an install script and add it there.
- A local registry mirror belongs in `~/.npmrc` only. Never commit a `registry=` line or a mirror URL; `pnpm run check:registry` (also run in CI) fails on any non-`registry.npmjs.org` `tarball` in the lockfile and on mirror hosts in tracked files.
- Undeclared imports fail under pnpm's strict layout: declare the package instead of hoisting it.
