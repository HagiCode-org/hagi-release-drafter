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

마지막 릴리스 태그(안정 또는 프리릴리스) 이후에 작성된 [Conventional Commits](https://www.conventionalcommits.org/) 커밋을 기준으로 다음 안정 버전 `vX.Y.Z`의 릴리스 초안을 작성하는 복합 GitHub Action입니다. GitHub 초안 릴리스를 만들거나 기존 초안을 업데이트하며, **절대 게시하지 않습니다**. 초안을 게시하는 작업은 GitHub UI에서 수동으로 진행해야 합니다.

이 Action은 의존성이 없는 Node.js 스크립트를 실행하므로 빌드 단계나 번들된 아티팩트가 필요하지 않습니다.

## 사용법

사용하는 저장소에 워크플로를 추가합니다.

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

`concurrency` 그룹은 두 실행이 동시에 초안을 만들거나 편집하는 것을 막아 줍니다.

## 입력

| 입력 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `version` | 아니요 | `''` (커밋에서 도출) | 도출된 버전 대신 사용할 안정 `X.Y.Z`. 앞에 `v`가 붙은 값이나 프리릴리스 접미사가 있는 값은 거부됩니다. |
| `title-template` | 아니요 | `v{version}` | 릴리스 제목. `{version}`은 접두사 없는 `X.Y.Z`로 치환됩니다. 태그는 항상 `v{version}`입니다. |
| `github-token` | 아니요 | `${{ github.token }}` | GitHub API 호출에 사용하는 토큰. 호출하는 job에 `contents: write` 권한이 있어야 합니다. |

## 출력

| 출력 | 예시 | 설명 |
| --- | --- | --- |
| `version` | `1.4.0` | 확정된 안정 버전. 앞의 `v`는 없습니다. |
| `tag` | `v1.4.0` | 릴리스 태그. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | 러너에서 렌더링된 릴리스 본문의 경로. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | 생성되거나 업데이트된 초안의 URL. |

## 권한

- 이 Action을 호출하는 job은 초안을 만들거나 편집하려면 `contents: write`가 필요합니다.
- checkout에는 `contents: read`만 필요합니다.
- 이 Action은 `pull-requests` 권한을 요구하지 않으며, 다른 쓰기 권한도 요구하지 않습니다.

## Checkout 요구 사항

버전과 릴리스 노트는 전체 git 히스토리와 태그를 기준으로 계산됩니다. `fetch-depth: 0`과 `fetch-tags: true`로 체크아웃하세요. 얕은(shallow) 체크아웃은 조용히 `0.1.0`을 만들어 내는 대신, 이 입력들을 언급하는 메시지와 함께 즉시 실패합니다.

## 버전 선택 방식

1. 기준은 `HEAD`에서 도달할 수 있는 릴리스 태그 중 SemVer 2.0 순서상 우선순위가 가장 높은 태그입니다. `v0.1.0-beta.97` 같은 프리릴리스 태그도 포함되며, `v0.1.0-beta.100`은 `v0.1.0-beta.97`보다 높게 평가되고, 안정 태그는 자신의 프리릴리스보다 높게 평가됩니다. 릴리스 태그 문법에 맞지 않는 태그는 무시됩니다. 빌드 메타데이터(`+`), 앞자리 0, `release-2` 같은 semver가 아닌 이름이 여기에 해당합니다.
2. 버전은 기준 태그의 코어 `X.Y.Z`에서 도출됩니다. 호환되지 않는 변경은 메이저 버전을 올립니다. 메이저가 `0`인 동안에는 마이너 버전을 올립니다.
3. `feat` 커밋은 마이너 버전을 올리고 패치 버전을 0으로 되돌립니다.
4. 그 밖의 커밋 조합은 패치 버전을 올립니다.
5. `HEAD`에서 도달할 수 있는 릴리스 태그가 없으면 버전은 `0.1.0`이며 릴리스 노트는 전체 히스토리를 포함합니다.
6. `version` 입력은 도출된 버전을 덮어씁니다. 릴리스 노트의 커밋 내용은 바뀌지 않습니다.

릴리스 노트는 항상 기준 태그 이후의 커밋을 범위의 끝까지 포함합니다. 끝은 `HEAD`이지만, CLI의 `--end-tag`가 한 저장소의 범위를 릴리스 태그에서 끝내는 경우는 예외입니다. CLI의 `--start-tag`로 한 저장소의 기준 태그를 고정할 수 있으며, 다른 기준 태그를 선택하는 유일한 방법입니다.

**제한된 범위.** `--end-tag`를 지정한 저장소는 범위가 이미 존재하는 릴리스를 설명하므로, 버전을 범프 정책이 아니라 끝 태그의 `X.Y.Z` 코어에서 가져옵니다. 예를 들어 `v0.1.0-beta.95`는 `0.1.0`이 됩니다. `--version`은 여전히 이를 덮어씁니다. `--end-tag`가 없으면 위의 규칙이 그대로 적용됩니다.

**동작 변경:** Action과 CLI는 이 규칙을 공유합니다. 도달할 수 있는 태그에 프리릴리스가 포함된 저장소는 이제 이 Action의 이전 릴리스가 주던 것과 다른 범위와 버전을 받습니다. 릴리스 태그가 안정 태그뿐인 저장소는 영향을 받지 않습니다.

## Conventional Commit 어휘와 섹션

각 커밋은 일치하는 첫 번째 섹션에 들어갑니다. 비어 있는 섹션은 생략되며, 커밋은 git의 최신순 순서를 유지합니다.

| 섹션 | 일치 조건 |
| --- | --- |
| Breaking Changes (호환성 깨지는 변경) | 타입이나 스코프 뒤에 `!`가 붙은 모든 커밋, 또는 `BREAKING CHANGE:` 또는 `BREAKING-CHANGE:` 푸터가 있는 커밋. |
| Features (기능) | `feat` |
| Fixes (수정) | `fix` |
| Performance (성능) | `perf` |
| Documentation (문서) | `docs` |
| Maintenance (유지보수) | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes (기타 변경) | 그 밖의 모든 타입. Conventional Commits 형식을 따르지 않는 제목도 포함합니다. |

각 항목은 `- **scope:** description ([`short-sha`](commit-url))` 형식으로 렌더링됩니다. 커밋에 스코프가 없으면 스코프 접두사는 생략됩니다.

### 릴리스 노트에서 커밋 제외하기

**제목**(첫 번째 줄)에 `skip-release-notes`가 포함된 커밋은 릴리스 노트에서 제외됩니다. 일치 여부는 대소문자를 구분하지 않는 부분 문자열 비교이며, 예를 들어 `docs: reword intro (skip-release-notes)`가 해당합니다. 이 마커는 항상 활성화되어 있으며, 입력, 플래그, 설정으로 켜거나 끌 수 없습니다. 제목만 검사하므로 본문이나 푸터에 이 문구가 있어도 커밋이 숨겨지지 않습니다.

제외된 커밋은 범위에 없는 것으로 취급됩니다.

- 렌더링되지 않으며, 항목 수 제한, `Showing N of M commits` 푸터, JSON `commitCount`에도 포함되지 않습니다.
- 버전에 영향을 주지 않습니다. 제외된 `feat:`는 마이너 버전 상승을 일으키지 않으며, 그 커밋이 없는 것처럼 버전이 도출됩니다.
- 범위의 모든 커밋이 제외되면 릴리스 노트에 `_No changes yet._`가 표시됩니다.

## 항목 수 제한

릴리스 본문에는 커밋 항목이 최대 **100개**까지 렌더링됩니다. 섹션 제목, 푸터, 빈 범위 텍스트는 개수에 포함되지 않습니다. 후보 커밋이 100개 이하이면 모든 커밋을 렌더링합니다.

CLI는 저장소마다 후보 커밋이 몇 개인지, 그리고 항목이 몇 개 렌더링되었는지 보고하므로 잘린 변경 내역이 조용히 지나가는 일은 없습니다. 상한 자체는 바뀌지 않았습니다.

각 후보 커밋은 Conventional Commit 타입에 따라 우선순위 티어를 받습니다. 처음으로 일치하는 규칙이 적용됩니다.

| 티어 | 해당 항목 |
| --- | --- |
| 1 | 모든 타입의 파괴적 변경, 그리고 `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert`, 스코프가 `security`인 커밋(대소문자 무시). `fix(security)`는 티어 2에 남습니다. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test`, 그리고 Conventional Commits 형식을 따르지 않는 제목 |

후보가 100개를 넘으면 남은 개수가 100개가 될 때까지 가장 낮은 티어부터 제외합니다.

1. 티어 4 → 티어 3 → 티어 2 → 티어 1 순으로 제외합니다.
2. 티어 1 안에서는 `feat`를 파괴적 변경보다 먼저 제외합니다.
3. 스코프가 없는 커밋을 스코프가 있는 커밋보다 먼저 제외합니다.
4. 오래된 커밋을 최신 커밋보다 먼저 제외합니다.

보안과 관련된 `chore`, `ci`, `docs` 커밋을 티어 4에서 벗어나게 하려면 스코프 `security`를 붙이세요(예: `chore(security): rotate signing key`).

커밋이 제외되면 본문 끝에 푸터가 붙습니다(예: `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`). 링크는 기준 태그(안정 태그일 수도, 프리릴리스 태그일 수도 있습니다)부터 `HEAD`까지의 비교 화면을 가리키며, 릴리스 태그가 없으면 커밋 목록을 가리킵니다.

항목 수 제한은 렌더링되는 본문에만 영향을 줍니다. 버전은 제외된 커밋을 포함한 모든 후보 커밋으로 계산됩니다.

## 태그 정책

- 이 Action의 각 릴리스는 변경할 수 없는 `vX.Y.Z` 태그를 받습니다.
- 이동 가능한 메이저 태그 `v1`은 가장 최근의 `1.x.y` 릴리스를 가리킵니다.
- 사용자는 `@v1`에 고정해 호환되는 수정 사항을 받을 수 있습니다. 완전한 재현성이 필요하면 `@vX.Y.Z`처럼 정확한 버전에 고정하세요.

이 태그를 만드는 일은 사용자 워크플로가 아니라 이 Action 자체의 릴리스 과정에 속합니다.

## 이 Action이 하지 않는 일

- 릴리스를 게시하지 않습니다. `publish`나 `draft: false` 입력이 없으며, 초안을 게시 상태로 바꾸는 작업을 절대 실행하지 않습니다.
- git 태그를 만들거나 옮기지 않습니다. 초안은 체크아웃된 `HEAD` 커밋을 가리킵니다.
- 초안을 삭제하지 않습니다. 초안이 여러 개 있으면 GitHub가 처음 반환한 초안을 편집하므로, 초안을 여러 개 보관하는 관리자는 직접 정리해야 합니다.

## CLI로 로컬 미리보기

같은 엔진이 `hagi-release-drafter`라는 이름으로 로컬 컴퓨터에서도 실행되므로, 릴리스 전에 버전과 릴리스 노트를 미리 볼 수 있습니다. CLI는 git 히스토리만 읽습니다. 게시하지 않고, GitHub API를 호출하지 않으며, 토큰이 필요 없습니다. 쓰기는 stdout, stderr, `--output` 파일, URL 캐시에만 이루어집니다.

### 실행 및 설치

CLI에는 Node.js 24 이상과 git이 필요합니다. 이 저장소의 클론에서 컴파일된 CLI를 한 번 빌드합니다.

```bash
npm ci
npm run build
node dist/cli.js --help
```

명령을 `PATH`에 추가하려면 패키지를 pack한 뒤 tarball을 설치합니다.

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### 하위 명령과 저장소 입력

| 명령 | 출력 |
| --- | --- |
| `hagi-release-drafter version` | 다음 안정 버전(예: `1.4.0`). |
| `hagi-release-drafter notes` | 릴리스 본문. 기본 출력에서 저장소 하나인 경우 Action의 notes 파일과 바이트 단위로 동일합니다. |

입력이 없으면 현재 디렉터리가 git 작업 트리일 때 그 디렉터리를 사용합니다. 그렇지 않으면 `--repo <input>`(반복 가능) 또는 위치 인자로 하나 이상의 입력을 지정하세요. 입력은 git 작업 트리의 로컬 경로이거나, `.git` 접미사가 있든 없든 HTTPS `github.com` URL입니다. 입력은 순서대로, 한 번에 저장소 하나씩 처리됩니다.

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

### 플래그

| 플래그 | 의미 |
| --- | --- |
| `--repo <input>` | 저장소 입력. 반복할 수 있습니다. |
| `--layout <name>` | `per-repo`(기본값) 또는 `merged`. Markdown 보고서에만 영향을 줍니다. |
| `--format <name>` | `markdown`(기본값) 또는 `json`. |
| `--output <file>` | 결과를 파일에 씁니다. stdout은 비어 있게 됩니다. |
| `--version <X.Y.Z>` | 도출된 버전 대신 이 안정 버전을 사용합니다. 저장소 하나에만 허용됩니다. |
| `--github-repository <owner/name>` | 커밋 링크에 쓰는 식별자. 모든 입력에 적용되며 `origin` 리모트보다 우선합니다. |
| `--start-tag <input>=<tag>` | 가장 최근 태그 대신 이 릴리스 태그에서 한 저장소의 범위를 시작합니다. `<input>`은 `./web`처럼 저장소를 지정한 그대로 일치해야 하므로 `web`과 `./web`은 서로 다른 입력입니다. 태그는 존재해야 하며 그 저장소의 `HEAD`에서 도달할 수 있어야 합니다. 반복할 수 있으며 저장소마다 하나씩 지정합니다. |
| `--end-tag <input>=<tag>` | `HEAD` 대신 `v0.1.0-beta.95` 같은 이 릴리스 태그에서 한 저장소의 범위를 끝냅니다. `--start-tag`와 같은 규칙이 적용되며, 태그는 존재해야 하고 그 저장소의 `HEAD`에서 도달할 수 있어야 합니다. `--start-tag`가 없으면 시작점은 끝 태그보다 낮은 가장 최근 릴리스 태그입니다. 이 경우 `--version`을 지정하지 않는 한 버전은 해당 태그의 `X.Y.Z` 코어입니다. 반복할 수 있으며 저장소마다 하나씩 지정합니다. |
| `--cache-dir <dir>` | URL 클론의 캐시 루트. 아래를 참고하세요. |
| `--fail-fast` | 첫 번째 실패한 저장소 이후 중단합니다. |
| `-h`, `--help` | 사용법을 표시합니다. |

### 레이아웃과 형식

- **`per-repo`**(기본값)는 요약 표로 시작합니다. 열은 저장소, 상태, 버전, 마지막 태그, 커밋 수, 렌더링된 수입니다. 커밋 수는 모든 후보 커밋이고, 렌더링된 수는 릴리스 노트에 표시되는 항목 수입니다. 이어서 각 저장소가 `###` 블록을 받고, 그 안의 섹션은 `####`에 놓입니다. 실패한 저장소는 버전이 비어 있고, 블록에 이유가 명시됩니다.
- **`merged`**는 `## Changes` 섹션 하나를 제공합니다. 이 섹션은 성공한 모든 저장소의 항목을 담으며, 각 항목에 저장소 이름이 표시됩니다. 각 저장소는 병합하기 전에 100개 항목으로 줄어듭니다. 잘린 저장소는 첫 번째 섹션 앞에 `_hagicode-core: showing 100 of 1324 commits._` 같은 줄이 붙습니다.
- **`--format json`**은 입력 순서대로 `repositories` 배열이 들어 있는 객체 하나를 출력합니다. 각 행에는 `input`, `name`, `status`가 있습니다. 성공한 행에는 `version`, `lastTag`, `lastTagSource`(`pinned` 또는 `auto`), `endTag`(제한된 범위의 끝 태그이며, 그렇지 않으면 `null`), `commitCount`(후보 커밋 수), `renderedCount`(`notes`에 있는 항목 수), `truncated`, `notes`가 추가됩니다. 실패한 행에는 `error`가 추가됩니다. JSON은 항상 저장소별 구조를 사용하므로 `--layout`은 영향을 주지 않습니다.

### 종료 코드

| 코드 | 의미 |
| --- | --- |
| `0` | 모든 저장소가 성공했습니다. |
| `1` | 하나 이상의 저장소가 실패했습니다. 이유는 stderr와 보고서에 기록됩니다. 저장소 하나가 실패하면 stdout에는 아무것도 출력되지 않습니다. 없거나 도달할 수 없는 `--start-tag` 고정은 해당 저장소만 실패시킵니다. `HEAD`에서 도달할 수 없거나 없는 `--end-tag`, 또는 끝 태그의 조상이 아닌 시작 태그도 해당 저장소만 실패시킵니다. |
| `2` | 사용법 오류이며 아무것도 계산되지 않았습니다. 알 수 없는 하위 명령이나 플래그, 잘못된 버전, 레이아웃, 형식, 거부된 입력, 중복된 입력, 입력이 여러 개인 `--version`, 그리고 형식이 잘못되었거나 릴리스 태그가 아니거나 중복되었거나 알 수 없는 `--start-tag` 또는 `--end-tag` 값이 여기에 해당합니다. |

### 캐시 위치

URL 입력은 전체 히스토리와 모든 태그와 함께 `<root>/repos/<owner>/<name>`에 클론됩니다. 루트는 `--cache-dir`가 있으면 그 값이고, 없으면 `$XDG_CACHE_HOME/hagi-release-drafter`, 그것도 없으면 `~/.cache/hagi-release-drafter`입니다. 이후 실행에서는 같은 클론에 태그와 히스토리를 가져옵니다. 자동으로 삭제되는 것은 없으므로 공간을 되찾으려면 클론 디렉터리를 삭제하세요. 비공개 저장소는 이미 갖고 있는 git 자격 증명을 사용합니다. 사용자 이름이나 비밀번호가 들어 있는 URL은 거부됩니다.

### CLI가 하지 않는 일

- 릴리스를 게시, 생성, 편집하지 않으며 GitHub API를 호출하지 않습니다. 토큰을 읽지 않으며 `GH_TOKEN`과 `GITHUB_TOKEN`은 아무 영향이 없습니다.
- 지정한 로컬 저장소를 변경하지 않습니다. ref, 태그, 작업 트리는 그대로 유지됩니다.
- Action은 CLI를 사용하지 않습니다. 여전히 Node.js 24에서 `scripts/release-notes.ts`를 직접 실행하므로 빌드 단계가 필요 없습니다. npm 패키지에는 같은 소스로 빌드된 컴파일된 `dist/cli.js`가 포함됩니다.

## 러너 요구 사항

- GitHub 호스팅 러너에는 `gh`와 `git`이 포함되어 있습니다. 셀프 호스티드 러너에서는 GitHub CLI를 설치하세요.
- 이 Action은 `actions/setup-node`를 통해 Node.js 24를 직접 설치합니다.

## 라이선스

아직 결정되지 않았습니다. 이 저장소를 게시하기 전에 라이선스를 선택해야 합니다.
