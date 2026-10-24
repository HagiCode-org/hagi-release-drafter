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
style: technical
---

# README requirements

## Audience and focus

- Address maintainers who add the `hagi-release-drafter` composite GitHub Action to a repository to draft the next stable release from Conventional Commits.
- State up front that the action drafts and never publishes.

## Required content

- Keep usage, inputs, outputs, permissions, checkout requirements, version selection, Conventional Commit vocabulary, entry limit, tagging policy, what the action does not do, local preview, runner requirements, development and license, as the current README does.
- Inputs and outputs must match `action.yml`.

## README languages

- Maintain `README.md` in English and one translation per listed locale. The existing files use the dot form `README.<locale>.md` (`README.zh-CN.md`, `README.zh-Hant.md`, `README.ja-JP.md`, `README.ko-KR.md`, `README.de-DE.md`, `README.fr-FR.md`, `README.es-ES.md`, `README.pt-BR.md`, `README.ru-RU.md`); keep those filenames and the language switcher at the top of each file.
- Keep every variant aligned in scope and meaning with the English file.

## Exclusions

- Exclude tokens, secret values, internal hosts, machine-specific paths and private links.
