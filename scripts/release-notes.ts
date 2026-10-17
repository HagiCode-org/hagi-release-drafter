import { execFileSync } from 'node:child_process';
import { bumpVersion, isSkippedFromReleaseNotes, parseCommit, pruneCommits } from './lib/commits.ts';
import type { ParsedCommit } from './lib/commits.ts';
import { renderNotes } from './lib/render.ts';
import { compareReleaseTags, parseReleaseTag } from './lib/release-tags.ts';
import type { ReleaseTag } from './lib/release-tags.ts';

// The action runs this file from its own checkout with no install step, so it and everything in lib/ import only
// node: built-ins and each other. Parsing and rendering live in lib/; this file reads git and resolves one release.
// It re-exports lib/commits.ts and lib/render.ts so that callers keep a single entry point.
export * from './lib/commits.ts';
export * from './lib/render.ts';

/**
 * Inputs for resolving one repository. `versionOverride` is a bare stable `X.Y.Z` that replaces the derived version.
 * `startTag` pins the base tag instead of the automatic choice; see `selectBaseTag`. `endTag` ends the range at a
 * release tag instead of HEAD; see `validateEndTag`.
 */
export interface ReleaseOptions {
  cwd: string;
  versionOverride?: string;
  repository?: string;
  startTag?: string;
  endTag?: string;
}

/**
 * The release derived for one repository. `commits` is the full range; `kept` is after pruning. `lastTagSource` says whether the base tag was pinned or selected automatically.
 * `endTag` is the end tag of a bounded range, or null when the range runs to HEAD.
 */
export interface ResolvedRelease {
  version: string;
  lastTag: string | null;
  lastTagSource: 'pinned' | 'auto';
  endTag: string | null;
  headSha: string;
  total: number;
  commits: ParsedCommit[];
  kept: ParsedCommit[];
  notes: string;
}

/** The base of a release range: its tag, the core `X.Y.Z` the version is derived from, and how it was chosen. */
export interface BaseTag {
  tag: string;
  core: string;
  source: 'pinned' | 'auto';
}

/** Bare X.Y.Z from a stable vX.Y.Z tag; throws for anything else. */
export function stableVersion(tag: string): string {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`Expected a stable release tag vX.Y.Z, received: ${tag}`);
  return match.slice(1).join('.');
}

