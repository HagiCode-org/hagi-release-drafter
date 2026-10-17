// Pure release-tag semantics: which tags count as release tags, and their SemVer 2.0 precedence. No I/O.

/**
 * A release tag: `vX.Y.Z` or `vX.Y.Z-<prerelease>`. `core` is the bare `X.Y.Z`; `prerelease` holds the dot-separated
 * identifiers in order, for example `['beta', '97']`, and is empty for a stable tag.
 */
export interface ReleaseTag {
  tag: string;
  core: string;
  prerelease: string[];
}

// Core numbers have no leading zeros. The prerelease is checked identifier by identifier below. Build metadata
// (`+`) is outside the character class, so a tag with it does not match.
const RELEASE_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-([0-9A-Za-z.-]+))?$/;

/** A numeric identifier has no leading zeros; an alphanumeric one has at least one non-digit. */
function isValidIdentifier(identifier: string): boolean {
  if (/^\d+$/.test(identifier)) return /^(?:0|[1-9]\d*)$/.test(identifier);
  return /^[0-9A-Za-z-]+$/.test(identifier);
}

/** Parses a release tag, or returns null for anything outside the grammar: non-semver names, leading zeros, build metadata. */
export function parseReleaseTag(tag: string): ReleaseTag | null {
  const match = RELEASE_TAG.exec(tag);
  if (!match) return null;
  const [, core, prerelease] = match;
  const prereleaseIdentifiers = prerelease === undefined ? [] : prerelease.split('.');
  if (!prereleaseIdentifiers.every(isValidIdentifier)) return null;
  return { tag, core, prerelease: prereleaseIdentifiers };
}

/** Compares two numeric strings without leading zeros, exactly, even when they exceed the safe integer range. */
function compareNumeric(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function compareCore(left: string, right: string): number {
  const a = left.split('.');
  const b = right.split('.');
  for (let index = 0; index < 3; index++) {
    const difference = compareNumeric(a[index], b[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** SemVer 2.0 identifier order: numeric identifiers compare numerically, rank below alphanumeric ones, and alphanumeric ones compare lexically. */
function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return compareNumeric(left, right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Orders prerelease identifier lists. A stable release (empty list) ranks above any prerelease of the same core. */
function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return (left.length === 0 ? 1 : 0) - (right.length === 0 ? 1 : 0);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = compareIdentifier(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

/** SemVer 2.0 precedence: negative when `left` is lower, positive when higher, zero when equal. */
export function compareReleaseTags(left: ReleaseTag, right: ReleaseTag): number {
  return compareCore(left.core, right.core) || comparePrerelease(left.prerelease, right.prerelease);
}
