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

一个复合 GitHub Action，用于根据自上一个稳定标签以来的 [Conventional Commits](https://www.conventionalcommits.org/) 提交，草拟下一个稳定版本 `vX.Y.Z` 的发布。它会创建 GitHub 草稿发布，或更新已有的草稿，**从不发布**。发布草稿仍需在 GitHub 界面中手动完成。

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

1. 基准是从 `HEAD` 可达的最新稳定 `vX.Y.Z` 标签。`v1.3.0-beta.1` 之类的预发布标签以及非 semver 标签会被忽略。
2. 破坏性变更会提升主版本号；主版本为 `0` 时则提升次版本号。
3. `feat` 提交会提升次版本号，并将补丁版本号归零。
4. 其他提交组合会提升补丁版本号。
5. 若尚无稳定标签，版本为 `0.1.0`。
6. `version` 输入会覆盖推导出的版本。发布说明中的提交内容不会因此改变。

发布说明始终涵盖最新稳定标签之后的提交。

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

## 标签策略

- 该 Action 的每个发布都会获得不可变的 `vX.Y.Z` 标签。
- 可移动的主版本标签 `v1` 指向最新的 `1.x.y` 发布。
- 使用方固定 `@v1` 即可接收兼容的修复。若需完全可复现，请固定精确的 `@vX.Y.Z`。

创建这些标签属于该 Action 自身的发布流程，而非使用方工作流的一部分。

## 该 Action 不做什么

- 不发布 release。它没有 `publish` 或 `draft: false` 输入，从不执行将草稿改为已发布的操作。
- 不创建或移动 git 标签。草稿指向检出的 `HEAD` 提交。
- 不删除草稿。存在多个草稿时，它会编辑 GitHub 返回的第一个草稿，因此保留多个草稿的维护者需要手动清理。

## Runner 要求

- GitHub 托管的 runner 已包含 `gh` 和 `git`。在自托管 runner 上，请安装 GitHub CLI。
- 该 Action 会通过 `actions/setup-node` 自行安装 Node.js 24。

## 开发

```bash
npm ci
npm test
```

本仓库使用该 Action 自身来草拟自己的发布：`.github/workflows/release-draft.yml` 会在每次推送到 `main` 时运行 `uses: ./`。它创建或更新草稿，从不发布。

单元测试覆盖移植而来的发布说明逻辑、针对草稿脚本的 stub-`gh` 测试，以及对 `action.yml` 的契约测试。CI 还会运行自检：构建 `test/fixtures/make-fixture-repo.sh`，使用只读令牌和 stub `gh` 对该仓库运行该 Action，并断言版本、标签和分节标题。

## 许可证

尚未决定。在发布本仓库之前必须选定许可证。
