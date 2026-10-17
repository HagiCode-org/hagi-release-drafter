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

Составное GitHub Action, которое готовит черновик следующего стабильного релиза `vX.Y.Z` по [Conventional Commits](https://www.conventionalcommits.org/), сделанным после последнего стабильного тега. Оно создаёт черновой релиз на GitHub или обновляет существующий и **никогда не публикует** его. Публикация черновика остаётся ручным шагом в интерфейсе GitHub.

Action запускает скрипт на Node.js без внешних зависимостей, поэтому не требует шага сборки и готового артефакта.

## Использование

Добавьте workflow в репозиторий, который использует Action:

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

Группа `concurrency` не даёт двум запускам одновременно создавать или редактировать черновик.

## Входные параметры

| Параметр | Обязательный | По умолчанию | Описание |
| --- | --- | --- | --- |
| `version` | Нет | `''` (вычисляется из коммитов) | Стабильная версия `X.Y.Z`, которая используется вместо вычисленной. Значения с ведущим `v` или с суффиксом предрелиза отклоняются. |
| `title-template` | Нет | `v{version}` | Заголовок релиза. `{version}` заменяется на `X.Y.Z` без префикса. Тег всегда `v{version}`. |
| `github-token` | Нет | `${{ github.token }}` | Токен для вызовов GitHub API. Вызывающий job должен выдать `contents: write`. |

## Выходные данные

| Выход | Пример | Описание |
| --- | --- | --- |
| `version` | `1.4.0` | Определённая стабильная версия без ведущего `v`. |
| `tag` | `v1.4.0` | Тег релиза. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Путь к отрендеренному телу релиза на раннере. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL созданного или обновлённого черновика. |

## Права доступа

- Job, который вызывает Action, нужен `contents: write`, чтобы создавать или редактировать черновик.
- Checkout нужен только `contents: read`.
- Action не требует права `pull-requests` и никаких других прав на запись.

## Требования к checkout

Версия и заметки вычисляются по полной истории git и её тегам. Выполняйте checkout с `fetch-depth: 0` и `fetch-tags: true`. Поверхностный checkout завершается сразу с сообщением, которое называет эти параметры, и не выдаёт молча `0.1.0`.

## Как выбирается версия

1. Основа — самый новый стабильный тег `vX.Y.Z`, достижимый из `HEAD`. Теги предрелизов, например `v1.3.0-beta.1`, и теги, не соответствующие semver, игнорируются.
2. Несовместимое изменение увеличивает мажорную версию, а при мажорной версии `0` — минорную.
3. Коммит `feat` увеличивает минорную версию и сбрасывает патч в ноль.
4. Любой другой набор коммитов увеличивает патч.
5. Если стабильного тега ещё нет, версия равна `0.1.0`.
6. Параметр `version` переопределяет вычисленную версию. Коммиты в заметках от этого не меняются.

Заметки всегда охватывают коммиты после самого нового стабильного тега.

## Conventional Commit: типы и разделы

Каждый коммит попадает в первый раздел, правило которого он соответствует. Пустые разделы опускаются, а коммиты сохраняют порядок git: от новых к старым.

| Раздел | Что попадает |
| --- | --- |
| Breaking Changes | Любой коммит с `!` после типа или области, а также коммит с футером `BREAKING CHANGE:` или `BREAKING-CHANGE:`. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Все остальные типы, включая заголовки, которые не соответствуют формату Conventional Commits. |

Каждая запись выводится как `- **scope:** description ([`short-sha`](commit-url))`. Префикс области опускается, если у коммита нет области.

## Ограничение числа записей

Тело релиза выводит не более **100 записей коммитов**. Заголовки разделов, подвал и текст для пустого диапазона в лимит не входят. Если кандидатов-коммитов 100 или меньше, выводятся все коммиты.

Каждому кандидату присваивается уровень приоритета по типу Conventional Commit. Применяется первое подходящее правило.

| Уровень | Соответствие |
| --- | --- |
| 1 | Критические изменения любого типа и `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert` и любой коммит с областью `security` (без учёта регистра). `fix(security)` остаётся на уровне 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test` и заголовки, не соответствующие формату Conventional Commits |

Если кандидатов больше 100, коммиты пропускаются, начиная с самого низкого уровня, пока не останется 100:

1. Уровень 4 раньше уровня 3, уровень 3 раньше уровня 2, уровень 2 раньше уровня 1.
2. Внутри уровня 1 `feat` пропускается раньше критических изменений.
3. Без области раньше, чем с областью.
4. Более старые раньше более новых.

Чтобы коммит `chore`, `ci` или `docs`, связанный с безопасностью, не попадал на уровень 4, укажите у него область `security`, например `chore(security): rotate signing key`.

Если какой-либо коммит пропущен, тело заканчивается подвалом вида `_Showing 100 of 170 commits._ [Full changelog](...)`. Ссылка ведёт на сравнение от последнего стабильного тега до `HEAD`, а если стабильного тега нет, на список коммитов.

Лимит влияет только на выводимое тело. Версия по-прежнему вычисляется по всем кандидатам, включая пропущенные.

## Политика тегов

- Каждый релиз этого Action получает неизменяемый тег `vX.Y.Z`.
- Подвижный мажорный тег `v1` указывает на самый новый релиз `1.x.y`.
- Потребители закрепляют `@v1`, чтобы получать совместимые исправления. Для полной воспроизводимости закрепите точный `@vX.Y.Z`.

Создание этих тегов входит в процесс выпуска самого Action, а не в workflow потребителя.

## Что Action не делает

- Не публикует релиз. У него нет входов `publish` и `draft: false`, и он никогда не выполняет операцию, которая переводит черновик в опубликованное состояние.
- Не создаёт и не перемещает git-теги. Черновик указывает на коммит `HEAD`, полученный checkout.
- Не удаляет черновики. Если их несколько, он редактирует первый, который вернул GitHub, поэтому сопровождающий, который хранит несколько черновиков, должен чистить их вручную.

## Требования к раннеру

- Раннеры, которые хостит GitHub, включают `gh` и `git`. На self-hosted раннере установите GitHub CLI.
- Action сам устанавливает Node.js 24 через `actions/setup-node`.

## Разработка

```bash
npm ci
npm test
```

Этот репозиторий готовит собственные черновики релизов с помощью самого Action: `.github/workflows/release-draft.yml` запускает `uses: ./` при каждом push в `main`. Он создаёт или обновляет черновик и никогда его не публикует.

Модульные тесты покрывают перенесённую логику заметок о релизе, тест скрипта черновика с заглушкой `gh` и контрактный тест `action.yml`. CI также запускает самопроверку: собирает `test/fixtures/make-fixture-repo.sh`, запускает Action против этого репозитория с токеном только для чтения и заглушкой `gh` и проверяет версию, тег и заголовки разделов.

## Лицензия

Пока не выбрана. Лицензию нужно выбрать до публикации этого репозитория.
