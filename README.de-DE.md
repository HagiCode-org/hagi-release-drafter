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

Eine zusammengesetzte GitHub Action, die aus den [Conventional Commits](https://www.conventionalcommits.org/) seit dem letzten Release-Tag, stabil oder Pre-Release, einen Entwurf für das nächste stabile Release `vX.Y.Z` erstellt. Sie legt einen GitHub-Release-Entwurf an oder aktualisiert einen vorhandenen Entwurf und **veröffentlicht nie**. Das Veröffentlichen des Entwurfs bleibt ein manueller Schritt in der GitHub-Oberfläche.

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

1. Die Basis ist der von `HEAD` aus erreichbare Release-Tag mit dem höchsten Vorrang nach SemVer 2.0. Pre-Release-Tags wie `v0.1.0-beta.97` zählen mit, `v0.1.0-beta.100` steht über `v0.1.0-beta.97`, und ein stabiler Tag steht über seinem eigenen Pre-Release. Tags außerhalb der Release-Tag-Grammatik werden ignoriert: Build-Metadaten (`+`), führende Nullen und Nicht-semver-Namen wie `release-2`.
2. Die Version wird aus dem Kern `X.Y.Z` des Basis-Tags abgeleitet. Eine Breaking Change erhöht die Major-Version, solange die Major-Version `0` ist, aber die Minor-Version.
3. Ein `feat`-Commit erhöht die Minor-Version und setzt die Patch-Version auf null zurück.
4. Jede andere Commit-Kombination erhöht die Patch-Version.
5. Ist von `HEAD` aus kein Release-Tag erreichbar, ist die Version `0.1.0`, und die Notizen decken die gesamte Historie ab.
6. Die Eingabe `version` überschreibt die abgeleitete Version. Die Commits in den Notizen ändern sich dadurch nicht.

Die Notizen umfassen immer die Commits nach dem Basis-Tag bis zum Ende des Bereichs. Das Ende ist `HEAD`, es sei denn, das `--end-tag` der CLI beendet den Bereich eines Repositorys an einem Release-Tag. Mit dem `--start-tag` der CLI lässt sich der Basis-Tag eines Repositorys festlegen; nur so wählt man eine andere Basis.

**Begrenzte Bereiche.** Ein Repository mit `--end-tag` übernimmt seine Version aus dem Kern `X.Y.Z` des End-Tags und nicht aus der Bump-Regel, weil sein Bereich ein bereits existierendes Release beschreibt. Beispiel: `v0.1.0-beta.95` ergibt `0.1.0`. `--version` überschreibt sie weiterhin. Ohne `--end-tag` gelten die obigen Regeln unverändert.

**Verhaltensänderung:** Die Action und die CLI teilen sich diese Regel. Ein Repository, dessen erreichbare Tags einen Pre-Release enthalten, erhält jetzt einen anderen Bereich und eine andere Version als mit früheren Releases dieser Action. Repositorys, deren Release-Tags ausschließlich stabil sind, sind nicht betroffen.

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

### Einen Commit aus den Notizen ausnehmen

Ein Commit, dessen **Betreff** (die Titelzeile) `skip-release-notes` enthält, wird aus den Release-Notizen ausgelassen. Verglichen wird als Teilzeichenfolge ohne Beachtung der Groß-/Kleinschreibung, zum Beispiel `docs: reword intro (skip-release-notes)`. Der Marker ist immer aktiv; keine Eingabe, kein Flag und keine Konfiguration schaltet ihn ein oder aus. Geprüft wird nur der Betreff, ein Body oder Footer, der den Ausdruck erwähnt, verbirgt also keinen Commit.

Ein übersprungener Commit wird behandelt, als läge er nicht im Bereich:

- Er wird nicht gerendert und zählt weder zum Eintragslimit noch zur Fußzeile `Showing N of M commits` noch zum JSON-Feld `commitCount`.
- Er ändert die Version nicht. Ein übersprungenes `feat:` löst keinen Minor-Bump aus; die Version wird abgeleitet, als gäbe es den Commit nicht.
- Sind alle Commits im Bereich übersprungen, zeigen die Notizen `_No changes yet._`.

## Eintragslimit

Ein Release-Body rendert höchstens **100 Commit-Einträge**. Abschnittsüberschriften, die Fußzeile und der Text für einen leeren Bereich zählen nicht mit. Ein Bereich mit 100 oder weniger Kandidaten-Commits rendert jeden Commit.

Die CLI meldet für jedes Repository, wie viele Kandidaten-Commits es gibt und wie viele Einträge gerendert wurden, sodass ein gekürztes Changelog nie unbemerkt bleibt. Das Limit selbst ist unverändert.

Jeder Kandidat erhält eine Prioritätsstufe anhand seines Conventional-Commit-Typs. Die erste zutreffende Regel gilt.

| Stufe | Trifft zu |
| --- | --- |
| 1 | Breaking Changes jedes Typs und `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert` und jeder Commit mit Scope `security` (ohne Beachtung der Groß-/Kleinschreibung). `fix(security)` bleibt in Stufe 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test` und Betreffzeilen, die nicht dem Conventional-Commits-Format folgen |

Bei mehr als 100 Kandidaten werden Commits von der niedrigsten Stufe an entfernt, bis 100 übrig sind:

1. Stufe 4 vor Stufe 3, Stufe 3 vor Stufe 2 und Stufe 2 vor Stufe 1.
2. Innerhalb von Stufe 1 wird `feat` vor Breaking Changes entfernt.
3. Ohne Scope vor mit Scope.
4. Älter vor neuer.

Um einen sicherheitsrelevanten `chore`-, `ci`- oder `docs`-Commit aus Stufe 4 herauszuhalten, geben Sie ihm den Scope `security`, zum Beispiel `chore(security): rotate signing key`.

Wenn Commits entfernt werden, endet der Body mit einer Fußzeile wie `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`. Der Link führt zur Vergleichsansicht vom Basis-Tag, der ein stabiler oder ein Pre-Release-Tag sein kann, bis `HEAD`, oder zur Commit-Liste, wenn kein Release-Tag existiert.

Das Limit betrifft nur den gerenderten Body. Die Version wird weiterhin aus allen Kandidaten-Commits abgeleitet, einschließlich der entfernten.

## Tag-Richtlinie

- Jedes Release dieser Action erhält einen unveränderlichen Tag `vX.Y.Z`.
- Ein beweglicher Major-Tag `v1` zeigt auf das neueste Release `1.x.y`.
- Consumer heften sich mit `@v1` an und erhalten so kompatible Fixes. Für volle Reproduzierbarkeit pinne auf ein genaues `@vX.Y.Z`.

Das Erstellen dieser Tags gehört zum eigenen Release-Prozess der Action, nicht zum Workflow eines Consumers.

## Was die Action nicht tut

- Sie veröffentlicht kein Release. Sie hat keine Eingabe `publish` oder `draft: false` und führt nie eine Operation aus, die einen Entwurf auf veröffentlicht umstellt.
- Sie legt keine Git-Tags an und verschiebt sie nicht. Der Entwurf zeigt auf den ausgecheckten `HEAD`-Commit.
- Sie löscht keine Entwürfe. Gibt es mehrere, bearbeitet sie den ersten, den GitHub zurückliefert. Wer mehrere Entwürfe behält, muss sie selbst aufräumen.

## Lokale Vorschau mit der CLI

Dieselbe Engine läuft als `hagi-release-drafter` auf deinem Rechner, sodass du Version und Release-Notizen vor einem Release in der Vorschau ansehen kannst. Die CLI liest nur die Git-Historie. Sie veröffentlicht nie, ruft die GitHub-API nicht auf und braucht kein Token. Sie schreibt ausschließlich nach stdout, stderr, in die `--output`-Datei und in den URL-Cache.

### Ausführen und installieren

Die CLI benötigt Node.js 24 oder neuer und Git. Baue in einem Klon dieses Repositorys einmalig die kompilierte CLI:

```bash
pnpm install
pnpm run build
node dist/cli.js --help
```

Damit der Befehl in deinem `PATH` liegt, packe das Paket und installiere das Tarball:

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### Unterbefehle und Repository-Eingaben

| Befehl | Gibt aus |
| --- | --- |
| `hagi-release-drafter version` | Die nächste stabile Version, zum Beispiel `1.4.0`. |
| `hagi-release-drafter notes` | Den Release-Body. Für ein Repository in der Standardausgabe ist er byteidentisch mit der Notizdatei der Action. |

Ohne Eingabe wird das aktuelle Verzeichnis verwendet, sofern es ein Git-Arbeitsverzeichnis ist. Andernfalls gib eine oder mehrere Eingaben an, entweder als `--repo <input>` (wiederholbar) oder als Positionsargumente. Eine Eingabe ist ein lokaler Pfad zu einem Git-Arbeitsverzeichnis oder eine HTTPS-`github.com`-URL, mit oder ohne Suffix `.git`. Die Eingaben werden der Reihe nach verarbeitet, jeweils ein Repository.

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

### Flags

| Flag | Bedeutung |
| --- | --- |
| `--repo <input>` | Eine Repository-Eingabe. Wiederholbar. |
| `--layout <name>` | `per-repo` (Standard) oder `merged`. Ändert nur den Markdown-Bericht. |
| `--format <name>` | `markdown` (Standard) oder `json`. |
| `--output <file>` | Schreibt das Ergebnis in eine Datei. Stdout bleibt leer. |
| `--version <X.Y.Z>` | Verwendet diese stabile Version anstelle der abgeleiteten. Nur für ein Repository zulässig. |
| `--github-repository <owner/name>` | Die Identität für Commit-Links. Gilt für jede Eingabe und überschreibt den Remote `origin`. |
| `--start-tag <input>=<tag>` | Beginnt den Bereich eines Repositorys an diesem Release-Tag statt am neuesten. `<input>` muss genau so wie angegeben zu einem Repository passen, etwa `./web`, daher sind `web` und `./web` verschiedene Eingaben. Der Tag muss existieren und vom `HEAD` dieses Repositorys aus erreichbar sein. Wiederholbar, eines pro Repository. |
| `--end-tag <input>=<tag>` | Beendet den Bereich eines Repositorys an diesem Release-Tag, etwa `v0.1.0-beta.95`, statt an `HEAD`. Es gelten dieselben Regeln wie bei `--start-tag`, und der Tag muss existieren und vom `HEAD` dieses Repositorys aus erreichbar sein. Ohne `--start-tag` ist der Start der neueste Release-Tag unterhalb des Endes. Die Version ist dann der Kern `X.Y.Z` des Tags, sofern nicht `--version` angegeben ist. Wiederholbar, eines pro Repository. |
| `--cache-dir <dir>` | Das Cache-Stammverzeichnis für URL-Klone. Siehe unten. |
| `--fail-fast` | Bricht nach dem ersten fehlgeschlagenen Repository ab. |
| `-h`, `--help` | Zeigt die Hilfe an. |

### Layouts und Formate

- **`per-repo`** (Standard) beginnt mit einer Übersichtstabelle: Repository, Status, Version, letzter Tag, Commit-Anzahl und gerenderte Anzahl. Die Commit-Anzahl umfasst jeden Kandidaten-Commit, die gerenderte Anzahl sind die Einträge, die die Notizen zeigen. Danach erhält jedes Repository einen `###`-Block, dessen Abschnitte auf `####` liegen. Ein fehlgeschlagenes Repository hat eine leere Version und einen Block, der den Grund nennt.
- **`merged`** liefert einen einzigen Abschnitt `## Changes`. Seine Abschnitte enthalten die Einträge aller erfolgreichen Repositorys, jeweils mit dem Repository-Namen gekennzeichnet. Jedes Repository wird vor dem Zusammenführen auf hundert Einträge gekürzt. Ein gekürztes Repository erhält vor dem ersten Abschnitt eine Zeile wie `_hagicode-core: showing 100 of 1324 commits._`.
- **`--format json`** gibt ein Objekt mit einem Array `repositories` in der Reihenfolge der Eingaben aus. Jede Zeile hat `input`, `name` und `status`. Erfolgreiche Zeilen ergänzen `version`, `lastTag`, `lastTagSource` (`pinned` oder `auto`), `endTag` (der End-Tag eines begrenzten Bereichs, sonst `null`), `commitCount` (die Anzahl der Kandidaten), `renderedCount` (die Einträge in `notes`), `truncated` und `notes`. Fehlgeschlagene Zeilen ergänzen `error`. JSON verwendet immer die Form pro Repository, daher ändert `--layout` daran nichts.

### Exit-Codes

| Code | Bedeutung |
| --- | --- |
| `0` | Jedes Repository war erfolgreich. |
| `1` | Mindestens ein Repository ist fehlgeschlagen. Der Grund geht nach stderr und in den Bericht. Ein fehlgeschlagenes einzelnes Repository gibt nichts nach stdout aus. Ein fehlender oder nicht erreichbarer `--start-tag`-Pin lässt nur das eigene Repository fehlschlagen. Ein `--end-tag`, der fehlt oder von `HEAD` aus nicht erreichbar ist, oder ein Start-Tag, der kein Vorfahre seines End-Tags ist, lässt ebenfalls nur das eigene Repository fehlschlagen. |
| `2` | Verwendungsfehler, es wurde nichts berechnet. Das betrifft einen unbekannten Unterbefehl oder ein unbekanntes Flag, eine ungültige Version, ein ungültiges Layout oder Format, eine abgelehnte Eingabe, eine doppelte Eingabe, `--version` mit mehreren Eingaben sowie einen fehlerhaften, nicht als Release geeigneten, doppelten oder unbekannten `--start-tag`- oder `--end-tag`-Wert. |

### Cache-Speicherort

Eine URL-Eingabe wird mit vollständiger Historie und allen Tags nach `<root>/repos/<owner>/<name>` geklont. Das Stammverzeichnis ist `--cache-dir`, falls angegeben, sonst `$XDG_CACHE_HOME/hagi-release-drafter`, sonst `~/.cache/hagi-release-drafter`. Spätere Läufe holen Tags und Historie in denselben Klon. Nichts wird automatisch entfernt, lösche also ein Klonverzeichnis, um Platz freizugeben. Private Repositorys verwenden die Git-Zugangsdaten, die du bereits hast. Eine URL, die einen Benutzernamen oder ein Passwort enthält, wird abgelehnt.

### Was die CLI nicht tut

- Sie veröffentlicht, erstellt oder bearbeitet kein Release und ruft die GitHub-API nicht auf. Sie liest kein Token, und `GH_TOKEN` und `GITHUB_TOKEN` haben keine Wirkung.
- Sie ändert kein lokales Repository, das du ihr gibst. Refs, Tags und Arbeitsverzeichnis bleiben unverändert.
- Die Action verwendet die CLI nicht. Sie führt weiterhin `scripts/release-notes.ts` direkt unter Node.js 24 aus und braucht daher keinen Build-Schritt. Das npm-Paket enthält die kompilierte `dist/cli.js`, gebaut aus denselben Quellen.

## Anforderungen an den Runner

- GitHub-gehostete Runner enthalten `gh` und `git`. Auf einem selbst gehosteten Runner installiere die GitHub CLI.
- Die Action installiert Node.js 24 selbst über `actions/setup-node`.

## Lizenz

Noch nicht entschieden. Vor der Veröffentlichung dieses Repositorys muss eine Lizenz gewählt werden.
