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

一個複合 GitHub Action，用於根據自上一個穩定標籤以來的 [Conventional Commits](https://www.conventionalcommits.org/) 提交，草擬下一個穩定版本 `vX.Y.Z` 的發布。它會建立 GitHub 草稿發布，或更新既有的草稿，**從不發布**。發布草稿仍需在 GitHub 介面中手動完成。

該 Action 執行一個無相依套件的 Node.js 腳本，因此不需要建置步驟，也沒有打包產物。

## 用法

在使用方倉庫中加入一個工作流程：

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

`concurrency` 群組可防止兩次執行同時建立或編輯同一個草稿。

## 輸入

| 輸入 | 必填 | 預設值 | 說明 |
| --- | --- | --- | --- |
| `version` | 否 | `''`（從提交推導） | 用於取代推導版本的穩定 `X.Y.Z`。帶前置 `v` 或預發布後綴的值會被拒絕。 |
| `title-template` | 否 | `v{version}` | 發布標題。`{version}` 會被取代為不含前綴的 `X.Y.Z`。標籤一律為 `v{version}`。 |
| `github-token` | 否 | `${{ github.token }}` | 用於 GitHub API 呼叫的權杖。呼叫端 job 必須授予 `contents: write`。 |

## 輸出

| 輸出 | 範例 | 說明 |
| --- | --- | --- |
| `version` | `1.4.0` | 解析出的穩定版本，不含前置 `v`。 |
| `tag` | `v1.4.0` | 發布標籤。 |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | runner 上渲染出的發布內文路徑。 |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | 已建立或更新的草稿 URL。 |

## 權限

- 呼叫此 Action 的 job 需要 `contents: write` 才能建立或編輯草稿。
- checkout 只需要 `contents: read`。
- 此 Action 不需要 `pull-requests` 權限，也不需要其他寫入範圍。

## Checkout 要求

版本與發布說明是根據完整的 git 歷史與標籤計算的。請使用 `fetch-depth: 0` 與 `fetch-tags: true` 進行檢出。淺層複製會快速失敗並指出這些輸入項，而不會悄悄得出 `0.1.0`。

## 版本如何選定

1. 基準是從 `HEAD` 可達的最新穩定 `vX.Y.Z` 標籤。`v1.3.0-beta.1` 等預發布標籤以及非 semver 標籤會被忽略。
2. 破壞性變更會提升主版本號；主版本為 `0` 時則提升次版本號。
3. `feat` 提交會提升次版本號，並將修訂版本號歸零。
4. 其他提交組合會提升修訂版本號。
5. 若尚無穩定標籤，版本為 `0.1.0`。
6. `version` 輸入會覆寫推導出的版本。發布說明中的提交內容不會因此改變。

發布說明一律涵蓋最新穩定標籤之後的提交。

## Conventional Commit 詞彙與分節

每個提交會落入其符合的第一個分節。空分節會被省略，提交維持 git 的最新優先順序。

| 分節 | 符合規則 |
| --- | --- |
| Breaking Changes（破壞性變更） | 類型或範圍後帶有 `!` 的任何提交，或帶有 `BREAKING CHANGE:` 或 `BREAKING-CHANGE:` 頁尾的提交。 |
| Features（新功能） | `feat` |
| Fixes（問題修正） | `fix` |
| Performance（效能優化） | `perf` |
| Documentation（文件） | `docs` |
| Maintenance（維護） | `build`、`ci`、`chore`、`refactor`、`revert`、`style`、`test` |
| Other Changes（其他變更） | 所有其他類型，包括不符合 Conventional Commits 格式的主旨。 |

每個條目會渲染為 `- **scope:** description ([`short-sha`](commit-url))`。若提交沒有範圍，則省略範圍前綴。

## 條目上限

一份發布內文最多渲染 **100 個提交條目**。章節標題、頁尾與空範圍文字不計入。候選提交不超過 100 個時，全部渲染。

每個候選提交都會依其 Conventional Commit 類型取得一個優先級層級，依第一條符合的規則決定。

| 層級 | 符合條件 |
| --- | --- |
| 1 | 任意類型的破壞性變更，以及 `feat` |
| 2 | `fix`、`perf` |
| 3 | `refactor`、`revert`，以及範圍為 `security` 的提交（不分大小寫）。`fix(security)` 仍在層級 2。 |
| 4 | `build`、`chore`、`ci`、`docs`、`style`、`test`，以及不符合 Conventional Commits 格式的主旨 |

候選超過 100 個時，從最低層級開始省略，直到剩下 100 個：

1. 層級 4 先於層級 3，層級 3 先於層級 2，層級 2 先於層級 1。
2. 在層級 1 內，`feat` 先於破壞性變更。
3. 沒有範圍的先於有範圍的。
4. 較早的先於較新的。

若要讓與安全相關的 `chore`、`ci` 或 `docs` 提交脫離層級 4，請為其加上範圍 `security`，例如 `chore(security): rotate signing key`。

有提交被省略時，內文結尾會出現頁尾，例如 `_Showing 100 of 170 commits._ [Full changelog](...)`。連結指向從最近的穩定標籤到 `HEAD` 的比較頁面；若不存在穩定標籤，則指向提交列表。

條目上限只影響渲染的內文。版本號仍然依全部候選提交計算，包括被省略的提交。

## 標籤策略

- 此 Action 的每個發布都會取得不可變的 `vX.Y.Z` 標籤。
- 可移動的主版本標籤 `v1` 指向最新的 `1.x.y` 發布。
- 使用方固定 `@v1` 即可接收相容的修正。若需完全可重現，請固定精確的 `@vX.Y.Z`。

建立這些標籤屬於此 Action 自身的發布流程，而非使用方工作流程的一部分。

## 此 Action 不做什麼

- 不發布 release。它沒有 `publish` 或 `draft: false` 輸入，也從不執行將草稿改為已發布的操作。
- 不建立或移動 git 標籤。草稿指向檢出的 `HEAD` 提交。
- 不刪除草稿。存在多個草稿時，它會編輯 GitHub 回傳的第一個草稿，因此保留多個草稿的維護者需要手動清理。

## Runner 要求

- GitHub 託管的 runner 已包含 `gh` 與 `git`。在自架 runner 上，請安裝 GitHub CLI。
- 此 Action 會透過 `actions/setup-node` 自行安裝 Node.js 24。

## 開發

```bash
npm ci
npm test
```

本倉庫使用此 Action 自身來草擬自己的發布：`.github/workflows/release-draft.yml` 會在每次推送到 `main` 時執行 `uses: ./`。它建立或更新草稿，從不發布。

單元測試涵蓋移植而來的發布說明邏輯、針對草稿腳本的 stub-`gh` 測試，以及對 `action.yml` 的契約測試。CI 還會執行自我檢測：建置 `test/fixtures/make-fixture-repo.sh`，使用唯讀權杖與 stub `gh` 對該倉庫執行此 Action，並斷言版本、標籤與分節標題。

## 授權條款

尚未決定。在發布本倉庫之前必須選定授權條款。
