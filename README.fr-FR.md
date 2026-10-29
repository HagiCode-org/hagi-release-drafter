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

Une action GitHub composite qui rédige un brouillon de la prochaine version stable `vX.Y.Z` à partir des [Conventional Commits](https://www.conventionalcommits.org/) effectués depuis le dernier tag de release, stable ou de pré-version. Elle crée un brouillon de release GitHub ou met à jour un brouillon existant, et **ne publie jamais**. La publication du brouillon reste une étape manuelle dans l'interface GitHub.

L'action exécute un script Node.js sans dépendances. Elle ne nécessite donc ni étape de build ni artefact embarqué.

## Utilisation

Ajoutez un workflow au dépôt utilisateur :

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

Le groupe `concurrency` empêche deux exécutions de créer ou modifier le brouillon en même temps.

## Entrées

| Entrée | Obligatoire | Valeur par défaut | Description |
| --- | --- | --- | --- |
| `version` | Non | `''` (dérivée des commits) | `X.Y.Z` stable à utiliser à la place de la version dérivée. Les valeurs préfixées par `v` ou suffixées d'une pré-version sont rejetées. |
| `title-template` | Non | `v{version}` | Titre de la release. `{version}` est remplacé par `X.Y.Z` sans préfixe. Le tag est toujours `v{version}`. |
| `github-token` | Non | `${{ github.token }}` | Jeton pour les appels à l'API GitHub. Le job appelant doit accorder `contents: write`. |

## Sorties

| Sortie | Exemple | Description |
| --- | --- | --- |
| `version` | `1.4.0` | Version stable retenue, sans `v` initial. |
| `tag` | `v1.4.0` | Tag de la release. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Chemin du corps de release généré sur le runner. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL du brouillon créé ou mis à jour. |

## Permissions

- Le job qui appelle l'action a besoin de `contents: write` pour créer ou modifier le brouillon.
- Le checkout n'a besoin que de `contents: read`.
- L'action n'exige pas la permission `pull-requests` ni aucune autre permission d'écriture.

## Prérequis du checkout

La version et les notes sont calculées à partir de l'historique git complet et de ses tags. Effectuez le checkout avec `fetch-depth: 0` et `fetch-tags: true`. Un checkout superficiel échoue immédiatement avec un message qui cite ces entrées, au lieu de produire silencieusement `0.1.0`.

## Comment la version est choisie

1. La base est le tag de release de plus haute précédence accessible depuis `HEAD`, selon l'ordre SemVer 2.0. Les tags de pré-version comme `v0.1.0-beta.97` comptent, `v0.1.0-beta.100` est classé au-dessus de `v0.1.0-beta.97`, et un tag stable est classé au-dessus de sa propre pré-version. Les tags hors de la grammaire des tags de release sont ignorés : métadonnées de build (`+`), zéros initiaux et noms non semver tels que `release-2`.
2. La version est dérivée du cœur `X.Y.Z` du tag de base. Un changement cassant augmente la version majeure, ou la version mineure tant que la majeure vaut `0`.
3. Un commit `feat` augmente la version mineure et remet le correctif à zéro.
4. Tout autre ensemble de commits augmente la version de correctif.
5. Sans tag de release accessible depuis `HEAD`, la version est `0.1.0` et les notes couvrent tout l'historique.
6. L'entrée `version` remplace la version dérivée. Les commits présents dans les notes ne changent pas.

Les notes couvrent toujours les commits postérieurs au tag de base, jusqu'à la fin de l'intervalle. La fin est `HEAD`, sauf si l'option `--end-tag` de la CLI termine l'intervalle d'un dépôt à un tag de release. L'option `--start-tag` de la CLI permet de fixer le tag de base d'un dépôt ; c'est le seul moyen de choisir une autre base.

**Intervalles bornés.** Un dépôt avec `--end-tag` tire sa version du cœur `X.Y.Z` du tag de fin, et non de la politique d'incrément, car son intervalle décrit une release qui existe déjà. Par exemple, `v0.1.0-beta.95` donne `0.1.0`. `--version` la remplace toujours. Sans `--end-tag`, les règles ci-dessus s'appliquent sans changement.

**Changement de comportement :** l'action et la CLI partagent cette règle. Un dépôt dont les tags accessibles incluent une pré-version obtient désormais un intervalle et une version différents de ceux que donnaient les versions précédentes de cette action. Les dépôts dont les seuls tags de release sont stables ne sont pas concernés.

## Vocabulaire Conventional Commit et sections

Chaque commit est placé dans la première section dont la règle correspond. Les sections vides sont omises, et les commits gardent l'ordre git du plus récent au plus ancien.

| Section | Correspond à |
| --- | --- |
| Breaking Changes | Tout commit avec `!` après le type ou le scope, ou avec un footer `BREAKING CHANGE:` ou `BREAKING-CHANGE:`. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Tout autre type, y compris les sujets qui ne suivent pas le format Conventional Commits. |

Chaque entrée est rendue sous la forme `- **scope:** description ([`short-sha`](commit-url))`. Le préfixe de scope est omis lorsqu'un commit n'a pas de scope.

### Exclure un commit des notes

Un commit dont le **sujet** (sa ligne de titre) contient `skip-release-notes` est exclu des notes de release. La correspondance est une sous-chaîne insensible à la casse, par exemple `docs: reword intro (skip-release-notes)`. Le marqueur est toujours actif ; aucune entrée, option ou configuration ne l'active ni ne le désactive. Seul le sujet est examiné : un corps ou un footer qui mentionne cette expression ne masque donc pas un commit.

Un commit ignoré est traité comme s'il ne figurait pas dans l'intervalle :

- Il n'est pas affiché et ne compte ni pour la limite d'entrées, ni pour le pied de page `Showing N of M commits`, ni pour le champ JSON `commitCount`.
- Il ne modifie pas la version. Un `feat:` ignoré ne provoque pas d'incrément mineur ; la version est dérivée comme si le commit était absent.
- Lorsque tous les commits de l'intervalle sont ignorés, les notes affichent `_No changes yet._`.

## Limite d'entrées

Le corps d'une release affiche au plus **100 entrées de commit**. Les titres de section, le pied de page et le texte d'un intervalle vide ne comptent pas. Un intervalle comptant 100 commits candidats ou moins affiche tous les commits.

La CLI indique, pour chaque dépôt, combien de commits sont candidats et combien d'entrées ont été affichées, de sorte qu'un changelog tronqué ne passe jamais inaperçu. La limite elle-même est inchangée.

Chaque candidat reçoit un niveau de priorité selon son type Conventional Commit. La première règle qui correspond s'applique.

| Niveau | Correspond à |
| --- | --- |
| 1 | Changements incompatibles de tout type, et `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert`, et tout commit de scope `security` (insensible à la casse). `fix(security)` reste au niveau 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test`, et les sujets qui ne suivent pas le format Conventional Commits |

Au-delà de 100 candidats, les commits sont omis du niveau le plus bas vers le haut, jusqu'à ce qu'il en reste 100 :

1. Niveau 4 avant niveau 3, niveau 3 avant niveau 2, et niveau 2 avant niveau 1.
2. Au sein du niveau 1, `feat` avant les changements incompatibles.
3. Sans scope avant avec scope.
4. Plus anciens avant plus récents.

Pour sortir un commit `chore`, `ci` ou `docs` lié à la sécurité du niveau 4, donnez-lui le scope `security`, par exemple `chore(security): rotate signing key`.

Lorsqu'un commit est omis, le corps se termine par un pied de page tel que `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`. Le lien pointe vers la vue de comparaison entre le tag de base, qui peut être un tag stable ou de pré-version, et `HEAD`, ou vers la liste des commits si aucun tag de release n'existe.

La limite n'affecte que le corps affiché. La version reste calculée à partir de tous les commits candidats, y compris ceux qui sont omis.

## Politique de tags

- Chaque release de cette action reçoit un tag `vX.Y.Z` immuable.
- Un tag majeur mobile `v1` pointe vers la dernière release `1.x.y`.
- Les utilisateurs épinglent `@v1` pour recevoir les correctifs compatibles. Épinglez un `@vX.Y.Z` exact pour une reproductibilité complète.

La création de ces tags fait partie du processus de release de l'action elle-même, et non du workflow d'un utilisateur.

## Ce que l'action ne fait pas

- Elle ne publie pas de release. Elle n'a ni entrée `publish` ni entrée `draft: false`, et n'exécute jamais d'opération qui fait passer un brouillon à l'état publié.
- Elle ne crée ni ne déplace de tags git. Le brouillon pointe vers le commit `HEAD` extrait.
- Elle ne supprime pas de brouillons. Lorsque plusieurs brouillons existent, elle modifie le premier que GitHub renvoie ; un mainteneur qui conserve plusieurs brouillons doit donc les nettoyer manuellement.

## Aperçu local avec la CLI

Le même moteur s'exécute sur votre machine sous le nom `hagi-release-drafter`, ce qui vous permet de prévisualiser la version et les notes de release avant une release. La CLI lit uniquement l'historique git. Elle ne publie jamais, n'appelle jamais l'API GitHub et n'a besoin d'aucun jeton. Ses seules écritures vont vers stdout, stderr, le fichier `--output` et le cache d'URL.

### Exécution et installation

La CLI nécessite Node.js 24 ou version ultérieure, et git. Depuis un clone de ce dépôt, compilez la CLI une fois :

```bash
pnpm install
pnpm run build
node dist/cli.js --help
```

Pour placer la commande dans votre `PATH`, empaquetez le paquet puis installez l'archive tarball :

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### Sous-commandes et entrées de dépôt

| Commande | Affiche |
| --- | --- |
| `hagi-release-drafter version` | La prochaine version stable, par exemple `1.4.0`. |
| `hagi-release-drafter notes` | Le corps de la release. Pour un seul dépôt avec la sortie par défaut, il est identique octet pour octet au fichier de notes de l'action. |

Sans entrée, le répertoire courant est utilisé s'il s'agit d'une arborescence de travail git. Sinon, fournissez une ou plusieurs entrées, soit sous la forme `--repo <input>` (répétable), soit comme arguments positionnels. Une entrée est un chemin local vers une arborescence de travail git, ou une URL HTTPS `github.com`, avec ou sans suffixe `.git`. Les entrées sont traitées dans l'ordre, un dépôt à la fois.

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

### Options

| Option | Signification |
| --- | --- |
| `--repo <input>` | Une entrée de dépôt. Répétable. |
| `--layout <name>` | `per-repo` (par défaut) ou `merged`. Ne modifie que le rapport Markdown. |
| `--format <name>` | `markdown` (par défaut) ou `json`. |
| `--output <file>` | Écrit le résultat dans un fichier. Stdout reste vide. |
| `--version <X.Y.Z>` | Utilise cette version stable au lieu de la version dérivée. Accepté pour un seul dépôt. |
| `--github-repository <owner/name>` | L'identité utilisée pour les liens de commit. S'applique à chaque entrée et remplace le remote `origin`. |
| `--start-tag <input>=<tag>` | Démarre l'intervalle d'un dépôt à ce tag de release au lieu du plus récent. `<input>` doit correspondre exactement à un dépôt tel que fourni, par exemple `./web` ; `web` et `./web` sont donc deux entrées différentes. Le tag doit exister et être accessible depuis le `HEAD` de ce dépôt. Répétable, un par dépôt. |
| `--end-tag <input>=<tag>` | Termine l'intervalle d'un dépôt à ce tag de release, par exemple `v0.1.0-beta.95`, au lieu de `HEAD`. Les mêmes règles que pour `--start-tag` s'appliquent, et le tag doit exister et être accessible depuis le `HEAD` de ce dépôt. Sans `--start-tag`, le début est le tag de release le plus récent situé sous la fin. La version est alors le cœur `X.Y.Z` du tag, sauf si `--version` est fourni. Répétable, un par dépôt. |
| `--cache-dir <dir>` | La racine du cache pour les clones d'URL. Voir ci-dessous. |
| `--fail-fast` | S'arrête après le premier dépôt en échec. |
| `-h`, `--help` | Affiche l'aide. |

### Dispositions et formats

- **`per-repo`** (par défaut) commence par un tableau récapitulatif : dépôt, statut, version, dernier tag, nombre de commits et nombre affiché. Le nombre de commits correspond à chaque commit candidat, et le nombre affiché au nombre d'entrées que montrent les notes. Chaque dépôt reçoit ensuite un bloc `###` dont les sections sont au niveau `####`. Un dépôt en échec a une version vide et un bloc qui en indique la raison.
- **`merged`** produit une seule section `## Changes`. Ses sections regroupent les entrées de tous les dépôts réussis, chacune étiquetée avec le nom de son dépôt. Chaque dépôt est réduit à cent entrées avant la fusion. Un dépôt tronqué obtient, avant la première section, une ligne telle que `_hagicode-core: showing 100 of 1324 commits._`.
- **`--format json`** affiche un objet avec un tableau `repositories` dans l'ordre des entrées. Chaque ligne a `input`, `name` et `status`. Les lignes réussies ajoutent `version`, `lastTag`, `lastTagSource` (`pinned` ou `auto`), `endTag` (le tag de fin d'un intervalle borné, sinon `null`), `commitCount` (le nombre de candidats), `renderedCount` (les entrées dans `notes`), `truncated` et `notes`. Les lignes en échec ajoutent `error`. Le JSON utilise toujours la forme par dépôt ; `--layout` ne le modifie donc pas.