/** Runs git in `cwd`. The working directory is a parameter, never process state, so several repositories can be read in one run. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** True when the git command succeeds. Silent, so a missing ref is an answer rather than an error on stderr. */
function gitSucceeds(cwd: string, ...args: string[]): boolean {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The commit a release tag names, with an annotated tag peeled to its commit. Callers pass a tag that exists. */
function commitOf(cwd: string, tag: string): string {
  return git(cwd, 'rev-parse', '--verify', `refs/tags/${tag}^{commit}`).trim();
}

/**
 * Checks the end tag of a bounded range before anything is read. It must be a release tag that exists in `cwd` and is
 * reachable from HEAD, so a bound cannot select commits from a history that HEAD does not contain. Each failure throws
 * an error naming the end tag, so only its repository fails. Returns the parsed tag, whose core is the bounded version.
 */
export function validateEndTag(cwd: string, endTag: string): ReleaseTag {
  const parsed = parseReleaseTag(endTag);
  if (!parsed) throw new Error(`End tag ${endTag} is not a release tag.`);
  if (!gitSucceeds(cwd, 'rev-parse', '--verify', '--quiet', `refs/tags/${endTag}`)) {
    throw new Error(`End tag ${endTag} does not exist in this repository.`);
  }
  if (!gitSucceeds(cwd, 'merge-base', '--is-ancestor', endTag, 'HEAD')) {
    throw new Error(`End tag ${endTag} is not reachable from HEAD.`);
  }
  return parsed;
}

/**
 * The base tag of the release range in `cwd`, which ends at `end` when one is given and at HEAD otherwise. Without
 * `pin`, the highest-precedence release tag reachable from that end, or null when there is none. Prereleases count, and
 * a stable tag ranks above its own prerelease. With an end, every tag on the end commit is excluded, because one that
 * is equal to the end would leave the range empty. With `pin`, that tag must exist and be reachable from HEAD. With an
 * end it must also be a proper ancestor of the end, so an equal or unrelated pin is refused. A pin that fails throws an
 * error naming the tag, so only that repository fails.
 */
export function selectBaseTag(cwd: string, pin?: string, end?: string): BaseTag | null {
  if (pin !== undefined) {
    const parsed = parseReleaseTag(pin);
    if (!parsed) throw new Error(`Pinned start tag ${pin} is not a release tag.`);
    if (!gitSucceeds(cwd, 'rev-parse', '--verify', '--quiet', `refs/tags/${pin}`)) {
      throw new Error(`Pinned start tag ${pin} does not exist in this repository.`);
    }
    if (!gitSucceeds(cwd, 'merge-base', '--is-ancestor', pin, 'HEAD')) {
      throw new Error(`Pinned start tag ${pin} is not reachable from HEAD.`);
    }
    if (end !== undefined) {
      if (commitOf(cwd, pin) === commitOf(cwd, end)) {
        throw new Error(`Pinned start tag ${pin} and end tag ${end} point at the same commit. The start tag must be an earlier release.`);
      }
      if (!gitSucceeds(cwd, 'merge-base', '--is-ancestor', pin, end)) {
        throw new Error(`Pinned start tag ${pin} is not an ancestor of end tag ${end}.`);
      }
    }
    return { tag: pin, core: parsed.core, source: 'pinned' };
  }
  // Only a bounded range drops the tags on its end commit. Unbounded, the candidates stay as they were: tags reachable from HEAD.
  const onEnd = end === undefined ? new Set<string>() : new Set(git(cwd, 'tag', '--points-at', commitOf(cwd, end), '--list', 'v*').split('\n'));
  const tags = git(cwd, 'tag', '--merged', end ?? 'HEAD', '--list', 'v*')
    .split('\n')
    .filter((name) => !onEnd.has(name))
    .flatMap((name) => parseReleaseTag(name) ?? []);
  if (tags.length === 0) return null;
  const newest = tags.reduce((best, tag) => (compareReleaseTags(tag, best) > 0 ? tag : best));
  return { tag: newest.tag, core: newest.core, source: 'auto' };
}

/**
 * Commits after `tag` up to `end` in `cwd`, newest first, with merge commits left out. Commits whose subject carries the
 * skip-release-notes marker are left out the same way, before parsing, so they are not counted anywhere.
 * `end` defaults to HEAD. Without a tag, the range is the whole history up to `end`.
 */
export function readCommits(tag: string | null | undefined, cwd: string, end = 'HEAD'): ParsedCommit[] {
  const range = tag ? [`${tag}..${end}`] : [end];
  return git(cwd, 'log', '--no-merges', '--pretty=format:%H%x1f%s%x1f%b%x1e', ...range)
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split('\x1f');
      return { sha, subject, body };
    })
    .filter(({ subject }) => !isSkippedFromReleaseNotes(subject))
    .map((raw) => parseCommit(raw));
}

/**
 * Derives one repository's release: the base tag, the commits after it, the version, and the notes.
 * Without `endTag` the range runs to HEAD, and the version comes from the base tag's core `X.Y.Z` with the bump policy;
 * with no release tag at all it is `0.1.0`. With `endTag` the range ends at that release tag, and the version is its
 * core `X.Y.Z`, because the range describes a release that already exists. `versionOverride` wins over both.
 * The action and the CLI both call this, so their output cannot diverge.
 */
export function resolveRelease({ cwd, versionOverride, repository, startTag, endTag }: ReleaseOptions): ResolvedRelease {
  const boundedEnd = endTag === undefined ? null : validateEndTag(cwd, endTag);
  const base = selectBaseTag(cwd, startTag, endTag);
  const commits = readCommits(base?.tag, cwd, endTag);
  const headSha = git(cwd, 'rev-parse', 'HEAD').trim();
  const version = versionOverride
    ? stableVersion(`v${versionOverride}`)
    : boundedEnd ? boundedEnd.core : base ? bumpVersion(base.core, commits) : '0.1.0';
  const { kept } = pruneCommits(commits);
  const lastTag = base?.tag ?? null;
  const notes = renderNotes(kept, repository, { total: commits.length, lastTag, headSha, endRef: endTag });
  return { version, lastTag, lastTagSource: base?.source ?? 'auto', endTag: endTag ?? null, headSha, total: commits.length, commits, kept, notes };
}

function main(): void {
  const [command] = process.argv.slice(2);
  if (command !== 'version' && command !== 'notes') {
    throw new Error('Usage: node scripts/release-notes.ts version|notes');
  }
  const release = resolveRelease({
    cwd: process.cwd(),
    // Only `version` honours RELEASE_VERSION, as the action always has.
    versionOverride: command === 'version' ? process.env.RELEASE_VERSION || undefined : undefined,
    repository: process.env.GITHUB_REPOSITORY,
  });
  process.stdout.write(command === 'version' ? release.version : release.notes);
}

if (process.argv[1]?.endsWith('release-notes.ts')) main();
