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

<p>
  <a href="https://www.npmjs.com/package/@hagicode/hagi-release-drafter"><img alt="npm version" src="https://img.shields.io/npm/v/@hagicode/hagi-release-drafter?logo=npm"></a>
  <a href="https://www.npmjs.com/package/@hagicode/hagi-release-drafter"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@hagicode/hagi-release-drafter?logo=npm"></a>
  <a href="https://github.com/HagiCode-org/hagi-release-drafter/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/HagiCode-org/hagi-release-drafter/ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://github.com/HagiCode-org/hagi-release-drafter/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/HagiCode-org/hagi-release-drafter?logo=github"></a>
  <a href="https://nodejs.org/"><img alt="Node.js >=24" src="https://img.shields.io/node/v/@hagicode/hagi-release-drafter?logo=nodedotjs&logoColor=white"></a>
  <a href="https://www.conventionalcommits.org/"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white"></a>
</p>

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

## Entry limit

A release body renders at most **100 commit entries**. Section headings, the footer, and the
empty-range text do not count. A range with 100 or fewer candidate commits renders every commit.

Each candidate gets a priority tier from its Conventional Commit type. The first matching rule wins.

| Tier | Matches |
| --- | --- |
| 1 | Breaking changes of any type, and `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert`, and any commit with scope `security` (case-insensitive). `fix(security)` stays in Tier 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test`, and subjects that do not follow the Conventional Commits format |

Above 100 candidates, commits are omitted from the lowest tier upward until 100 remain:

1. Tier 4 before Tier 3, Tier 3 before Tier 2, and Tier 2 before Tier 1.
2. Inside Tier 1, `feat` before breaking changes.
3. Unscoped before scoped.
4. Older before newer.

To keep a security-relevant `chore`, `ci`, or `docs` commit out of Tier 4, give it the scope `security`,
for example `chore(security): rotate signing key`.

When any commit is omitted, the body ends with a footer such as
`_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`.
The footer links the compare view from the last stable tag to `HEAD`, or the commit list when no stable
tag exists.

The limit affects only the rendered body. The version is still derived from every candidate commit,
including the omitted ones.

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

## Local preview with the CLI

The same engine runs on your machine as `hagi-release-drafter`, so you can preview the version and
release notes before a release. The CLI reads git history only. It never publishes, never calls the
GitHub API, and needs no token. Its only writes go to stdout, stderr, the `--output` file, and the URL cache.

### Run and install

The CLI needs Node.js 24 or later and git. From a clone of this repository, build the compiled CLI once:

```bash
npm ci
npm run build
node dist/cli.js --help
```

To put the command on your `PATH`, pack the package and install the tarball:

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### Subcommands and repository inputs

| Command | Prints |
| --- | --- |
| `hagi-release-drafter version` | The next stable version, for example `1.4.0`. |
| `hagi-release-drafter notes` | The release body. For one repository in the default output it is byte-identical to the action's notes file. |

With no input, the current directory is used when it is a git working tree. Otherwise give one or more
inputs, either as `--repo <input>` (repeatable) or as positional arguments. An input is a local path to a
git working tree, or an HTTPS `github.com` URL, with or without a `.git` suffix. Inputs are processed in
order, one repository at a time.

```bash
# The current repository
hagi-release-drafter version
hagi-release-drafter notes

# Commit links when the repository has no github.com origin remote
hagi-release-drafter notes --github-repository HagiCode-org/hagi-release-drafter

# Several repositories in one report
hagi-release-drafter version ./repos/a ./repos/b
hagi-release-drafter notes --layout merged --repo ./repos/a --repo https://github.com/HagiCode-org/hagi-release-drafter

# JSON for other tools, written to a file
hagi-release-drafter notes --format json --output report.json ./repos/a ./repos/b

# An explicit version, for one repository only
hagi-release-drafter version --version 2.0.0 ./repos/a
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--repo <input>` | A repository input. Repeatable. |
| `--layout <name>` | `per-repo` (default) or `merged`. Changes the Markdown report only. |
| `--format <name>` | `markdown` (default) or `json`. |
| `--output <file>` | Write the result to a file. Stdout stays empty. |
| `--version <X.Y.Z>` | Use this stable version instead of the derived one. Accepted for one repository only. |
| `--github-repository <owner/name>` | The identity for commit links. Applies to every input and overrides the `origin` remote. |
| `--cache-dir <dir>` | The cache root for URL clones. See below. |
| `--fail-fast` | Stop after the first failed repository. |
| `-h`, `--help` | Show usage. |

### Layouts and formats

- **`per-repo`** (default) starts with a summary table: repository, status, version, last stable tag, and
  commit count. Each repository then gets a `###` block whose sections sit at `####`. A failed repository
  has an empty version and a block that states the reason.
- **`merged`** gives one `## Changes` section. Its sections hold the entries of every successful repository,
  each labelled with its repository name. Each repository is pruned to one hundred entries before merging.
- **`--format json`** prints one object with a `repositories` array in input order. Each row has `input`,
  `name`, and `status`. Successful rows add `version`, `lastTag`, `commitCount`, and `notes`. Failed rows add
  `error`. JSON always uses the per-repository shape, so `--layout` does not change it.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every repository succeeded. |
| `1` | At least one repository failed. The reason goes to stderr and into the report. A failed single repository prints nothing to stdout. |
| `2` | Usage error, and nothing was computed. This covers an unknown subcommand or flag, an invalid version, layout, or format, a rejected input, a duplicate input, and `--version` with several inputs. |

### Cache location

A URL input is cloned with full history and all tags to `<root>/repos/<owner>/<name>`. The root is
`--cache-dir` when given, otherwise `$XDG_CACHE_HOME/hagi-release-drafter`, otherwise
`~/.cache/hagi-release-drafter`. Later runs fetch tags and history into the same clone. Nothing is evicted
automatically, so delete a clone directory to reclaim space. Private repositories use the git credentials you
already have. A URL that contains a username or password is rejected.

### What the CLI does not do

- It does not publish, create, or edit a release, and it does not call the GitHub API. It reads no token,
  and `GH_TOKEN` and `GITHUB_TOKEN` have no effect.
- It does not change any local repository you give it. Refs, tags, and the working tree stay as they were.
- The action does not use the CLI. It still runs `scripts/release-notes.ts` directly on Node.js 24, so it
  needs no build step. The npm package ships the compiled `dist/cli.js`, built from the same sources.

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
