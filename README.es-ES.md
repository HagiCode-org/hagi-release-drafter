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

Una GitHub Action compuesta que redacta el borrador de la próxima versión estable `vX.Y.Z` a partir de los [Conventional Commits](https://www.conventionalcommits.org/) realizados desde el último tag de release, estable o de prerelease. Crea un borrador de release en GitHub o actualiza uno existente, y **nunca lo publica**. Publicar el borrador sigue siendo un paso manual en la interfaz de GitHub.

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

1. La base es el tag de release de mayor precedencia alcanzable desde `HEAD`, ordenado según SemVer 2.0. Los tags de
   prerelease como `v0.1.0-beta.97` cuentan, `v0.1.0-beta.100` queda por encima de `v0.1.0-beta.97`, y un tag estable
   queda por encima de su propia prerelease. Se ignoran los tags que quedan fuera de la gramática de tags de release:
   metadatos de build (`+`), ceros a la izquierda y nombres que no son semver, como `release-2`.
2. La versión se deriva del `X.Y.Z` central del tag base. Un cambio incompatible incrementa la versión mayor, o la
   menor mientras la mayor sea `0`.
3. Un commit `feat` incrementa la versión menor y reinicia el parche a cero.
4. Cualquier otro conjunto de commits incrementa la versión de parche.
5. Si no hay ningún tag de release alcanzable desde `HEAD`, la versión es `0.1.0` y las notas cubren todo el historial.
6. La entrada `version` sustituye a la versión derivada. Los commits de las notas no cambian.

Las notas siempre cubren los commits posteriores al tag base, hasta el final del rango. El final es `HEAD`, salvo que
el `--end-tag` de la CLI termine el rango de un repositorio en un tag de release. El `--start-tag` de la CLI puede fijar
el tag base de un repositorio, y es la única forma de elegir otra base.

**Rangos acotados.** Un repositorio con `--end-tag` toma su versión del `X.Y.Z` central del tag final, no de la política
de incremento, porque su rango describe una release que ya existe. Por ejemplo, `v0.1.0-beta.95` da `0.1.0`.
`--version` sigue sustituyéndola. Sin `--end-tag`, las reglas anteriores se aplican sin cambios.

**Cambio de comportamiento:** la action y la CLI comparten esta regla. Un repositorio cuyos tags alcanzables incluyen
una prerelease ahora obtiene un rango y una versión distintos de los que daban las releases anteriores de esta action.
Los repositorios cuyos únicos tags de release son estables no se ven afectados.

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

### Dejar un commit fuera de las notas

Un commit cuyo **asunto** (su línea de título) contiene `skip-release-notes` se deja fuera de las notas de la release. La coincidencia
es una subcadena sin distinguir mayúsculas, por ejemplo `docs: reword intro (skip-release-notes)`. El marcador está siempre activo; ninguna entrada,
flag ni configuración lo activa o desactiva. Solo se inspecciona el asunto, así que un cuerpo o un pie que mencione la frase
no oculta un commit.

Un commit omitido se trata como si no estuviera en el rango:

- No se muestra, y no cuenta para el límite de entradas, para el pie `Showing N of M commits` ni para el `commitCount` del JSON.
- No cambia la versión. Un `feat:` omitido no provoca un incremento menor; la versión se deriva como si el commit no existiera.
- Cuando todos los commits del rango se omiten, las notas muestran `_No changes yet._`.

## Límite de entradas

Un cuerpo de release muestra como máximo **100 entradas de commit**. Los encabezados de sección, el pie y el texto de un rango vacío no cuentan. Un rango con 100 commits candidatos o menos muestra todos los commits.

Para cada repositorio, la CLI informa de cuántos commits candidatos hay y cuántas entradas se mostraron, de modo que un changelog truncado nunca pase inadvertido. El límite en sí no cambia.

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

Cuando se omite algún commit, el cuerpo termina con un pie como `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`. El enlace apunta a la vista de comparación desde el tag base, que puede ser un tag estable o de prerelease, hasta `HEAD`, o a la lista de commits si no existe ningún tag de release.

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

## Vista previa local con la CLI

El mismo motor se ejecuta en tu máquina como `hagi-release-drafter`, así que puedes previsualizar la versión y las
notas de la release antes de publicarla. La CLI solo lee el historial de git. Nunca publica, nunca llama a la API de
GitHub y no necesita ningún token. Sus únicas escrituras van a stdout, stderr, el archivo de `--output` y la caché de URL.

### Ejecución e instalación

La CLI necesita Node.js 24 o posterior y git. Desde un clon de este repositorio, compila la CLI una vez:

```bash
npm ci
npm run build
node dist/cli.js --help
```

Para poner el comando en tu `PATH`, empaqueta el paquete e instala el tarball:

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### Subcomandos y entradas de repositorio

| Comando | Imprime |
| --- | --- |
| `hagi-release-drafter version` | La próxima versión estable, por ejemplo `1.4.0`. |
| `hagi-release-drafter notes` | El cuerpo de la release. Para un solo repositorio con la salida por defecto, es idéntico byte a byte al archivo de notas de la action. |

Sin ninguna entrada, se usa el directorio actual si es un árbol de trabajo de git. En caso contrario, indica una o más
entradas, ya sea como `--repo <input>` (repetible) o como argumentos posicionales. Una entrada es una ruta local a un
árbol de trabajo de git, o una URL HTTPS de `github.com`, con o sin sufijo `.git`. Las entradas se procesan en
orden, un repositorio cada vez.

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

| Flag | Significado |
| --- | --- |
| `--repo <input>` | Una entrada de repositorio. Repetible. |
| `--layout <name>` | `per-repo` (por defecto) o `merged`. Cambia solo el informe en Markdown. |
| `--format <name>` | `markdown` (por defecto) o `json`. |
| `--output <file>` | Escribe el resultado en un archivo. Stdout queda vacío. |
| `--version <X.Y.Z>` | Usa esta versión estable en lugar de la derivada. Se acepta solo para un repositorio. |
| `--github-repository <owner/name>` | La identidad para los enlaces de commit. Se aplica a todas las entradas y sustituye al remoto `origin`. |
| `--start-tag <input>=<tag>` | Inicia el rango de un repositorio en este tag de release en lugar del más reciente. `<input>` debe coincidir exactamente con un repositorio tal como se indicó, por ejemplo `./web`, así que `web` y `./web` son entradas distintas. El tag debe existir y ser alcanzable desde el `HEAD` de ese repositorio. Repetible, uno por repositorio. |
| `--end-tag <input>=<tag>` | Termina el rango de un repositorio en este tag de release, por ejemplo `v0.1.0-beta.95`, en lugar de `HEAD`. Se aplican las mismas reglas que a `--start-tag`, y el tag debe existir y ser alcanzable desde el `HEAD` de ese repositorio. Sin `--start-tag`, el inicio es el tag de release más reciente por debajo del final. Entonces la versión es el `X.Y.Z` central del tag, salvo que se indique `--version`. Repetible, uno por repositorio. |
| `--cache-dir <dir>` | La raíz de la caché para los clones de URL. Véase más abajo. |
| `--fail-fast` | Se detiene tras el primer repositorio que falle. |
| `-h`, `--help` | Muestra el uso. |

### Disposiciones y formatos

- **`per-repo`** (por defecto) empieza con una tabla resumen: repositorio, estado, versión, último tag, número de commits
  y número de entradas mostradas. El número de commits es el de todos los commits candidatos, y el número mostrado es el de entradas que
  muestran las notas. Después, cada repositorio recibe un bloque `###` cuyas secciones van en `####`. Un repositorio
  fallido tiene una versión vacía y un bloque que indica el motivo.
- **`merged`** produce una única sección `## Changes`. Sus secciones contienen las entradas de todos los repositorios
  correctos, cada una etiquetada con el nombre de su repositorio. Cada repositorio se recorta a cien entradas antes de combinarlos.
  Un repositorio truncado recibe una línea como `_hagicode-core: showing 100 of 1324 commits._` antes de la primera
  sección.
- **`--format json`** imprime un objeto con un array `repositories` en el orden de las entradas. Cada fila tiene `input`,
  `name` y `status`. Las filas correctas añaden `version`, `lastTag`, `lastTagSource` (`pinned` o `auto`),
  `endTag` (el tag final de un rango acotado, o `null` en caso contrario), `commitCount` (el número de candidatos), `renderedCount` (las entradas de `notes`), `truncated` y `notes`.
  Las filas fallidas añaden `error`. JSON siempre usa la forma por repositorio, así que `--layout` no lo cambia.

### Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Todos los repositorios se procesaron correctamente. |
| `1` | Al menos un repositorio falló. El motivo va a stderr y al informe. Un único repositorio fallido no imprime nada en stdout. Una fijación `--start-tag` ausente o inalcanzable hace fallar solo a su propio repositorio. Un `--end-tag` ausente o no alcanzable desde `HEAD`, o un tag inicial que no es ancestro de su tag final, también hace fallar solo a su propio repositorio. |
| `2` | Error de uso, y no se calculó nada. Incluye un subcomando o flag desconocido, una versión, disposición o formato no válidos, una entrada rechazada, una entrada duplicada, `--version` con varias entradas, y un valor `--start-tag` o `--end-tag` mal formado, que no sea de release, duplicado o desconocido. |

### Ubicación de la caché

Una entrada URL se clona con el historial completo y todos los tags en `<root>/repos/<owner>/<name>`. La raíz es
`--cache-dir` cuando se indica; en caso contrario, `$XDG_CACHE_HOME/hagi-release-drafter`; y si no,
`~/.cache/hagi-release-drafter`. Las ejecuciones posteriores obtienen tags e historial en el mismo clon. Nada se elimina
automáticamente, así que borra el directorio de un clon para recuperar espacio. Los repositorios privados usan las credenciales de git que
ya tengas. Se rechaza una URL que contenga un nombre de usuario o una contraseña.

### Lo que la CLI no hace

- No publica, crea ni edita una release, y no llama a la API de GitHub. No lee ningún token,
  y `GH_TOKEN` y `GITHUB_TOKEN` no tienen ningún efecto.
- No modifica ningún repositorio local que le indiques. Las refs, los tags y el árbol de trabajo quedan como estaban.
- La action no usa la CLI. Sigue ejecutando `scripts/release-notes.ts` directamente con Node.js 24, así que
  no necesita un paso de compilación. El paquete npm incluye el `dist/cli.js` compilado, construido a partir de las mismas fuentes.

## Requisitos del runner

- Los runners alojados en GitHub incluyen `gh` y `git`. En un runner autoalojado, instala la GitHub CLI.
- La action instala Node.js 24 por sí misma mediante `actions/setup-node`.

## Licencia

Aún no decidida. Hay que elegir una licencia antes de publicar este repositorio.
