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

一个复合 GitHub Action，用于根据自上一个发布标签（稳定或预发布）以来的 [Conventional Commits](https://www.conventionalcommits.org/) 提交，草拟下一个稳定版本 `vX.Y.Z` 的发布。它会创建 GitHub 草稿发布，或更新已有的草稿，**从不发布**。发布草稿仍需在 GitHub 界面中手动完成。

该 Action 运行一个无依赖的 Node.js 脚本，因此不需要构建步骤，也没有打包产物。

## 用法

在使用方仓库中添加一个工作流：

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

`concurrency` 分组可防止两次运行同时创建或编辑同一个草稿。

## 输入

| 输入 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `version` | 否 | `''`（从提交推导） | 用于替代推导版本的稳定 `X.Y.Z`。带前导 `v` 或预发布后缀的值会被拒绝。 |
| `title-template` | 否 | `v{version}` | 发布标题。`{version}` 会被替换为不带前缀的 `X.Y.Z`。标签始终为 `v{version}`。 |
| `github-token` | 否 | `${{ github.token }}` | 用于 GitHub API 调用的令牌。调用方 job 必须授予 `contents: write`。 |

## 输出

| 输出 | 示例 | 说明 |
| --- | --- | --- |
| `version` | `1.4.0` | 解析出的稳定版本，不带前导 `v`。 |
| `tag` | `v1.4.0` | 发布标签。 |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | runner 上渲染出的发布正文路径。 |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | 已创建或更新的草稿 URL。 |

## 权限

- 调用该 Action 的 job 需要 `contents: write` 才能创建或编辑草稿。
- checkout 只需要 `contents: read`。
- 该 Action 不需要 `pull-requests` 权限，也不需要其他写入权限。

## Checkout 要求

版本和发布说明基于完整的 git 历史及其标签计算。请使用 `fetch-depth: 0` 和 `fetch-tags: true` 进行检出。浅克隆会快速失败并提示这两个输入项，而不会悄悄得出 `0.1.0`。

## 版本如何选定

1. 基准是从 `HEAD` 可达、按 SemVer 2.0 排序的优先级最高的发布标签。`v0.1.0-beta.97` 之类的预发布标签也计入，`v0.1.0-beta.100` 排在 `v0.1.0-beta.97` 之上，稳定标签排在其自身预发布标签之上。不符合发布标签语法的标签会被忽略：构建元数据（`+`）、前导零，以及 `release-2` 之类的非 semver 名称。
2. 版本由基准标签的核心 `X.Y.Z` 推导。破坏性变更会提升主版本号；主版本为 `0` 时则提升次版本号。
3. `feat` 提交会提升次版本号，并将补丁版本号归零。
4. 其他提交组合会提升补丁版本号。
5. 若从 `HEAD` 无法到达任何发布标签，版本为 `0.1.0`，发布说明涵盖完整历史。
6. `version` 输入会覆盖推导出的版本。发布说明中的提交内容不会因此改变。

发布说明始终涵盖基准标签之后、直到范围末端的提交。末端为 `HEAD`，除非 CLI 的 `--end-tag` 将某个仓库的范围结束于某个发布标签。CLI 的 `--start-tag` 可以固定某个仓库的基准标签，这是选择不同基准的唯一方式。

**有界范围。** 使用 `--end-tag` 的仓库，其版本取自结束标签的核心 `X.Y.Z`，而不是按提升规则推导，因为它的范围描述的是一个已经存在的发布。例如，`v0.1.0-beta.95` 得到 `0.1.0`。`--version` 仍可覆盖它。没有 `--end-tag` 时，上述规则保持不变。

**行为变更：** Action 与 CLI 共用这条规则。对于可达标签中包含预发布标签的仓库，现在得到的范围和版本与本 Action 早期版本给出的不同。只有稳定发布标签的仓库不受影响。

## Conventional Commit 词汇与分节

每个提交会落入其匹配的第一个分节。空分节会被省略，提交保持 git 的最新优先顺序。

| 分节 | 匹配规则 |
| --- | --- |
| Breaking Changes（破坏性变更） | 类型或作用域后带 `!` 的任何提交，或带 `BREAKING CHANGE:` 或 `BREAKING-CHANGE:` 页脚的提交。 |
| Features（新功能） | `feat` |
| Fixes（问题修复） | `fix` |
| Performance（性能优化） | `perf` |
| Documentation（文档） | `docs` |
| Maintenance（维护） | `build`、`ci`、`chore`、`refactor`、`revert`、`style`、`test` |
| Other Changes（其他变更） | 所有其他类型，包括不符合 Conventional Commits 格式的主题。 |

每个条目渲染为 `- **scope:** description ([`short-sha`](commit-url))`。若提交没有作用域，则省略作用域前缀。

### 将提交排除在发布说明之外

**主题**（标题行）包含 `skip-release-notes` 的提交会被排除在发布说明之外。匹配不区分大小写，按子串进行，例如 `docs: reword intro (skip-release-notes)`。该标记始终生效；没有任何输入、标志或配置可以开启或关闭它。只检查主题，因此正文或页脚中提到该短语不会隐藏提交。

被跳过的提交视同不在范围内：

- 它不会被渲染，也不计入条目上限、`Showing N of M commits` 页脚或 JSON 的 `commitCount`。
- 它不会改变版本。被跳过的 `feat:` 不会引起次版本提升；版本按该提交不存在的情况推导。
- 当范围内的所有提交都被跳过时，发布说明显示 `_No changes yet._`。

## 条目上限

一份发布正文最多渲染 **100 个提交条目**。章节标题、页脚和空范围文本不计入。候选提交不超过 100 个时，全部渲染。

CLI 会针对每个仓库报告候选提交数以及已渲染的条目数，因此被截断的变更日志绝不会悄无声息。上限本身不变。

每个候选提交都会根据其 Conventional Commit 类型获得一个优先级层级，按第一条匹配的规则确定。

| 层级 | 匹配 |
| --- | --- |
| 1 | 任意类型的破坏性变更，以及 `feat` |
| 2 | `fix`、`perf` |
| 3 | `refactor`、`revert`，以及作用域为 `security` 的提交（不区分大小写）。`fix(security)` 仍在层级 2。 |
| 4 | `build`、`chore`、`ci`、`docs`、`style`、`test`，以及不符合 Conventional Commits 格式的主题 |

候选超过 100 个时，从最低层级开始省略，直到剩下 100 个：

1. 层级 4 先于层级 3，层级 3 先于层级 2，层级 2 先于层级 1。
2. 在层级 1 内，`feat` 先于破坏性变更。
3. 无作用域的先于有作用域的。
4. 较早的先于较新的。

若要让与安全相关的 `chore`、`ci` 或 `docs` 提交脱离层级 4，请为其添加作用域 `security`，例如 `chore(security): rotate signing key`。

有提交被省略时，正文末尾会出现页脚，例如 `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`。链接指向从基准标签（可能是稳定标签或预发布标签）到 `HEAD` 的比较页面；若不存在发布标签，则指向提交列表。

条目上限只影响渲染的正文。版本号仍然基于全部候选提交计算，包括被省略的提交。

## 标签策略

- 该 Action 的每个发布都会获得不可变的 `vX.Y.Z` 标签。
- 可移动的主版本标签 `v1` 指向最新的 `1.x.y` 发布。
- 使用方固定 `@v1` 即可接收兼容的修复。若需完全可复现，请固定精确的 `@vX.Y.Z`。

创建这些标签属于该 Action 自身的发布流程，而非使用方工作流的一部分。

## 该 Action 不做什么

- 不发布 release。它没有 `publish` 或 `draft: false` 输入，从不执行将草稿改为已发布的操作。
- 不创建或移动 git 标签。草稿指向检出的 `HEAD` 提交。
- 不删除草稿。存在多个草稿时，它会编辑 GitHub 返回的第一个草稿，因此保留多个草稿的维护者需要手动清理。

## 使用 CLI 本地预览

同一个引擎也以 `hagi-release-drafter` 的形式在你的机器上运行，因此你可以在发布前预览版本和发布说明。CLI 只读取 git 历史。它从不发布，从不调用 GitHub API，也不需要令牌。它仅写入 stdout、stderr、`--output` 文件和 URL 缓存。

### 运行与安装

CLI 需要 Node.js 24 或更高版本以及 git。在本仓库的克隆中，先构建一次编译后的 CLI：

```bash
npm ci
npm run build
node dist/cli.js --help
```

若要将该命令放到 `PATH` 上，请打包并安装 tarball：

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### 子命令与仓库输入

| 命令 | 输出 |
| --- | --- |
| `hagi-release-drafter version` | 下一个稳定版本，例如 `1.4.0`。 |
| `hagi-release-drafter notes` | 发布正文。对于默认输出下的单个仓库，它与 Action 的 notes 文件逐字节一致。 |

没有输入时，若当前目录是 git 工作树，则使用当前目录。否则请提供一个或多个输入，可以写成 `--repo <input>`（可重复），也可以作为位置参数。输入可以是 git 工作树的本地路径，或 HTTPS 的 `github.com` URL，带不带 `.git` 后缀均可。输入按顺序处理，一次一个仓库。

```bash
# The current repository
hagi-release-drafter version
hagi-release-drafter notes

# Commit links when the repository has no github.com origin remote
hagi-release-drafter notes --github-repository HagiCode-org/hagi-release-drafter

# Several repositories in one report
hagi-release-drafter version ./repos/a ./repos/b
hagi-release-drafter notes --layout merged --repo ./repos/a --repo https://github.com/HagiCode-org/hagi-release-drafter

# Start one repository's range at a prerelease tag; the other keeps automatic selection
hagi-release-drafter version --start-tag ./repos/b=v0.1.0-beta.97 ./repos/a ./repos/b

# Notes for a release that is already cut: only the commits between two release tags
hagi-release-drafter notes --start-tag ./hagicode-core=v0.1.0-beta.94 --end-tag ./hagicode-core=v0.1.0-beta.95 ./hagicode-core

# JSON for other tools, written to a file
hagi-release-drafter notes --format json --output report.json ./repos/a ./repos/b

# An explicit version, for one repository only
hagi-release-drafter version --version 2.0.0 ./repos/a
```

### 标志

| 标志 | 含义 |
| --- | --- |
| `--repo <input>` | 一个仓库输入。可重复。 |
| `--layout <name>` | `per-repo`（默认）或 `merged`。只改变 Markdown 报告。 |
| `--format <name>` | `markdown`（默认）或 `json`。 |
| `--output <file>` | 将结果写入文件。stdout 保持为空。 |
| `--version <X.Y.Z>` | 使用该稳定版本，而不是推导出的版本。只接受用于一个仓库。 |
| `--github-repository <owner/name>` | 提交链接所用的标识。适用于每个输入，并覆盖 `origin` 远程。 |
| `--start-tag <input>=<tag>` | 让某个仓库的范围从这个发布标签开始，而不是从最新的标签开始。`<input>` 必须与仓库的写法完全一致，例如 `./web`，因此 `web` 和 `./web` 是不同的输入。该标签必须存在，并且可从该仓库的 `HEAD` 到达。可重复，每个仓库一个。 |
| `--end-tag <input>=<tag>` | 让某个仓库的范围结束于这个发布标签（例如 `v0.1.0-beta.95`），而不是 `HEAD`。适用与 `--start-tag` 相同的规则，且该标签必须存在并可从该仓库的 `HEAD` 到达。未给出 `--start-tag` 时，起点是结束标签之下最新的发布标签。此时版本为该标签的核心 `X.Y.Z`，除非给出 `--version`。可重复，每个仓库一个。 |
| `--cache-dir <dir>` | URL 克隆的缓存根目录。见下文。 |
| `--fail-fast` | 在第一个失败的仓库之后停止。 |
| `-h`、`--help` | 显示用法。 |

### 布局与格式

- **`per-repo`**（默认）以一个汇总表开头：仓库、状态、版本、最近标签、提交数和已渲染数。提交数是所有候选提交，已渲染数是发布说明中展示的条目数。随后每个仓库有一个 `###` 块，其分节位于 `####`。失败的仓库版本为空，其块会说明原因。
- **`merged`** 给出一个 `## Changes` 分节。其各分节包含所有成功仓库的条目，每个条目标注其仓库名称。每个仓库在合并前会被裁剪到一百个条目。被截断的仓库会在第一个分节之前有一行，例如 `_hagicode-core: showing 100 of 1324 commits._`。
- **`--format json`** 输出一个带 `repositories` 数组的对象，按输入顺序排列。每一行都有 `input`、`name` 和 `status`。成功的行还有 `version`、`lastTag`、`lastTagSource`（`pinned` 或 `auto`）、`endTag`（有界范围的结束标签，否则为 `null`）、`commitCount`（候选提交数）、`renderedCount`（`notes` 中的条目数）、`truncated` 和 `notes`。失败的行还有 `error`。JSON 始终使用按仓库的结构，因此 `--layout` 不会改变它。

### 退出码

| 代码 | 含义 |
| --- | --- |
| `0` | 每个仓库都成功。 |
| `1` | 至少有一个仓库失败。原因会写入 stderr 和报告。单个仓库失败时，stdout 不输出任何内容。缺失或不可达的 `--start-tag` 固定值只会让它自己的仓库失败。缺失或无法从 `HEAD` 到达的 `--end-tag`，或不是其结束标签祖先的起始标签，同样只会让它自己的仓库失败。 |
| `2` | 用法错误，且未进行任何计算。包括未知的子命令或标志、无效的版本、布局或格式、被拒绝的输入、重复的输入、`--version` 搭配多个输入，以及格式错误、非发布标签、重复或未知的 `--start-tag` 或 `--end-tag` 值。 |

### 缓存位置

URL 输入会以完整历史和所有标签克隆到 `<root>/repos/<owner>/<name>`。根目录在给出 `--cache-dir` 时取该值，否则为 `$XDG_CACHE_HOME/hagi-release-drafter`，再否则为 `~/.cache/hagi-release-drafter`。之后的运行会把标签和历史抓取到同一个克隆中。不会自动清理任何内容，因此请删除克隆目录以回收空间。私有仓库使用你已有的 git 凭据。包含用户名或密码的 URL 会被拒绝。

### CLI 不做什么

- 它不会发布、创建或编辑 release，也不调用 GitHub API。它不读取任何令牌，`GH_TOKEN` 和 `GITHUB_TOKEN` 不起作用。
- 它不会更改你提供的任何本地仓库。引用、标签和工作树保持原样。
- Action 不使用 CLI。它仍然直接在 Node.js 24 上运行 `scripts/release-notes.ts`，因此不需要构建步骤。npm 包附带从同一份源码构建的已编译 `dist/cli.js`。

## Runner 要求

- GitHub 托管的 runner 已包含 `gh` 和 `git`。在自托管 runner 上，请安装 GitHub CLI。
- 该 Action 会通过 `actions/setup-node` 自行安装 Node.js 24。

## 许可证

尚未决定。在发布本仓库之前必须选定许可证。
