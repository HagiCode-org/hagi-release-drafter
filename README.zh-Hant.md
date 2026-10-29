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

一個複合 GitHub Action，用於根據自上一個發布標籤（穩定或預發布）以來的 [Conventional Commits](https://www.conventionalcommits.org/) 提交，草擬下一個穩定版本 `vX.Y.Z` 的發布。它會建立 GitHub 草稿發布，或更新既有的草稿，**從不發布**。發布草稿仍需在 GitHub 介面中手動完成。

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

1. 基準是從 `HEAD` 可達、依 SemVer 2.0 排序的優先級最高的發布標籤。`v0.1.0-beta.97` 等預發布標籤也會計入，`v0.1.0-beta.100` 排在 `v0.1.0-beta.97` 之上，穩定標籤排在其自身預發布標籤之上。不符合發布標籤語法的標籤會被忽略：建置中繼資料（`+`）、前置零，以及 `release-2` 等非 semver 名稱。
2. 版本由基準標籤的核心 `X.Y.Z` 推導。破壞性變更會提升主版本號；主版本為 `0` 時則提升次版本號。
3. `feat` 提交會提升次版本號，並將修訂版本號歸零。
4. 其他提交組合會提升修訂版本號。
5. 若從 `HEAD` 無法到達任何發布標籤，版本為 `0.1.0`，發布說明涵蓋完整歷史。
6. `version` 輸入會覆寫推導出的版本。發布說明中的提交內容不會因此改變。

發布說明一律涵蓋基準標籤之後、直到範圍末端的提交。末端為 `HEAD`，除非 CLI 的 `--end-tag` 將某個倉庫的範圍結束於某個發布標籤。CLI 的 `--start-tag` 可以固定某個倉庫的基準標籤，這是選擇不同基準的唯一方式。

**有界範圍。** 使用 `--end-tag` 的倉庫，其版本取自結束標籤的核心 `X.Y.Z`，而不是依提升規則推導，因為它的範圍描述的是一個已經存在的發布。例如，`v0.1.0-beta.95` 會得到 `0.1.0`。`--version` 仍可覆寫它。沒有 `--end-tag` 時，上述規則維持不變。

**行為變更：** Action 與 CLI 共用這條規則。對於可達標籤中包含預發布標籤的倉庫，現在得到的範圍與版本與本 Action 早期版本給出的不同。只有穩定發布標籤的倉庫不受影響。

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

### 將提交排除在發布說明之外

**主旨**（標題行）包含 `skip-release-notes` 的提交會被排除在發布說明之外。比對不分大小寫，以子字串方式進行，例如 `docs: reword intro (skip-release-notes)`。此標記一律生效；沒有任何輸入、旗標或設定可以開啟或關閉它。只檢查主旨，因此內文或頁尾提到該片語不會隱藏提交。

被略過的提交視同不在範圍內：

- 它不會被渲染，也不計入條目上限、`Showing N of M commits` 頁尾或 JSON 的 `commitCount`。
- 它不會改變版本。被略過的 `feat:` 不會引起次版本提升；版本會依該提交不存在的情況推導。
- 當範圍內的所有提交都被略過時，發布說明會顯示 `_No changes yet._`。

## 條目上限

一份發布內文最多渲染 **100 個提交條目**。章節標題、頁尾與空範圍文字不計入。候選提交不超過 100 個時，全部渲染。

CLI 會針對每個倉庫回報候選提交數以及已渲染的條目數，因此被截斷的變更日誌絕不會悄無聲息。上限本身不變。

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

有提交被省略時，內文結尾會出現頁尾，例如 `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`。連結指向從基準標籤（可能是穩定標籤或預發布標籤）到 `HEAD` 的比較頁面；若不存在發布標籤，則指向提交列表。

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

## 使用 CLI 在本機預覽

同一個引擎也以 `hagi-release-drafter` 的形式在你的機器上執行，因此你可以在發布前預覽版本與發布說明。CLI 只讀取 git 歷史。它從不發布，從不呼叫 GitHub API，也不需要權杖。它僅寫入 stdout、stderr、`--output` 檔案與 URL 快取。

### 執行與安裝

CLI 需要 Node.js 24 或更新版本以及 git。在本倉庫的複本中，先建置一次編譯後的 CLI：

```bash
pnpm install
pnpm run build
node dist/cli.js --help
```

若要將該指令放到 `PATH` 上，請打包並安裝 tarball：

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### 子命令與倉庫輸入

| 指令 | 輸出 |
| --- | --- |
| `hagi-release-drafter version` | 下一個穩定版本，例如 `1.4.0`。 |
| `hagi-release-drafter notes` | 發布內文。對於預設輸出下的單一倉庫，它與 Action 的 notes 檔案逐位元組一致。 |

沒有輸入時，若目前目錄是 git 工作樹，則使用目前目錄。否則請提供一個或多個輸入，可以寫成 `--repo <input>`（可重複），也可以作為位置參數。輸入可以是 git 工作樹的本機路徑，或 HTTPS 的 `github.com` URL，有無 `.git` 後綴皆可。輸入會依序處理，一次一個倉庫。

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

### 旗標

| 旗標 | 含義 |
| --- | --- |
| `--repo <input>` | 一個倉庫輸入。可重複。 |
| `--layout <name>` | `per-repo`（預設）或 `merged`。只改變 Markdown 報告。 |
| `--format <name>` | `markdown`（預設）或 `json`。 |
| `--output <file>` | 將結果寫入檔案。stdout 保持為空。 |
| `--version <X.Y.Z>` | 使用該穩定版本，而不是推導出的版本。只接受用於一個倉庫。 |
| `--github-repository <owner/name>` | 提交連結所用的識別。適用於每個輸入，並覆寫 `origin` 遠端。 |
| `--start-tag <input>=<tag>` | 讓某個倉庫的範圍從這個發布標籤開始，而不是從最新的標籤開始。`<input>` 必須與倉庫的寫法完全一致，例如 `./web`，因此 `web` 與 `./web` 是不同的輸入。該標籤必須存在，並且可從該倉庫的 `HEAD` 到達。可重複，每個倉庫一個。 |
| `--end-tag <input>=<tag>` | 讓某個倉庫的範圍結束於這個發布標籤（例如 `v0.1.0-beta.95`），而不是 `HEAD`。適用與 `--start-tag` 相同的規則，且該標籤必須存在並可從該倉庫的 `HEAD` 到達。未給出 `--start-tag` 時，起點是結束標籤之下最新的發布標籤。此時版本為該標籤的核心 `X.Y.Z`，除非給出 `--version`。可重複，每個倉庫一個。 |
| `--cache-dir <dir>` | URL 複製的快取根目錄。見下文。 |
| `--fail-fast` | 在第一個失敗的倉庫之後停止。 |
| `-h`、`--help` | 顯示用法。 |

### 版面配置與格式

- **`per-repo`**（預設）以一個彙總表開頭：倉庫、狀態、版本、最近標籤、提交數與已渲染數。提交數是所有候選提交，已渲染數是發布說明中顯示的條目數。接著每個倉庫有一個 `###` 區塊，其分節位於 `####`。失敗的倉庫版本為空，其區塊會說明原因。
- **`merged`** 給出一個 `## Changes` 分節。其各分節包含所有成功倉庫的條目，每個條目標註其倉庫名稱。每個倉庫在合併前會被裁剪到一百個條目。被截斷的倉庫會在第一個分節之前有一行，例如 `_hagicode-core: showing 100 of 1324 commits._`。
- **`--format json`** 輸出一個帶有 `repositories` 陣列的物件，依輸入順序排列。每一列都有 `input`、`name` 與 `status`。成功的列還有 `version`、`lastTag`、`lastTagSource`（`pinned` 或 `auto`）、`endTag`（有界範圍的結束標籤，否則為 `null`）、`commitCount`（候選提交數）、`renderedCount`（`notes` 中的條目數）、`truncated` 與 `notes`。失敗的列還有 `error`。JSON 一律使用依倉庫的結構，因此 `--layout` 不會改變它。

### 結束碼

| 代碼 | 含義 |
| --- | --- |
| `0` | 每個倉庫都成功。 |
| `1` | 至少有一個倉庫失敗。原因會寫入 stderr 與報告。單一倉庫失敗時，stdout 不輸出任何內容。缺失或不可達的 `--start-tag` 固定值只會讓它自己的倉庫失敗。缺失或無法從 `HEAD` 到達的 `--end-tag`，或不是其結束標籤祖先的起始標籤，同樣只會讓它自己的倉庫失敗。 |
| `2` | 用法錯誤，且未進行任何計算。包括未知的子命令或旗標、無效的版本、版面配置或格式、被拒絕的輸入、重複的輸入、`--version` 搭配多個輸入，以及格式錯誤、非發布標籤、重複或未知的 `--start-tag` 或 `--end-tag` 值。 |

### 快取位置

URL 輸入會以完整歷史與所有標籤複製到 `<root>/repos/<owner>/<name>`。根目錄在給出 `--cache-dir` 時取該值，否則為 `$XDG_CACHE_HOME/hagi-release-drafter`，再否則為 `~/.cache/hagi-release-drafter`。之後的執行會把標籤與歷史擷取到同一個複本中。不會自動清除任何內容，因此請刪除複本目錄以回收空間。私有倉庫使用你已有的 git 憑證。包含使用者名稱或密碼的 URL 會被拒絕。

### CLI 不做什麼

- 它不會發布、建立或編輯 release，也不呼叫 GitHub API。它不讀取任何權杖，`GH_TOKEN` 與 `GITHUB_TOKEN` 不起作用。
- 它不會更改你提供的任何本機倉庫。參照、標籤與工作樹維持原樣。
- Action 不使用 CLI。它仍然直接在 Node.js 24 上執行 `scripts/release-notes.ts`，因此不需要建置步驟。npm 套件附帶從同一份原始碼建置的已編譯 `dist/cli.js`。

## Runner 要求

- GitHub 託管的 runner 已包含 `gh` 與 `git`。在自架 runner 上，請安裝 GitHub CLI。
- 此 Action 會透過 `actions/setup-node` 自行安裝 Node.js 24。

## 授權條款

尚未決定。在發布本倉庫之前必須選定授權條款。
