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

Uma GitHub Action composta que cria o rascunho da próxima versão estável `vX.Y.Z` a partir dos [Conventional Commits](https://www.conventionalcommits.org/) feitos desde a última tag estável. Ela cria um rascunho de release no GitHub ou atualiza um rascunho existente, e **nunca publica**. Publicar o rascunho continua sendo uma etapa manual na interface do GitHub.

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

1. A base é a tag `vX.Y.Z` estável mais recente alcançável a partir de `HEAD`. Tags de pré-lançamento, como `v1.3.0-beta.1`, e tags que não seguem semver são ignoradas.
2. Uma mudança incompatível incrementa a versão principal ou, enquanto a principal for `0`, a versão secundária.
3. Um commit `feat` incrementa a versão secundária e zera o patch.
4. Qualquer outro conjunto de commits incrementa a versão de patch.
5. Sem nenhuma tag estável, a versão é `0.1.0`.
6. A entrada `version` substitui a versão derivada. Os commits nas notas não mudam.

As notas sempre cobrem os commits posteriores à tag estável mais recente.

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

## Política de tags

- Cada release desta action recebe uma tag `vX.Y.Z` imutável.
- A tag de versão principal móvel `v1` aponta para a release `1.x.y` mais recente.
- Os consumidores fixam `@v1` para receber correções compatíveis. Para reprodutibilidade total, fixe um `@vX.Y.Z` exato.

A criação dessas tags faz parte do processo de release da própria action, não do workflow de um consumidor.

## O que a action não faz

- Não publica release. Não há entrada `publish` nem `draft: false`, e ela nunca executa uma operação que mude um rascunho para publicado.
- Não cria nem move tags do git. O rascunho aponta para o commit `HEAD` do checkout.
- Não exclui rascunhos. Quando existem vários, ela edita o primeiro que o GitHub retorna, então quem mantém vários rascunhos precisa limpá-los manualmente.

## Requisitos do runner

- Os runners hospedados pelo GitHub incluem `gh` e `git`. Em um runner auto-hospedado, instale a GitHub CLI.
- A action instala o Node.js 24 por conta própria, por meio do `actions/setup-node`.

## Desenvolvimento

```bash
npm ci
npm test
```

Este repositório cria os próprios rascunhos de release com a própria action: `.github/workflows/release-draft.yml` executa `uses: ./` a cada push para `main`. Ele cria ou atualiza um rascunho e nunca publica.

Os testes unitários cobrem a lógica portada das notas de release, um teste do script de rascunho com um `gh` simulado (stub) e um teste de contrato do `action.yml`. A CI também executa um autoteste: constrói `test/fixtures/make-fixture-repo.sh`, executa a action contra esse repositório com um token somente leitura e um `gh` simulado, e verifica a versão, a tag e os títulos das seções.

## Licença

Ainda não definida. Uma licença precisa ser escolhida antes de este repositório ser publicado.
