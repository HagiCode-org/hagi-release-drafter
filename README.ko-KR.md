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

마지막 안정 태그 이후에 작성된 [Conventional Commits](https://www.conventionalcommits.org/) 커밋을 기준으로 다음 안정 버전 `vX.Y.Z`의 릴리스 초안을 작성하는 복합 GitHub Action입니다. GitHub 초안 릴리스를 만들거나 기존 초안을 업데이트하며, **절대 게시하지 않습니다**. 초안을 게시하는 작업은 GitHub UI에서 수동으로 진행해야 합니다.

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

1. 기준은 `HEAD`에서 도달할 수 있는 가장 최근의 안정 `vX.Y.Z` 태그입니다. `v1.3.0-beta.1` 같은 프리릴리스 태그와 semver가 아닌 태그는 무시됩니다.
2. 호환되지 않는 변경은 메이저 버전을 올립니다. 메이저가 `0`인 동안에는 마이너 버전을 올립니다.
3. `feat` 커밋은 마이너 버전을 올리고 패치 버전을 0으로 되돌립니다.
4. 그 밖의 커밋 조합은 패치 버전을 올립니다.
5. 아직 안정 태그가 없으면 버전은 `0.1.0`입니다.
6. `version` 입력은 도출된 버전을 덮어씁니다. 릴리스 노트의 커밋 내용은 바뀌지 않습니다.

릴리스 노트는 항상 가장 최근의 안정 태그 이후 커밋을 포함합니다.

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

## 항목 수 제한

릴리스 본문에는 커밋 항목이 최대 **100개**까지 렌더링됩니다. 섹션 제목, 푸터, 빈 범위 텍스트는 개수에 포함되지 않습니다. 후보 커밋이 100개 이하이면 모든 커밋을 렌더링합니다.

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

커밋이 제외되면 본문 끝에 푸터가 붙습니다(예: `_Showing 100 of 170 commits._ [Full changelog](...)`). 링크는 가장 최근 안정 태그부터 `HEAD`까지의 비교 화면을 가리키며, 안정 태그가 없으면 커밋 목록을 가리킵니다.

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

## 러너 요구 사항

- GitHub 호스팅 러너에는 `gh`와 `git`이 포함되어 있습니다. 셀프 호스티드 러너에서는 GitHub CLI를 설치하세요.
- 이 Action은 `actions/setup-node`를 통해 Node.js 24를 직접 설치합니다.

## 개발

```bash
npm ci
npm test
```

이 저장소는 Action 자체를 사용해 자신의 릴리스 초안을 작성합니다. `.github/workflows/release-draft.yml`은 `main`에 push될 때마다 `uses: ./`를 실행합니다. 초안을 만들거나 업데이트할 뿐 게시하지는 않습니다.

단위 테스트는 이식된 릴리스 노트 로직, 초안 스크립트에 대한 stub `gh` 테스트, `action.yml`의 계약 테스트를 다룹니다. CI는 자체 검증도 실행합니다. `test/fixtures/make-fixture-repo.sh`로 저장소를 만든 뒤, 읽기 전용 토큰과 stub `gh`로 이 저장소를 대상으로 Action을 실행하고, 버전, 태그, 섹션 제목을 확인합니다.

## 라이선스

아직 결정되지 않았습니다. 이 저장소를 게시하기 전에 라이선스를 선택해야 합니다.
