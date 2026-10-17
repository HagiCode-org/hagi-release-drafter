import { execFileSync } from 'node:child_process';
import { bumpVersion, parseCommit, pruneCommits } from './lib/commits.ts';
import type { ParsedCommit } from './lib/commits.ts';
import { renderNotes } from './lib/render.ts';
import { compareReleaseTags, parseReleaseTag } from './lib/release-tags.ts';

// The action runs this file from its own checkout with no install step, so it and everything in lib/ import only
// node: built-ins and each other. Parsing and rendering live in lib/; this file reads git and resolves one release.
// It re-exports lib/commits.ts and lib/render.ts so that callers keep a single entry point.
export * from './lib/commits.ts';
export * from './lib/render.ts';

/**
 * Inputs for resolving one repository. `versionOverride` is a bare stable `X.Y.Z` that replaces the derived version.
 * `startTag` pins the base tag instead of the automatic choice; see `selectBaseTag`.
 */
export interface ReleaseOptions {
  cwd: string;
  versionOverride?: string;
  repository?: string;
  startTag?: string;
}

/** The release derived for one repository. `commits` is the full range; `kept` is after pruning. `lastTagSource` says whether the base tag was pinned or selected automatically. */
export interface ResolvedRelease {
  version: string;
  lastTag: string | null;
  lastTagSource: 'pinned' | 'auto';
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

/**
 * The base tag of the release range in `cwd`. Without `pin`, the highest-precedence release tag reachable from HEAD,
 * or null when there is none. Prereleases count, and a stable tag ranks above its own prerelease. With `pin`, that tag,
 * which must exist and be reachable from HEAD. A pin that fails throws an error naming the tag, so only that repository fails.
 */
export function selectBaseTag(cwd: string, pin?: string): BaseTag | null {
  if (pin !== undefined) {
    const parsed = parseReleaseTag(pin);
    if (!parsed) throw new Error(`Pinned start tag ${pin} is not a release tag.`);
    if (!gitSucceeds(cwd, 'rev-parse', '--verify', '--quiet', `refs/tags/${pin}`)) {
      throw new Error(`Pinned start tag ${pin} does not exist in this repository.`);
    }
    if (!gitSucceeds(cwd, 'merge-base', '--is-ancestor', pin, 'HEAD')) {
      throw new Error(`Pinned start tag ${pin} is not reachable from HEAD.`);
    }
    return { tag: pin, core: parsed.core, source: 'pinned' };
  }
  const tags = git(cwd, 'tag', '--merged', 'HEAD', '--list', 'v*').split('\n').flatMap((name) => parseReleaseTag(name) ?? []);
  if (tags.length === 0) return null;
  const newest = tags.reduce((best, tag) => (compareReleaseTags(tag, best) > 0 ? tag : best));
  return { tag: newest.tag, core: newest.core, source: 'auto' };
}

/** Commits after `tag` up to HEAD in `cwd`, newest first, with merge commits left out. */
export function readCommits(tag: string | null | undefined, cwd: string): ParsedCommit[] {
  const range = tag ? [`${tag}..HEAD`] : ['HEAD'];
  return git(cwd, 'log', '--no-merges', '--pretty=format:%H%x1f%s%x1f%b%x1e', ...range)
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split('\x1f');
      return parseCommit({ sha, subject, body });
    });
}

/**
 * Derives one repository's release: the base tag, the commits after it, the version, and the notes.
 * The version comes from the base tag's core `X.Y.Z` with the bump policy; with no release tag at all it is `0.1.0`.
 * The action and the CLI both call this, so their output cannot diverge.
 */
export function resolveRelease({ cwd, versionOverride, repository, startTag }: ReleaseOptions): ResolvedRelease {
  const base = selectBaseTag(cwd, startTag);
  const commits = readCommits(base?.tag, cwd);
  const headSha = git(cwd, 'rev-parse', 'HEAD').trim();
  const version = versionOverride ? stableVersion(`v${versionOverride}`) : base ? bumpVersion(base.core, commits) : '0.1.0';
  const { kept } = pruneCommits(commits);
  const lastTag = base?.tag ?? null;
  const notes = renderNotes(kept, repository, { total: commits.length, lastTag, headSha });
  return { version, lastTag, lastTagSource: base?.source ?? 'auto', headSha, total: commits.length, commits, kept, notes };
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
