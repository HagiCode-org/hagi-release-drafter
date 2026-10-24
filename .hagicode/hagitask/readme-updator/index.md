---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
  - zh-Hant
  - ja-JP
  - ko-KR
  - de-DE
  - fr-FR
  - es-ES
  - pt-BR
  - ru-RU
sourceLanguage: en-US
style: product
---

# README requirements

## Product focus

- Present `hagi-release-drafter` as a composite GitHub Action, with a matching local CLI, that drafts the next stable `vX.Y.Z` release from Conventional Commits: it picks the version, groups commits into release-note sections and creates or updates a GitHub draft release.
- Address repository maintainers who add the action to a workflow, and people who preview a release with the CLI. This is a developer-facing product, so workflow usage, inputs, outputs and CLI commands are part of the product.
- State up front that the action drafts and never publishes, and lead with the benefit of automatic release notes.

## Required content

- Keep the usage example, inputs, outputs, permissions, checkout requirements, version selection, Conventional Commit vocabulary, entry limit, tagging policy, what the action does not do, local preview with the CLI and runner requirements, as the current README does.
- Keep the license statement consistent with the repository.
- Inputs and outputs must match `action.yml`.

## README languages

- Maintain `README.md` in English and one translation per listed locale. The existing files use the dot form `README.<locale>.md` (`README.zh-CN.md`, `README.zh-Hant.md`, `README.ja-JP.md`, `README.ko-KR.md`, `README.de-DE.md`, `README.fr-FR.md`, `README.es-ES.md`, `README.pt-BR.md`, `README.ru-RU.md`); keep those filenames and the language switcher at the top of each file.
- Keep every variant aligned in scope and meaning with the English file.

## Exclusions

- Exclude tokens, secret values, internal hosts, machine-specific paths and private links.
- Keep repository maintenance instructions out of the README: repository layout, internal architecture, CI, build internals and test workflow.
- Do not list features the repository does not show.
