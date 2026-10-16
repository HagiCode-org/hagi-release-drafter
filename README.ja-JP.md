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

最後の安定タグ以降の [Conventional Commits](https://www.conventionalcommits.org/) に基づいて、次の安定版 `vX.Y.Z` のリリースのドラフトを作成する複合 GitHub Action です。GitHub のドラフトリリースを新規作成するか、既存のドラフトを更新します。**公開は決して行いません**。ドラフトの公開は GitHub の UI での手動操作として残ります。

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

1. 基準は、`HEAD` から到達可能な最新の安定版 `vX.Y.Z` タグです。`v1.3.0-beta.1` のようなプレリリースタグや、semver でないタグは無視されます。
2. 破壊的変更はメジャーバージョンを上げます。ただしメジャーが `0` の間はマイナーバージョンを上げます。
3. `feat` コミットはマイナーバージョンを上げ、パッチバージョンを 0 にリセットします。
4. それ以外のコミットの組み合わせは、パッチバージョンを上げます。
5. 安定版タグがまだない場合、バージョンは `0.1.0` です。
6. `version` 入力は導出されたバージョンを上書きします。リリースノートに含まれるコミットは変わりません。

リリースノートは常に、最新の安定版タグより後のコミットを対象とします。

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

## エントリ数の上限

リリース本文には最大 **100 件のコミットエントリ** を描画します。セクション見出し、フッター、空の範囲のテキストは数えません。候補コミットが 100 件以下であれば、すべてを描画します。

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

コミットが省略された場合、本文の末尾にフッターが付きます（例: `_Showing 100 of 170 commits._ [Full changelog](...)`）。リンクは直近の安定タグから `HEAD` までの比較ビューを指します。安定タグがない場合は、コミット一覧を指します。

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

## ランナーの要件

- GitHub がホストするランナーには `gh` と `git` が含まれています。セルフホストランナーでは GitHub CLI をインストールしてください。
- この Action は `actions/setup-node` を通じて Node.js 24 を自動でインストールします。

## 開発

```bash
npm ci
npm test
```

このリポジトリは、Action 自身を使って自分のリリースのドラフトを作成します。`.github/workflows/release-draft.yml` は、`main` への push のたびに `uses: ./` を実行します。ドラフトの作成・更新は行いますが、公開は決して行いません。

ユニットテストは、移植されたリリースノートのロジック、ドラフトスクリプトに対するスタブ `gh` を使ったテスト、`action.yml` の契約テストをカバーします。CI では自己テストも実行します。`test/fixtures/make-fixture-repo.sh` でリポジトリをビルドし、読み取り専用トークンとスタブ `gh` を使ってそのリポジトリに対して Action を実行し、バージョン、タグ、セクション見出しを検証します。

## ライセンス

未定です。このリポジトリを公開する前にライセンスを選定する必要があります。
