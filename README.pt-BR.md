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

Uma GitHub Action composta que cria o rascunho da próxima versão estável `vX.Y.Z` a partir dos [Conventional Commits](https://www.conventionalcommits.org/) feitos desde a última tag de release, estável ou de pré-lançamento. Ela cria um rascunho de release no GitHub ou atualiza um rascunho existente, e **nunca publica**. Publicar o rascunho continua sendo uma etapa manual na interface do GitHub.

A action executa um script Node.js sem dependências, por isso não precisa de etapa de build nem de artefato empacotado.

## Uso

Adicione um workflow ao repositório consumidor:

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

O grupo `concurrency` impede que duas execuções criem ou editem o rascunho ao mesmo tempo.

## Entradas

| Entrada | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `version` | Não | `''` (derivar dos commits) | `X.Y.Z` estável a usar no lugar da versão derivada. Valores com `v` no início ou com sufixo de pré-lançamento são rejeitados. |
| `title-template` | Não | `v{version}` | Título da release. `{version}` é substituído pelo `X.Y.Z` sem prefixo. A tag é sempre `v{version}`. |
| `github-token` | Não | `${{ github.token }}` | Token para as chamadas à API do GitHub. O job chamador precisa conceder `contents: write`. |

## Saídas

| Saída | Exemplo | Descrição |
| --- | --- | --- |
| `version` | `1.4.0` | Versão estável resolvida, sem o `v` inicial. |
| `tag` | `v1.4.0` | Tag da release. |
| `notes-file` | `/home/runner/work/_temp/release-notes.md` | Caminho do corpo da release gerado no runner. |
| `release-url` | `https://github.com/owner/repo/releases/tag/v1.4.0` | URL do rascunho criado ou atualizado. |

## Permissões

- O job que chama a action precisa de `contents: write` para criar ou editar o rascunho.
- O checkout precisa apenas de `contents: read`.
- A action não exige a permissão `pull-requests` nem nenhuma outra permissão de escrita.

## Requisitos do checkout

A versão e as notas são calculadas a partir do histórico completo do git e de suas tags. Faça o checkout com `fetch-depth: 0` e `fetch-tags: true`. Um checkout raso falha imediatamente com uma mensagem que cita essas entradas, em vez de gerar `0.1.0` silenciosamente.

## Como a versão é escolhida

1. A base é a tag de release de maior precedência alcançável a partir de `HEAD`, ordenada segundo o SemVer 2.0. Tags
   de pré-lançamento como `v0.1.0-beta.97` contam, `v0.1.0-beta.100` fica acima de `v0.1.0-beta.97`, e uma tag estável
   fica acima do seu próprio pré-lançamento. Tags fora da gramática de tags de release são ignoradas: metadados de
   build (`+`), zeros à esquerda e nomes que não seguem semver, como `release-2`.
2. A versão é derivada do `X.Y.Z` central da tag base. Uma mudança incompatível incrementa a versão principal ou,
   enquanto a principal for `0`, a versão secundária.
3. Um commit `feat` incrementa a versão secundária e zera o patch.
4. Qualquer outro conjunto de commits incrementa a versão de patch.
5. Sem nenhuma tag de release alcançável a partir de `HEAD`, a versão é `0.1.0` e as notas cobrem todo o histórico.
6. A entrada `version` substitui a versão derivada. Os commits nas notas não mudam.

As notas sempre cobrem os commits posteriores à tag base, até o fim do intervalo. O fim é `HEAD`, a menos que o
`--end-tag` da CLI encerre o intervalo de um repositório em uma tag de release. O `--start-tag` da CLI pode fixar a tag
base de um repositório, e é a única forma de escolher outra base.

**Intervalos delimitados.** Um repositório com `--end-tag` obtém a versão do `X.Y.Z` central da tag final, e não da
política de incremento, porque seu intervalo descreve uma release que já existe. Por exemplo, `v0.1.0-beta.95` resulta
em `0.1.0`. `--version` ainda a substitui. Sem `--end-tag`, as regras acima se aplicam sem alteração.

**Mudança de comportamento:** a action e a CLI compartilham esta regra. Um repositório cujas tags alcançáveis incluem
um pré-lançamento agora recebe um intervalo e uma versão diferentes dos que as releases anteriores desta action davam.
Repositórios cujas únicas tags de release são estáveis não são afetados.

## Vocabulário do Conventional Commit e seções

Cada commit cai na primeira seção cuja regra ele atende. Seções vazias são omitidas, e os commits mantêm a ordem do git, do mais recente para o mais antigo.

| Seção | Corresponde a |
| --- | --- |
| Breaking Changes | Qualquer commit com `!` após o tipo ou o escopo, ou com um rodapé `BREAKING CHANGE:` ou `BREAKING-CHANGE:`. |
| Features | `feat` |
| Fixes | `fix` |
| Performance | `perf` |
| Documentation | `docs` |
| Maintenance | `build`, `ci`, `chore`, `refactor`, `revert`, `style`, `test` |
| Other Changes | Qualquer outro tipo, incluindo assuntos que não seguem o formato do Conventional Commits. |

Cada entrada é renderizada como `- **scope:** description ([`short-sha`](commit-url))`. O prefixo de escopo é omitido quando o commit não tem escopo.

### Deixar um commit fora das notas

Um commit cujo **assunto** (sua linha de título) contém `skip-release-notes` fica fora das notas da release. A correspondência
é uma substring sem diferenciar maiúsculas, por exemplo `docs: reword intro (skip-release-notes)`. O marcador está sempre ativo; nenhuma entrada,
flag ou configuração o liga ou desliga. Só o assunto é inspecionado, então um corpo ou rodapé que mencione a frase
não esconde um commit.

Um commit ignorado é tratado como se não estivesse no intervalo:

- Ele não é renderizado e não conta para o limite de entradas, para o rodapé `Showing N of M commits` nem para o `commitCount` do JSON.
- Ele não altera a versão. Um `feat:` ignorado não causa um incremento secundário; a versão é derivada como se o commit não existisse.
- Quando todos os commits do intervalo são ignorados, as notas mostram `_No changes yet._`.

## Limite de entradas

O corpo de uma release renderiza no máximo **100 entradas de commit**. Os títulos de seção, o rodapé e o texto de um intervalo vazio não contam. Um intervalo com 100 commits candidatos ou menos renderiza todos os commits.

Para cada repositório, a CLI informa quantos commits candidatos existem e quantas entradas foram renderizadas, de modo que um changelog truncado nunca passe despercebido. O limite em si não muda.

Cada candidato recebe um nível de prioridade pelo tipo do Conventional Commit. Vale a primeira regra que corresponder.

| Nível | Corresponde a |
| --- | --- |
| 1 | Mudanças incompatíveis de qualquer tipo, e `feat` |
| 2 | `fix`, `perf` |
| 3 | `refactor`, `revert`, e qualquer commit com escopo `security` (sem diferenciar maiúsculas). `fix(security)` permanece no nível 2. |
| 4 | `build`, `chore`, `ci`, `docs`, `style`, `test`, e assuntos que não seguem o formato Conventional Commits |

Acima de 100 candidatos, commits são omitidos do nível mais baixo para cima, até restarem 100:

1. Nível 4 antes do nível 3, nível 3 antes do nível 2, e nível 2 antes do nível 1.
2. Dentro do nível 1, `feat` antes das mudanças incompatíveis.
3. Sem escopo antes de com escopo.
4. Mais antigos antes de mais recentes.

Para tirar um commit `chore`, `ci` ou `docs` relevante para segurança do nível 4, dê a ele o escopo `security`, por exemplo `chore(security): rotate signing key`.

Quando algum commit é omitido, o corpo termina com um rodapé como `_Showing 100 of 170 commits._ [Full changelog](https://github.com/owner/repo/compare/v1.3.0...<sha>)`. O link aponta para a visualização de comparação desde a tag base, que pode ser uma tag estável ou de pré-lançamento, até `HEAD`, ou para a lista de commits se não houver tag de release.

O limite afeta apenas o corpo renderizado. A versão continua sendo derivada de todos os commits candidatos, incluindo os omitidos.

## Política de tags

- Cada release desta action recebe uma tag `vX.Y.Z` imutável.
- A tag de versão principal móvel `v1` aponta para a release `1.x.y` mais recente.
- Os consumidores fixam `@v1` para receber correções compatíveis. Para reprodutibilidade total, fixe um `@vX.Y.Z` exato.

A criação dessas tags faz parte do processo de release da própria action, não do workflow de um consumidor.

## O que a action não faz

- Não publica release. Não há entrada `publish` nem `draft: false`, e ela nunca executa uma operação que mude um rascunho para publicado.
- Não cria nem move tags do git. O rascunho aponta para o commit `HEAD` do checkout.
- Não exclui rascunhos. Quando existem vários, ela edita o primeiro que o GitHub retorna, então quem mantém vários rascunhos precisa limpá-los manualmente.

## Pré-visualização local com a CLI

O mesmo motor roda na sua máquina como `hagi-release-drafter`, para que você possa pré-visualizar a versão e as
notas da release antes de lançá-la. A CLI só lê o histórico do git. Ela nunca publica, nunca chama a API do
GitHub e não precisa de token. Suas únicas gravações vão para stdout, stderr, o arquivo de `--output` e o cache de URLs.

### Execução e instalação

A CLI precisa do Node.js 24 ou posterior e do git. A partir de um clone deste repositório, compile a CLI uma vez:

```bash
pnpm install
pnpm run build
node dist/cli.js --help
```

Para colocar o comando no seu `PATH`, empacote o pacote e instale o tarball:

```bash
npm pack
npm install -g ./hagicode-hagi-release-drafter-0.1.0.tgz
hagi-release-drafter --help
```

### Subcomandos e entradas de repositório

| Comando | Imprime |
| --- | --- |
| `hagi-release-drafter version` | A próxima versão estável, por exemplo `1.4.0`. |
| `hagi-release-drafter notes` | O corpo da release. Para um único repositório na saída padrão, é idêntico byte a byte ao arquivo de notas da action. |

Sem nenhuma entrada, o diretório atual é usado quando for uma árvore de trabalho do git. Caso contrário, informe uma ou
mais entradas, como `--repo <input>` (repetível) ou como argumentos posicionais. Uma entrada é um caminho local para uma
árvore de trabalho do git, ou uma URL HTTPS do `github.com`, com ou sem o sufixo `.git`. As entradas são processadas
em ordem, um repositório por vez.

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
| `--repo <input>` | Uma entrada de repositório. Repetível. |
| `--layout <name>` | `per-repo` (padrão) ou `merged`. Altera apenas o relatório em Markdown. |
| `--format <name>` | `markdown` (padrão) ou `json`. |
| `--output <file>` | Grava o resultado em um arquivo. O stdout fica vazio. |
| `--version <X.Y.Z>` | Usa esta versão estável no lugar da derivada. Aceito para um único repositório. |
| `--github-repository <owner/name>` | A identidade para os links de commit. Vale para todas as entradas e substitui o remoto `origin`. |
| `--start-tag <input>=<tag>` | Inicia o intervalo de um repositório nesta tag de release em vez da mais recente. `<input>` deve corresponder exatamente a um repositório como informado, por exemplo `./web`, então `web` e `./web` são entradas diferentes. A tag deve existir e ser alcançável a partir do `HEAD` desse repositório. Repetível, uma por repositório. |
| `--end-tag <input>=<tag>` | Encerra o intervalo de um repositório nesta tag de release, por exemplo `v0.1.0-beta.95`, em vez de `HEAD`. Valem as mesmas regras do `--start-tag`, e a tag deve existir e ser alcançável a partir do `HEAD` desse repositório. Sem `--start-tag`, o início é a tag de release mais recente abaixo do fim. A versão passa a ser o `X.Y.Z` central da tag, a menos que `--version` seja informado. Repetível, uma por repositório. |
| `--cache-dir <dir>` | A raiz do cache para clones de URL. Veja abaixo. |
| `--fail-fast` | Para após o primeiro repositório que falhar. |
| `-h`, `--help` | Mostra o uso. |

### Layouts e formatos

- **`per-repo`** (padrão) começa com uma tabela-resumo: repositório, status, versão, última tag, número de commits
  e número de entradas renderizadas. O número de commits é o de todos os commits candidatos, e o número renderizado é o de entradas que
  as notas mostram. Em seguida, cada repositório recebe um bloco `###` cujas seções ficam em `####`. Um repositório
  com falha tem versão vazia e um bloco que informa o motivo.
- **`merged`** gera uma única seção `## Changes`. Suas seções reúnem as entradas de todos os repositórios
  bem-sucedidos, cada uma rotulada com o nome do seu repositório. Cada repositório é reduzido a cem entradas antes da combinação.
  Um repositório truncado recebe uma linha como `_hagicode-core: showing 100 of 1324 commits._` antes da primeira
  seção.
- **`--format json`** imprime um objeto com um array `repositories` na ordem das entradas. Cada linha tem `input`,
  `name` e `status`. As linhas bem-sucedidas acrescentam `version`, `lastTag`, `lastTagSource` (`pinned` ou `auto`),
  `endTag` (a tag final de um intervalo delimitado, caso contrário `null`), `commitCount` (o número de candidatos), `renderedCount` (as entradas em `notes`), `truncated` e `notes`.
  As linhas com falha acrescentam `error`. O JSON sempre usa a forma por repositório, então `--layout` não o altera.

### Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Todos os repositórios foram bem-sucedidos. |
| `1` | Pelo menos um repositório falhou. O motivo vai para o stderr e para o relatório. Um único repositório com falha não imprime nada no stdout. Uma fixação `--start-tag` ausente ou inalcançável faz falhar apenas o seu próprio repositório. Um `--end-tag` ausente ou não alcançável a partir de `HEAD`, ou uma tag inicial que não é ancestral da sua tag final, também faz falhar apenas o seu próprio repositório. |
| `2` | Erro de uso, e nada foi calculado. Inclui subcomando ou flag desconhecido, versão, layout ou formato inválidos, entrada rejeitada, entrada duplicada, `--version` com várias entradas, e um valor `--start-tag` ou `--end-tag` malformado, que não seja de release, duplicado ou desconhecido. |

### Local do cache

Uma entrada URL é clonada com o histórico completo e todas as tags em `<root>/repos/<owner>/<name>`. A raiz é
`--cache-dir` quando informado; caso contrário, `$XDG_CACHE_HOME/hagi-release-drafter`; e se não houver,
`~/.cache/hagi-release-drafter`. Execuções posteriores buscam tags e histórico no mesmo clone. Nada é removido
automaticamente, então apague o diretório de um clone para recuperar espaço. Repositórios privados usam as credenciais do git que
você já tem. Uma URL que contenha nome de usuário ou senha é rejeitada.

### O que a CLI não faz

- Não publica, cria nem edita uma release, e não chama a API do GitHub. Não lê nenhum token,
  e `GH_TOKEN` e `GITHUB_TOKEN` não têm nenhum efeito.
- Não altera nenhum repositório local que você informar. Refs, tags e a árvore de trabalho permanecem como estavam.
- A action não usa a CLI. Ela continua executando `scripts/release-notes.ts` diretamente no Node.js 24, então
  não precisa de etapa de build. O pacote npm inclui o `dist/cli.js` compilado, gerado a partir das mesmas fontes.

## Requisitos do runner

- Os runners hospedados pelo GitHub incluem `gh` e `git`. Em um runner auto-hospedado, instale a GitHub CLI.
- A action instala o Node.js 24 por conta própria, por meio do `actions/setup-node`.

## Licença

Ainda não definida. Uma licença precisa ser escolhida antes de este repositório ser publicado.
