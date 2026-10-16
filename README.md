<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.zh-Hant.md">繁體中文</a> ·
  <a href="./README.ja-JP.md">日本語</a> ·
  <a href="./README.ko-KR.md">한국어</a> ·
  <a href="./README.de-DE.md">Deutsch</a> ·
  <a href="./README.fr-FR.md">Français</a> ·
  <a href="./README.es-ES.md">Español</a> ·
  <a href="./README.pt-BR.md">Português (Brasil)</a> ·
  <a href="./README.ru-RU.md">Русский</a>
</p>

# hagi-release-drafter

A composite GitHub Action that drafts the next stable `vX.Y.Z` release from the
[Conventional Commits](https://www.conventionalcommits.org/) made since the last stable tag.
It creates a GitHub draft release, or updates the existing draft, and **never publishes it**.
Publishing the draft stays a manual step in the GitHub UI.

The action runs a dependency-free Node.js script, so it needs no build step and no bundled artifact.

## Usage

Add a workflow to the consumer repository:

```yaml
name: Release draft

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      version:
        description: Optional stable X.Y.Z to use instead of the version derived from commits
        required: false
        type: string

permissions:
  contents: read

concurrency:
  group: release-draft
  cancel-in-progress: false

jobs:
  draft:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          fetch-tags: true
          persist-credentials: false
      - uses: HagiCode-org/hagi-release-drafter@v1
        with:
          version: ${{ inputs.version }}
          title-template: 'Example v{version}'
```

The `concurrency` group stops two runs from creating or editing the draft at the same time.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | No | `''` (derive from commits) | Stable `X.Y.Z` to use instead of the derived version. Values with a leading `v` or a pre-release suffix are rejected. |
| `title-template` | No | `v{version}` | Release title. `{version}` is replaced with the bare `X.Y.Z` version. The tag is always `v{version}`. |
| `github-token` | No | `${{ github.token }}` | Token for GitHub API calls. The calling job must grant `contents: write`. |

## Outputs

| Output | Example | Description |
| --- | --- | --- |
| `version` | `1.4.0` | Resolved stable version, without a leading `v`. |
| `tag` | `v1.4.0` | Release tag. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Path of the rendered release body on the runner. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL of the created or updated draft. |

## Permissions

- The job that calls the action needs `contents: write` to create or edit the draft.
- The checkout needs only `contents: read`.
- The action does not require `pull-requests` permission, and no other write scope.

## Checkout requirements

Version and notes are computed from the full git history and its tags. Check out with
`fetch-depth: 0` and `fetch-tags: true`. A shallow checkout fails fast with a message that
names these inputs, rather than silently producing `0.1.0`.

## How the version is chosen

1. The base is the newest stable `vX.Y.Z` tag reachable from `HEAD`. Pre-release tags such as
   `v1.3.0-beta.1` and non-semver tags are ignored.
2. A breaking change bumps the major version, or the minor version while the major is `0`.
3. A `feat` commit bumps the minor version and resets the patch.
4. Any other set of commits bumps the patch version.
5. With no stable tag yet, the version is `0.1.0`.
6. The `version` input overrides the derived version. The commits in the notes do not change.

Notes always cover the commits after the newest stable tag.

## Conventional Commit vocabulary and sections

Each commit lands in the first section whose rule it matches. Empty sections are omitted, and
commits keep git's newest-first order.

| Section | Matches |
| --- | --- |
| Breaking Changes | Any commit with `!` after the type or scope, or a `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Every other type, including subjects that do not follow the Conventional Commits format. |

Each entry is rendered as `- **scope:** description ([`short-sha`](commit-url))`. The scope
prefix is omitted when a commit has no scope.

## Tagging policy

- Each release of this action gets an immutable `vX.Y.Z` tag.
- A movable major tag `v1` points at the newest `1.x.y` release.
- Consumers pin `@v1` to receive compatible fixes. Pin an exact `@vX.Y.Z` for full reproducibility.

Creating these tags is part of the action's own release process, not of a consumer's workflow.

## What the action does not do

- It does not publish a release. It has no `publish` or `draft: false` input, and it never runs
  an operation that changes a draft to published.
- It does not create or move git tags. The draft points at the checked-out `HEAD` commit.
- It does not delete drafts. When several drafts exist it edits the first one that GitHub returns,
  so a maintainer who keeps several drafts must clean them up manually.

## Runner requirements

- GitHub-hosted runners include `gh` and `git`. On a self-hosted runner, install the GitHub CLI.
- The action installs Node.js 24 itself through `actions/setup-node`.

## Development

```bash
npm ci
npm test
```

This repository drafts its own releases with the action itself: `.github/workflows/release-draft.yml`
runs `uses: ./` on every push to `main`. It creates or updates a draft and never publishes it.

The unit tests cover the ported release-notes logic, a stub-`gh` test of the draft script, and a
contract test of `action.yml`. CI also runs a self-test: it builds
`test/fixtures/make-fixture-repo.sh`, runs the action against that repository with a read-only
token and a stub `gh`, and asserts the version, the tag, and the section headings.

## License

Not yet decided. A license must be chosen before this repository is published.
