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

最後のリリースタグ（安定版またはプレリリース）以降の [Conventional Commits](https://www.conventionalcommits.org/) に基づいて、次の安定版 `vX.Y.Z` のリリースのドラフトを作成する複合 GitHub Action です。GitHub のドラフトリリースを新規作成するか、既存のドラフトを更新します。**公開は決して行いません**。ドラフトの公開は GitHub の UI での手動操作として残ります。

この Action は依存関係のない Node.js スクリプトを実行するため、ビルド手順も同梱のアーティファクトも不要です。

## 使い方

利用側リポジトリにワークフローを追加します。

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

`concurrency` グループにより、2 つの実行が同時にドラフトを作成・編集することを防ぎます。

## 入力

| 入力 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `version` | いいえ | `''`（コミットから導出） | 導出されたバージョンの代わりに使う安定版 `X.Y.Z`。先頭に `v` が付いた値やプレリリースのサフィックス付きの値は拒否されます。 |
| `title-template` | いいえ | `v{version}` | リリースのタイトル。`{version}` はプレフィックスなしの `X.Y.Z` に置き換えられます。タグは常に `v{version}` です。 |
| `github-token` | いいえ | `${{ github.token }}` | GitHub API 呼び出しに使うトークン。呼び出し側のジョブに `contents: write` が必要です。 |

## 出力

| 出力 | 例 | 説明 |
| --- | --- | --- |
| `version` | `1.4.0` | 決定した安定版バージョン。先頭の `v` は付きません。 |
| `tag` | `v1.4.0` | リリースのタグ。 |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | ランナー上でレンダリングされたリリース本文のパス。 |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | 作成または更新されたドラフトの URL。 |

## 権限

- この Action を呼び出すジョブには、ドラフトを作成・編集するために `contents: write` が必要です。
- checkout に必要なのは `contents: read` のみです。
- この Action は `pull-requests` 権限を必要とせず、他の書き込み権限も必要としません。

## checkout の要件

バージョンとリリースノートは、完全な git 履歴とタグから計算されます。`fetch-depth: 0` と `fetch-tags: true` を指定してチェックアウトしてください。シャロークローンの場合は、これらの入力を指摘するメッセージとともに早期に失敗するため、黙って `0.1.0` が生成されることはありません。

## バージョンの決まり方

1. 基準は、`HEAD` から到達可能で、SemVer 2.0 の順序で最も優先度の高いリリースタグです。`v0.1.0-beta.97` のようなプレリリースタグも対象となり、`v0.1.0-beta.100` は `v0.1.0-beta.97` より上位、安定版タグは自身のプレリリースより上位に位置づけられます。リリースタグの文法に合わないタグは無視されます。ビルドメタデータ（`+`）、先頭のゼロ、`release-2` のような semver でない名前が該当します。
2. バージョンは、基準タグのコア `X.Y.Z` から導出されます。破壊的変更はメジャーバージョンを上げます。ただしメジャーが `0` の間はマイナーバージョンを上げます。
3. `feat` コミットはマイナーバージョンを上げ、パッチバージョンを 0 にリセットします。
4. それ以外のコミットの組み合わせは、パッチバージョンを上げます。
5. `HEAD` から到達可能なリリースタグがない場合、バージョンは `0.1.0` で、リリースノートは全履歴を対象とします。
6. `version` 入力は導出されたバージョンを上書きします。リリースノートに含まれるコミットは変わりません。

リリースノートは常に、基準タグより後から範囲の終端までのコミットを対象とします。終端は `HEAD` です。ただし CLI の `--end-tag` が、あるリポジトリの範囲をリリースタグで終わらせる場合を除きます。CLI の `--start-tag` で 1 つのリポジトリの基準タグを固定できます。これが別の基準を選ぶ唯一の方法です。

**終端のある範囲。** `--end-tag` を指定したリポジトリは、範囲がすでに存在するリリースを表すため、バージョンを引き上げルールからではなく、終端タグのコア `X.Y.Z` から取ります。たとえば `v0.1.0-beta.95` は `0.1.0` になります。`--version` は引き続きこれを上書きします。`--end-tag` がない場合は、上記のルールがそのまま適用されます。

**挙動の変更:** Action と CLI はこのルールを共有します。到達可能なタグにプレリリースを含むリポジトリは、この Action の以前のリリースとは異なる範囲とバージョンになります。リリースタグが安定版のみのリポジトリは影響を受けません。

## Conventional Commit の語彙とセクション

各コミットは、一致する最初のセクションに分類されます。空のセクションは省略され、コミットは git の新しい順のまま並びます。

| セクション | 一致条件 |
| --- | --- |
| Breaking Changes（破壊的変更） | 型またはスコープの後に `!` が付いたコミット、または `BREAKING CHANGE:` もしくは `BREAKING-CHANGE:` のフッターを持つコミット。 |
| Features（新機能） | `feat` |
| Fixes（修正） | `fix` |
| Performance（パフォーマンス） | `perf` |
| Documentation（ドキュメント） | `docs` |
| Maintenance（保守） | `build`、`ci`、`chore`、`refactor`、`revert`、`style`、`test` |
| Other Changes（その他の変更） | 上記以外のすべての型。Conventional Commits の形式に従わない件名を含みます。 |

各エントリは `- **scope:** description ([`short-sha`](commit-url))` の形式で描画されます。コミットにスコープがない場合、スコープの接頭辞は省略されます。

### コミットをリリースノートから除外する

**件名**（タイトル行）に `skip-release-notes` を含むコミットは、リリースノートから除外されます。一致は大文字小文字を区別しない部分文字列で判定されます（例: `docs: reword intro (skip-release-notes)`）。このマーカーは常に有効で、オン・オフを切り替える入力、フラグ、設定はありません。調べるのは件名のみのため、本文やフッターにこの語句があってもコミットは隠れません。

スキップされたコミットは、範囲に含まれていないものとして扱われます。

- 描画されず、エントリ数の上限、`Showing N of M commits` フッター、JSON の `commitCount` にも数えられません。
- バージョンには影響しません。スキップされた `feat:` でマイナーバージョンが上がることはなく、そのコミットが存在しないものとしてバージョンが導出されます。
- 範囲内のすべてのコミットがスキップされた場合、リリースノートには `_No changes yet._` と表示されます。

## エントリ数の上限

リリース本文には最大 **100 件のコミットエントリ** を描画します。セクション見出し、フッター、空の範囲のテキストは数えません。候補コミットが 100 件以下であれば、すべてを描画します。

CLI はリポジトリごとに、候補コミットの数と描画されたエントリ数を報告するため、切り詰められた変更履歴が黙って出力されることはありません。上限そのものは変わりません。

各候補コミットには、Conventional Commit の種類から優先度のティアが割り当てられます。最初に一致したルールが適用されます。

| ティア | 対象 |
| --- | --- |
| 1 | 任意の種類の破壊的変更、および `feat` |
| 2 | `fix`、`perf` |
| 3 | `refactor`、`revert`、およびスコープが `security` のコミット（大文字小文字を区別しない）。`fix(security)` はティア 2 のままです。 |
| 4 | `build`、`chore`、`ci`、`docs`、`style`、`test`、および Conventional Commits 形式に従わない件名 |

候補が 100 件を超える場合、残りが 100 件になるまで最も低いティアから省略します。

1. ティア 4 → ティア 3 → ティア 2 → ティア 1 の順に省略します。
2. ティア 1 の内部では、`feat` を破壊的変更より先に省略します。
3. スコープなしを、スコープありより先に省略します。
4. 古いものを、新しいものより先に省略します。

セキュリティに関係する `chore`、`ci`、`docs` のコミットをティア 4 から外すには、スコープ `security` を付けてください（例: `chore(security): rotate signing key`）。

コミットが省略された場合、本文の末尾にフッターが付きます（例: `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`）。リンクは基準タグ（安定版でもプレリリースでも可）から `HEAD` までの比較ビューを指します。リリースタグがない場合は、コミット一覧を指します。

エントリ数の上限は描画される本文にのみ影響します。バージョンは省略されたコミットを含む、すべての候補コミットから導出されます。

## タグのポリシー

- この Action の各リリースには、変更不可の `vX.Y.Z` タグが付与されます。
- 移動可能なメジャータグ `v1` は、最新の `1.x.y` リリースを指します。
- 利用者は `@v1` に固定すると互換性のある修正を受け取れます。完全な再現性が必要な場合は、`@vX.Y.Z` のように正確なバージョンに固定してください。

これらのタグを作成するのは、利用者のワークフローではなく、この Action 自身のリリースプロセスの一部です。

## この Action が行わないこと

- リリースを公開しません。`publish` や `draft: false` の入力はなく、ドラフトを公開状態に変更する操作は一切実行しません。
- git タグを作成・移動しません。ドラフトは、チェックアウトされた `HEAD` のコミットを指します。
- ドラフトを削除しません。複数のドラフトが存在する場合、GitHub が最初に返したドラフトを編集するため、複数のドラフトを保持しているメンテナーは手動で整理する必要があります。

## CLI でローカルプレビューする

同じエンジンが `hagi-release-drafter` としてお使いのマシンでも動作するため、リリース前にバージョンとリリースノートをプレビューできます。CLI が読むのは git 履歴だけです。公開は決して行わず、GitHub API も呼び出さず、トークンも不要です。書き込み先は、stdout、stderr、`--output` ファイル、URL キャッシュのみです。

### 実行とインストール

CLI には Node.js 24 以降と git が必要です。このリポジトリのクローンで、コンパイル済みの CLI を一度ビルドします。

```bash
npm ci
npm run build
node dist/cli.js --help
```

コマンドを `PATH` に置くには、パッケージを作成して tarball をインストールします。

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### サブコマンドとリポジトリ入力

| コマンド | 出力 |
| --- | --- |
| `hagi-release-drafter version` | 次の安定版バージョン（例: `1.4.0`）。 |
| `hagi-release-drafter notes` | リリース本文。デフォルト出力で 1 つのリポジトリを対象とする場合、Action のノートファイルとバイト単位で同一です。 |

入力がない場合、カレントディレクトリが git の作業ツリーであればそれを使います。そうでなければ、1 つ以上の入力を `--repo <input>`（繰り返し可）または位置引数で指定します。入力は、git 作業ツリーのローカルパス、または HTTPS の `github.com` URL（`.git` サフィックスの有無は問いません）です。入力は順番に、一度に 1 つのリポジトリずつ処理されます。

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

### フラグ

| フラグ | 意味 |
| --- | --- |
| `--repo <input>` | リポジトリ入力。繰り返し指定できます。 |
| `--layout <name>` | `per-repo`（デフォルト）または `merged`。Markdown レポートのみ変わります。 |
| `--format <name>` | `markdown`（デフォルト）または `json`。 |
| `--output <file>` | 結果をファイルに書き込みます。stdout は空のままです。 |
| `--version <X.Y.Z>` | 導出されたバージョンの代わりに、この安定版バージョンを使います。リポジトリ 1 つの場合のみ受け付けます。 |
| `--github-repository <owner/name>` | コミットリンクに使う識別子。すべての入力に適用され、`origin` リモートより優先されます。 |
| `--start-tag <input>=<tag>` | 最新のタグの代わりに、このリリースタグから 1 つのリポジトリの範囲を開始します。`<input>` は、`./web` のように、指定したとおりの表記でリポジトリと完全に一致する必要があります。そのため `web` と `./web` は別の入力です。タグは存在し、そのリポジトリの `HEAD` から到達可能でなければなりません。繰り返し指定でき、リポジトリごとに 1 つです。 |
| `--end-tag <input>=<tag>` | `HEAD` の代わりに、このリリースタグ（例: `v0.1.0-beta.95`）で 1 つのリポジトリの範囲を終了します。`--start-tag` と同じルールが適用され、タグは存在し、そのリポジトリの `HEAD` から到達可能でなければなりません。`--start-tag` がない場合、開始は終端より下で最新のリリースタグです。バージョンは、`--version` を指定しない限り、そのタグのコア `X.Y.Z` になります。繰り返し指定でき、リポジトリごとに 1 つです。 |
| `--cache-dir <dir>` | URL クローンのキャッシュルート。詳細は下記を参照してください。 |
| `--fail-fast` | 最初に失敗したリポジトリで停止します。 |
| `-h`、`--help` | 使い方を表示します。 |

### レイアウトと形式

- **`per-repo`**（デフォルト）は、リポジトリ、ステータス、バージョン、最後のタグ、コミット数、描画数をまとめた表で始まります。コミット数はすべての候補コミットで、描画数はノートに表示されるエントリ数です。続いて各リポジトリに `###` のブロックが付き、そのセクションは `####` になります。失敗したリポジトリはバージョンが空で、ブロックに理由が記されます。
- **`merged`** は `## Changes` セクションを 1 つ出力します。各セクションには、成功したすべてのリポジトリのエントリが含まれ、それぞれにリポジトリ名が付きます。各リポジトリは、結合前に 100 件のエントリへ絞り込まれます。切り詰められたリポジトリには、最初のセクションの前に `_hagicode-core: showing 100 of 1324 commits._` のような行が付きます。
- **`--format json`** は、入力順の `repositories` 配列を持つオブジェクトを 1 つ出力します。各行には `input`、`name`、`status` があります。成功した行には、さらに `version`、`lastTag`、`lastTagSource`（`pinned` または `auto`）、`endTag`（終端のある範囲の終端タグ、なければ `null`）、`commitCount`（候補コミット数）、`renderedCount`（`notes` 内のエントリ数）、`truncated`、`notes` が加わります。失敗した行には `error` が加わります。JSON は常にリポジトリ単位の形で出力されるため、`--layout` では変わりません。

### 終了コード

| コード | 意味 |
| --- | --- |
| `0` | すべてのリポジトリが成功しました。 |
| `1` | 少なくとも 1 つのリポジトリが失敗しました。理由は stderr とレポートに出力されます。単一のリポジトリが失敗した場合、stdout には何も出力されません。存在しない、または到達できない `--start-tag` の固定は、そのリポジトリだけを失敗させます。存在しない、または `HEAD` から到達できない `--end-tag`、あるいは終端タグの祖先でない開始タグも、そのリポジトリだけを失敗させます。 |
| `2` | 使い方の誤りで、何も計算されていません。未知のサブコマンドやフラグ、無効なバージョン・レイアウト・形式、拒否された入力、重複した入力、複数の入力に対する `--version`、不正な形式・リリースタグでない・重複した・未知の `--start-tag` または `--end-tag` の値が該当します。 |

### キャッシュの場所

URL 入力は、完全な履歴とすべてのタグを含めて `<root>/repos/<owner>/<name>` にクローンされます。ルートは、指定があれば `--cache-dir`、なければ `$XDG_CACHE_HOME/hagi-release-drafter`、それもなければ `~/.cache/hagi-release-drafter` です。以降の実行では、タグと履歴が同じクローンに取得されます。自動的に削除されるものはないため、容量を空けるにはクローンのディレクトリを削除してください。プライベートリポジトリには、すでにお持ちの git 認証情報が使われます。ユーザー名またはパスワードを含む URL は拒否されます。

### CLI が行わないこと

- リリースの公開、作成、編集は行わず、GitHub API も呼び出しません。トークンは読み取らず、`GH_TOKEN` と `GITHUB_TOKEN` は何の影響も与えません。
- 指定されたローカルリポジトリを変更しません。ref、タグ、作業ツリーはそのままです。
- Action は CLI を使いません。引き続き Node.js 24 上で `scripts/release-notes.ts` を直接実行するため、ビルド手順は不要です。npm パッケージには、同じソースからビルドしたコンパイル済みの `dist/cli.js` が含まれます。

## ランナーの要件

- GitHub がホストするランナーには `gh` と `git` が含まれています。セルフホストランナーでは GitHub CLI をインストールしてください。
- この Action は `actions/setup-node` を通じて Node.js 24 を自動でインストールします。

## ライセンス

未定です。このリポジトリを公開する前にライセンスを選定する必要があります。
