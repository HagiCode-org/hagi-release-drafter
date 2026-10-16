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

Une action GitHub composite qui rédige un brouillon de la prochaine version stable `vX.Y.Z` à partir des [Conventional Commits](https://www.conventionalcommits.org/) effectués depuis le dernier tag stable. Elle crée un brouillon de release GitHub ou met à jour un brouillon existant, et **ne publie jamais**. La publication du brouillon reste une étape manuelle dans l'interface GitHub.

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

1. La base est le tag stable `vX.Y.Z` le plus récent accessible depuis `HEAD`. Les tags de pré-version comme `v1.3.0-beta.1` et les tags non semver sont ignorés.
2. Un changement cassant augmente la version majeure, ou la version mineure tant que la majeure vaut `0`.
3. Un commit `feat` augmente la version mineure et remet le correctif à zéro.
4. Tout autre ensemble de commits augmente la version de correctif.
5. Sans tag stable, la version est `0.1.0`.
6. L'entrée `version` remplace la version dérivée. Les commits présents dans les notes ne changent pas.

Les notes couvrent toujours les commits postérieurs au tag stable le plus récent.

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

## Limite d'entrées

Le corps d'une release affiche au plus **100 entrées de commit**. Les titres de section, le pied de page et le texte d'un intervalle vide ne comptent pas. Un intervalle comptant 100 commits candidats ou moins affiche tous les commits.

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

Lorsqu'un commit est omis, le corps se termine par un pied de page tel que `_Showing 100 of 170 commits._ [Full changelog](...)`. Le lien pointe vers la vue de comparaison entre le dernier tag stable et `HEAD`, ou vers la liste des commits si aucun tag stable n'existe.

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

## Prérequis du runner

- Les runners hébergés par GitHub incluent `gh` et `git`. Sur un runner auto-hébergé, installez la GitHub CLI.
- L'action installe elle-même Node.js 24 via `actions/setup-node`.

## Développement

```bash
npm ci
npm test
```

Ce dépôt rédige ses propres brouillons de release avec l'action elle-même : `.github/workflows/release-draft.yml` exécute `uses: ./` à chaque push sur `main`. Il crée ou met à jour un brouillon et ne publie jamais.

Les tests unitaires couvrent la logique portée des notes de release, un test du script de brouillon avec un `gh` factice, et un test de contrat de `action.yml`. La CI exécute aussi un autotest : elle construit `test/fixtures/make-fixture-repo.sh`, exécute l'action sur ce dépôt avec un jeton en lecture seule et un `gh` factice, puis vérifie la version, le tag et les titres de section.

## Licence

Pas encore décidée. Une licence doit être choisie avant la publication de ce dépôt.