### Codes de sortie

| Code | Signification |
| --- | --- |
| `0` | Tous les dépôts ont réussi. |
| `1` | Au moins un dépôt a échoué. La raison va sur stderr et dans le rapport. Un dépôt unique en échec n'affiche rien sur stdout. Un `--start-tag` manquant ou inaccessible ne fait échouer que son propre dépôt. Un `--end-tag` manquant ou inaccessible depuis `HEAD`, ou un tag de début qui n'est pas un ancêtre de son tag de fin, ne fait lui aussi échouer que son propre dépôt. |
| `2` | Erreur d'utilisation, et rien n'a été calculé. Cela couvre une sous-commande ou une option inconnue, une version, une disposition ou un format invalide, une entrée refusée, une entrée en double, `--version` avec plusieurs entrées, et une valeur de `--start-tag` ou `--end-tag` mal formée, qui n'est pas un tag de release, en double ou inconnue. |

### Emplacement du cache

Une entrée d'URL est clonée avec tout l'historique et tous les tags dans `<root>/repos/<owner>/<name>`. La racine est `--cache-dir` s'il est fourni, sinon `$XDG_CACHE_HOME/hagi-release-drafter`, sinon `~/.cache/hagi-release-drafter`. Les exécutions suivantes récupèrent les tags et l'historique dans le même clone. Rien n'est supprimé automatiquement ; supprimez donc le répertoire d'un clone pour récupérer de l'espace. Les dépôts privés utilisent les identifiants git que vous avez déjà. Une URL qui contient un nom d'utilisateur ou un mot de passe est rejetée.

### Ce que la CLI ne fait pas

- Elle ne publie, ne crée ni ne modifie de release, et n'appelle pas l'API GitHub. Elle ne lit aucun jeton, et `GH_TOKEN` et `GITHUB_TOKEN` n'ont aucun effet.
- Elle ne modifie aucun dépôt local que vous lui fournissez. Les refs, les tags et l'arborescence de travail restent tels quels.
- L'action n'utilise pas la CLI. Elle exécute toujours `scripts/release-notes.ts` directement sur Node.js 24 et n'a donc besoin d'aucune étape de build. Le paquet npm fournit le `dist/cli.js` compilé, construit à partir des mêmes sources.

## Prérequis du runner

- Les runners hébergés par GitHub incluent `gh` et `git`. Sur un runner auto-hébergé, installez la GitHub CLI.
- L'action installe elle-même Node.js 24 via `actions/setup-node`.

## Licence

Pas encore décidée. Une licence doit être choisie avant la publication de ce dépôt.
