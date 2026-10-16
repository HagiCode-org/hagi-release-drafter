#!/usr/bin/env bash
# Creates the draft release for v$VERSION, or updates the existing draft.
# This script never publishes: it never passes a flag that turns a draft into a
# published release, and never changes a release from draft to published.
#
# Required environment: VERSION, TITLE_TEMPLATE, NOTES_FILE, GH_TOKEN,
# GITHUB_REPOSITORY, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY.
set -euo pipefail

: "${VERSION:?VERSION is required}"
: "${TITLE_TEMPLATE:?TITLE_TEMPLATE is required}"
: "${NOTES_FILE:?NOTES_FILE is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

export GH_TOKEN
export GH_REPO="$GITHUB_REPOSITORY"

tag="v$VERSION"
title="${TITLE_TEMPLATE//\{version\}/$VERSION}"
target="$(git rev-parse HEAD)"

# Page through every release. A single `gh release list` call stops at its limit and can
# miss an existing draft, which would then be duplicated. The listing is captured in full
# before taking the first draft: piping into `head` could close the pipe early and fail
# the run under pipefail.
drafts="$(gh api --paginate "repos/$GITHUB_REPOSITORY/releases" \
  --jq '.[] | select(.draft) | (.tag_name // empty)')"
draft_tag="${drafts%%$'\n'*}"

if [ -n "$draft_tag" ]; then
  echo "Updating draft release $draft_tag to $tag"
  gh release edit "$draft_tag" --tag "$tag" --title "$title" \
    --notes-file "$NOTES_FILE" --target "$target"
else
  echo "Creating draft release $tag"
  gh release create "$tag" --draft --title "$title" \
    --notes-file "$NOTES_FILE" --target "$target"
fi

# Read the URL back from GitHub. The stdout of gh is not a stable contract.
release_url="$(gh release view "$tag" --json url --jq .url)"

{
  echo "tag=$tag"
  echo "release-url=$release_url"
} >> "$GITHUB_OUTPUT"

echo "Draft release $tag (\"$title\") is ready from commits up to $target: $release_url" >> "$GITHUB_STEP_SUMMARY"
