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

Una GitHub Action compuesta que redacta el borrador de la próxima versión estable `vX.Y.Z` a partir de los [Conventional Commits](https://www.conventionalcommits.org/) realizados desde el último tag estable. Crea un borrador de release en GitHub o actualiza uno existente, y **nunca lo publica**. Publicar el borrador sigue siendo un paso manual en la interfaz de GitHub.

La action ejecuta un script de Node.js sin dependencias, así que no necesita un paso de compilación ni un artefacto incluido.

## Uso

Añade un workflow al repositorio consumidor:

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

El grupo `concurrency` evita que dos ejecuciones creen o editen el borrador al mismo tiempo.

## Entradas

| Entrada | Obligatoria | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `version` | No | `''` (derivar de los commits) | `X.Y.Z` estable que se usa en lugar de la versión derivada. Los valores con `v` inicial o con sufijo de prerelease se rechazan. |
| `title-template` | No | `v{version}` | Título de la release. `{version}` se reemplaza por el `X.Y.Z` sin prefijo. El tag es siempre `v{version}`. |
| `github-token` | No | `${{ github.token }}` | Token para las llamadas a la API de GitHub. El job que llama debe conceder `contents: write`. |

## Salidas

| Salida | Ejemplo | Descripción |
| --- | --- | --- |
| `version` | `1.4.0` | Versión estable resuelta, sin la `v` inicial. |
| `tag` | `v1.4.0` | Tag de la release. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Ruta del cuerpo de la release generado en el runner. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL del borrador creado o actualizado. |

## Permisos

- El job que llama a la action necesita `contents: write` para crear o editar el borrador.
- El checkout solo necesita `contents: read`.
- La action no requiere el permiso `pull-requests` ni ningún otro permiso de escritura.

## Requisitos del checkout

La versión y las notas se calculan a partir del historial completo de git y sus tags. Haz el checkout con `fetch-depth: 0` y `fetch-tags: true`. Un checkout superficial falla de inmediato con un mensaje que menciona estas entradas, en lugar de producir `0.1.0` en silencio.

## Cómo se elige la versión

1. La base es el tag estable `vX.Y.Z` más reciente alcanzable desde `HEAD`. Se ignoran los tags de prerelease, como `v1.3.0-beta.1`, y los tags que no son semver.
2. Un cambio incompatible incrementa la versión mayor, o la menor mientras la mayor sea `0`.
3. Un commit `feat` incrementa la versión menor y reinicia el parche a cero.
4. Cualquier otro conjunto de commits incrementa la versión de parche.
5. Si todavía no hay ningún tag estable, la versión es `0.1.0`.
6. La entrada `version` sustituye a la versión derivada. Los commits de las notas no cambian.

Las notas siempre cubren los commits posteriores al tag estable más reciente.

## Vocabulario de Conventional Commits y secciones

Cada commit cae en la primera sección cuya regla cumple. Las secciones vacías se omiten, y los commits mantienen el orden de git, del más nuevo al más antiguo.

| Sección | Coincide con |
| --- | --- |
| Breaking Changes | Cualquier commit con `!` después del tipo o del ámbito, o con un pie `BREAKING CHANGE:` o `BREAKING-CHANGE:`. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Cualquier otro tipo, incluidos los asuntos que no siguen el formato de Conventional Commits. |

Cada entrada se muestra como `- **scope:** description ([`short-sha`](commit-url))`. El prefijo del ámbito se omite cuando un commit no tiene ámbito.

## Límite de entradas

Un cuerpo de release muestra como máximo **100 entradas de commit**. Los encabezados de sección, el pie y el texto de un rango vacío no cuentan. Un rango con 100 commits candidatos o menos muestra todos los commits.

Cada candidato recibe un nivel de prioridad según el tipo de Conventional Commit. Se aplica la primera regla que coincida.

| Nivel | Coincide con |
| --- | --- |
| 1 | Cambios incompatibles de cualquier tipo, y `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert` y cualquier commit con ámbito `security` (sin distinguir mayúsculas). `fix(security)` permanece en el nivel 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test` y los asuntos que no siguen el formato de Conventional Commits |

Con más de 100 candidatos, se omiten commits desde el nivel más bajo hacia arriba hasta que queden 100:

1. Nivel 4 antes que nivel 3, nivel 3 antes que nivel 2, y nivel 2 antes que nivel 1.
2. Dentro del nivel 1, `feat` antes que los cambios incompatibles.
3. Sin ámbito antes que con ámbito.
4. Más antiguos antes que más recientes.

Para que un commit `chore`, `ci` o `docs` relevante para la seguridad no quede en el nivel 4, asígnele el ámbito `security`, por ejemplo `chore(security): rotate signing key`.

Cuando se omite algún commit, el cuerpo termina con un pie como `_Showing 100 of 170 commits._ [Full changelog](...)`. El enlace apunta a la vista de comparación desde la última etiqueta estable hasta `HEAD`, o a la lista de commits si no existe ninguna etiqueta estable.

El límite solo afecta al cuerpo renderizado. La versión se sigue calculando a partir de todos los commits candidatos, incluidos los omitidos.

## Política de tags

- Cada release de esta action recibe un tag `vX.Y.Z` inmutable.
- El tag de versión mayor móvil `v1` apunta a la release `1.x.y` más reciente.
- Los consumidores fijan `@v1` para recibir correcciones compatibles. Para una reproducibilidad total, fija un `@vX.Y.Z` exacto.

Crear estos tags forma parte del proceso de release de la propia action, no del workflow de un consumidor.

## Lo que la action no hace

- No publica ninguna release. No tiene entradas `publish` ni `draft: false`, y nunca ejecuta una operación que cambie un borrador a publicado.
- No crea ni mueve tags de git. El borrador apunta al commit `HEAD` del checkout.
- No elimina borradores. Si existen varios, edita el primero que devuelve GitHub, así que quien mantenga varios borradores debe limpiarlos a mano.

## Requisitos del runner

- Los runners alojados en GitHub incluyen `gh` y `git`. En un runner autoalojado, instala la GitHub CLI.
- La action instala Node.js 24 por sí misma mediante `actions/setup-node`.

## Desarrollo

```bash
npm ci
npm test
```

Este repositorio redacta sus propios borradores de release con la propia action: `.github/workflows/release-draft.yml` ejecuta `uses: ./` en cada push a `main`. Crea o actualiza un borrador y nunca lo publica.

Las pruebas unitarias cubren la lógica portada de las notas de release, una prueba del script de borradores con un `gh` simulado (stub) y una prueba de contrato de `action.yml`. La CI también ejecuta una autoprueba: construye `test/fixtures/make-fixture-repo.sh`, ejecuta la action contra ese repositorio con un token de solo lectura y un `gh` simulado, y comprueba la versión, el tag y los encabezados de sección.

## Licencia

Aún no decidida. Hay que elegir una licencia antes de publicar este repositorio.
