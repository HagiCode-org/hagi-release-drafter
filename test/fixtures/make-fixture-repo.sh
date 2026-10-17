#!/usr/bin/env bash
# Builds a throwaway git repository with known history for the self-test.
#
# Usage: make-fixture-repo.sh <directory> [default|prerelease-only]
#
# default (the main fixture). Release tags: v0.1.0-beta.97 on the initial commit, v0.1.0-beta.100 and v1.0.0 on the
# first feature, v1.1.0-beta.1 after the feature commits. The newest reachable release tag by SemVer precedence is
# v1.1.0-beta.1, whose core is 1.1.0. The one commit after it is breaking, so the version is 2.0.0.
#
# prerelease-only. The only release tag is v0.1.0-beta.97, on the first feature. The two commits after it are
# fix-only, so the base is v0.1.0-beta.97, the candidates are two, and the version is 0.1.1.
set -euo pipefail

dir="${1:?usage: make-fixture-repo.sh <directory> [default|prerelease-only]}"
mode="${2:-default}"
case "$mode" in
  default | prerelease-only) ;;
  *) echo "unknown fixture mode: $mode" >&2; exit 2 ;;
esac
mkdir -p "$dir"
cd "$dir"

git init --quiet --initial-branch=main
commit() {
  git -c user.name=fixture -c user.email=fixture@example.invalid commit --quiet --allow-empty -m "$1"
}

commit "chore: initial commit"
commit "feat: first feature"

if [ "$mode" = prerelease-only ]; then
  git tag v0.1.0-beta.97
  commit "fix(core): repair parser"
  commit "docs: update readme"
  exit 0
fi

git tag v0.1.0-beta.97 HEAD~1
git tag v0.1.0-beta.100
git tag v1.0.0
commit "fix(core): repair parser"
commit "docs: update readme"
commit "feat(cli): add flag"
git tag v1.1.0-beta.1
commit "fix(core)!: drop legacy option"
