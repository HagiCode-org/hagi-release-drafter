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

Eine zusammengesetzte GitHub Action, die aus den [Conventional Commits](https://www.conventionalcommits.org/) seit dem letzten stabilen Tag einen Entwurf für das nächste stabile Release `vX.Y.Z` erstellt. Sie legt einen GitHub-Release-Entwurf an oder aktualisiert einen vorhandenen Entwurf und **veröffentlicht nie**. Das Veröffentlichen des Entwurfs bleibt ein manueller Schritt in der GitHub-Oberfläche.

Die Action führt ein Node.js-Skript ohne Abhängigkeiten aus. Daher sind weder ein Build-Schritt noch ein gebündeltes Artefakt nötig.

## Verwendung

Füge dem Consumer-Repository einen Workflow hinzu:

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

Die `concurrency`-Gruppe verhindert, dass zwei Läufe den Entwurf gleichzeitig anlegen oder bearbeiten.

## Eingaben

| Eingabe | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `version` | Nein | `''` (aus Commits ableiten) | Stabiles `X.Y.Z`, das anstelle der abgeleiteten Version verwendet wird. Werte mit führendem `v` oder mit Pre-Release-Suffix werden abgelehnt. |
| `title-template` | Nein | `v{version}` | Release-Titel. `{version}` wird durch das nackte `X.Y.Z` ersetzt. Der Tag ist immer `v{version}`. |
| `github-token` | Nein | `${{ github.token }}` | Token für GitHub-API-Aufrufe. Der aufrufende Job muss `contents: write` gewähren. |

## Ausgaben

| Ausgabe | Beispiel | Beschreibung |
| --- | --- | --- |
| `version` | `1.4.0` | Ermittelte stabile Version ohne führendes `v`. |
| `tag` | `v1.4.0` | Release-Tag. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Pfad des gerenderten Release-Textes auf dem Runner. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL des erstellten oder aktualisierten Entwurfs. |

## Berechtigungen

- Der Job, der die Action aufruft, benötigt `contents: write`, um den Entwurf anzulegen oder zu bearbeiten.
- Der Checkout benötigt nur `contents: read`.
- Die Action benötigt keine `pull-requests`-Berechtigung und keinen anderen Schreibzugriff.

## Anforderungen an den Checkout

Version und Notizen werden aus der vollständigen Git-Historie und ihren Tags berechnet. Checke mit `fetch-depth: 0` und `fetch-tags: true` aus. Ein Shallow-Checkout bricht sofort mit einer Meldung ab, die diese Eingaben nennt, statt stillschweigend `0.1.0` zu erzeugen.

## So wird die Version gewählt

1. Die Basis ist der neueste stabile `vX.Y.Z`-Tag, der von `HEAD` aus erreichbar ist. Pre-Release-Tags wie `v1.3.0-beta.1` und Tags, die nicht semver sind, werden ignoriert.
2. Eine Breaking Change erhöht die Major-Version, solange die Major-Version `0` ist, aber die Minor-Version.
3. Ein `feat`-Commit erhöht die Minor-Version und setzt die Patch-Version auf null zurück.
4. Jede andere Commit-Kombination erhöht die Patch-Version.
5. Ohne stabilen Tag ist die Version `0.1.0`.
6. Die Eingabe `version` überschreibt die abgeleitete Version. Die Commits in den Notizen ändern sich dadurch nicht.

Die Notizen umfassen immer die Commits nach dem neuesten stabilen Tag.

## Conventional-Commit-Vokabular und Abschnitte

Jeder Commit landet im ersten Abschnitt, dessen Regel er erfüllt. Leere Abschnitte werden weggelassen, und Commits behalten die neueste-zuerst-Reihenfolge von Git bei.

| Abschnitt | Trifft zu auf |
| --- | --- |
| Breaking Changes | Jeder Commit mit `!` nach Typ oder Scope sowie ein Commit mit einem `BREAKING CHANGE:`- oder `BREAKING-CHANGE:`-Footer. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Jeder andere Typ, einschließlich Betreffzeilen, die nicht dem Conventional-Commits-Format folgen. |

Jeder Eintrag wird als `- **scope:** description ([`short-sha`](commit-url))` dargestellt. Das Scope-Präfix entfällt, wenn ein Commit keinen Scope hat.

## Tag-Richtlinie

- Jedes Release dieser Action erhält einen unveränderlichen Tag `vX.Y.Z`.
- Ein beweglicher Major-Tag `v1` zeigt auf das neueste Release `1.x.y`.
- Consumer heften sich mit `@v1` an und erhalten so kompatible Fixes. Für volle Reproduzierbarkeit pinne auf ein genaues `@vX.Y.Z`.

Das Erstellen dieser Tags gehört zum eigenen Release-Prozess der Action, nicht zum Workflow eines Consumers.

## Was die Action nicht tut

- Sie veröffentlicht kein Release. Sie hat keine Eingabe `publish` oder `draft: false` und führt nie eine Operation aus, die einen Entwurf auf veröffentlicht umstellt.
- Sie legt keine Git-Tags an und verschiebt sie nicht. Der Entwurf zeigt auf den ausgecheckten `HEAD`-Commit.
- Sie löscht keine Entwürfe. Gibt es mehrere, bearbeitet sie den ersten, den GitHub zurückliefert. Wer mehrere Entwürfe behält, muss sie selbst aufräumen.

## Anforderungen an den Runner

- GitHub-gehostete Runner enthalten `gh` und `git`. Auf einem selbst gehosteten Runner installiere die GitHub CLI.
- Die Action installiert Node.js 24 selbst über `actions/setup-node`.

## Entwicklung

```bash
npm ci
npm test
```

Dieses Repository erstellt seine eigenen Release-Entwürfe mit der Action selbst: `.github/workflows/release-draft.yml` führt bei jedem Push auf `main` `uses: ./` aus. Es legt einen Entwurf an oder aktualisiert ihn und veröffentlicht nie.

Die Unit-Tests decken die übernommene Logik der Release-Notizen, einen Stub-`gh`-Test des Entwurfsskripts und einen Vertragstest von `action.yml` ab. Die CI führt außerdem einen Selbsttest aus: Sie baut `test/fixtures/make-fixture-repo.sh`, führt die Action gegen dieses Repository mit einem Read-only-Token und einem Stub-`gh` aus und prüft Version, Tag und Abschnittsüberschriften.

## Lizenz

Noch nicht entschieden. Vor der Veröffentlichung dieses Repositorys muss eine Lizenz gewählt werden.
