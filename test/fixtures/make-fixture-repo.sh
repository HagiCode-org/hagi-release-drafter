#!/usr/bin/env bash
# Builds a throwaway git repository with known history for the self-test.
#
# Expected derived version: 2.0.0. The newest stable tag is v1.0.0; the commits after it
# include a breaking change, and the major version is at least 1, so the major bumps.
# The pre-release tag v1.1.0-beta.1 must be ignored by the stable lookup.
#
# Usage: make-fixture-repo.sh <directory>
set -euo pipefail

dir="${1:?usage: make-fixture-repo.sh <directory>}"
mkdir -p "$dir"
cd "$dir"

git init --quiet --initial-branch=main
commit() {
  git -c user.name=fixture -c user.email=fixture@example.invalid commit --quiet --allow-empty -m "$1"
}

commit "chore: initial commit"
commit "feat: first feature"
git tag v1.0.0
commit "fix(core): repair parser"
commit "docs: update readme"
commit "feat(cli): add flag"
git tag v1.1.0-beta.1
commit "fix(core)!: drop legacy option"
