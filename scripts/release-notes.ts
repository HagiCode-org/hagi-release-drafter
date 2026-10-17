import { execFileSync } from 'node:child_process';

// Dependency-free on purpose: this file is copied unchanged into other repositories.

/** One commit as read from `git log`. `body` is the full commit body, possibly empty. */
export interface RawCommit {
  sha: string;
  subject: string;
  body?: string;
}

/** A commit after parsing. `type` is any lowercase word, or null when the subject is not Conventional. */
export interface ParsedCommit {
  sha: string;
  type: string | null;
  scope: string | null;
  description: string;
  breaking: boolean;
}

/** Release note section titles, in display order. */
export type SectionTitle =
  | 'Breaking Changes'
  | 'Features'
  | 'Fixes'
  | 'Performance'
  | 'Documentation'
  | 'Maintenance'
  | 'Other Changes';

/** Commits that rendered under one section title. */
export interface CommitGroup {
  title: SectionTitle;
  commits: ParsedCommit[];
}

/** Priority tier used when pruning: 1 is kept longest, 4 is omitted first. */
export type Tier = 1 | 2 | 3 | 4;

/** Result of pruning: `kept` in input order, `omitted` in input order. */
export interface PruneResult {
  kept: ParsedCommit[];
  omitted: ParsedCommit[];
}

/**
 * Options for the release body. `total` is the full commit count before pruning, used by the footer.
 * `level` is the heading depth of the `Changes` title; section titles sit one level deeper. Default 2.
 */
export interface RenderOptions {
  total?: number;
  lastTag?: string | null;
  headSha?: string;
  level?: number;
}

/** Options for a block of sections. `level` is the depth of each section title; `label` prefixes each entry. */
export interface SectionOptions {
  level?: number;
  label?: string;
}

/** Inputs for resolving one repository. `versionOverride` is a bare stable `X.Y.Z` that replaces the derived version. */
export interface ReleaseOptions {
  cwd: string;
  versionOverride?: string;
  repository?: string;
}

/** The release derived for one repository. `commits` is the full range; `kept` is after pruning. */
export interface ResolvedRelease {
  version: string;
  lastTag: string | null;
  headSha: string;
  total: number;
  commits: ParsedCommit[];
  kept: ParsedCommit[];
  notes: string;
}

/** A stable release tag and its bare version, for example `v1.4.0` and `1.4.0`. */
export interface TagVersion {
  tag: string;
  version: string;
}

interface SectionRule {
  title: SectionTitle;
  matches: (commit: ParsedCommit) => boolean;
}

interface Candidate {
  commit: ParsedCommit;
  index: number;
}

/** Bare X.Y.Z from a stable vX.Y.Z tag; throws for anything else. */
export function stableVersion(tag: string): string {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`Expected a stable release tag vX.Y.Z, received: ${tag}`);
  return match.slice(1).join('.');
}

/** Numeric X.Y.Z comparison for sorting. */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Release note sections, in display order. A commit lands in the first section that matches its type. */
const SECTIONS = [
  { title: 'Breaking Changes', matches: (commit) => commit.breaking },
  { title: 'Features', matches: (commit) => commit.type === 'feat' },
  { title: 'Fixes', matches: (commit) => commit.type === 'fix' },
  { title: 'Performance', matches: (commit) => commit.type === 'perf' },
  { title: 'Documentation', matches: (commit) => commit.type === 'docs' },
  {
    title: 'Maintenance',
    matches: (commit) => commit.type !== null && ['build', 'ci', 'chore', 'refactor', 'revert', 'style', 'test'].includes(commit.type),
  },
  { title: 'Other Changes', matches: () => true },
] satisfies SectionRule[];

/** Section titles in display order, for callers that merge sections across repositories. */
export const SECTION_TITLES: readonly SectionTitle[] = SECTIONS.map(({ title }) => title);

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>\S.*)$/;

/** Parses one commit into a Conventional Commits shape; non-conventional subjects keep `type: null`. */
export function parseCommit({ sha, subject, body = '' }: RawCommit): ParsedCommit {
  const match = HEADER.exec(subject.trim());
  const breakingFooter = /^BREAKING[ -]CHANGE:/m.test(body);
  if (!match?.groups) return { sha, type: null, scope: null, description: subject.trim(), breaking: breakingFooter };
  const { type, scope = null, bang, description } = match.groups;
  return { sha, type, scope, description: description.trim(), breaking: Boolean(bang) || breakingFooter };
}

/** Groups parsed commits by section, dropping empty sections and keeping git's newest-first order. */
export function groupCommits(commits: ParsedCommit[]): CommitGroup[] {
  const groups: CommitGroup[] = SECTIONS.map(({ title }) => ({ title, commits: [] }));
  for (const commit of commits) {
    groups[SECTIONS.findIndex(({ matches }) => matches(commit))].commits.push(commit);
  }
  return groups.filter(({ commits: entries }) => entries.length > 0);
}

/**
 * Picks the next stable version: a breaking change bumps the major (the minor while still 0.x),
 * a feature bumps the minor, anything else bumps the patch.
 */
export function bumpVersion(lastVersion: string, commits: ParsedCommit[]): string {
  const [major, minor, patch] = lastVersion.split('.').map(Number);
  if (commits.some((commit) => commit.breaking)) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (commits.some((commit) => commit.type === 'feat')) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Priority tier of a commit, first matching rule wins: 1 breaking or `feat`; 2 `fix` or `perf`;
 * 3 `refactor`, `revert`, or scope `security`; 4 everything else, including untyped subjects.
 */
export function tierOf(commit: ParsedCommit): Tier {
  if (commit.breaking || commit.type === 'feat') return 1;
  if (commit.type === 'fix' || commit.type === 'perf') return 2;
  if (commit.type === 'refactor' || commit.type === 'revert' || commit.scope?.toLowerCase() === 'security') return 3;
  return 4;
}

/** Orders candidates so that the first element is omitted first. */
function omitFirst(a: Candidate, b: Candidate): number {
  return (tierOf(b.commit) - tierOf(a.commit))
    || (Number(a.commit.breaking) - Number(b.commit.breaking))
    || (Number(a.commit.scope !== null) - Number(b.commit.scope !== null))
    || (b.index - a.index);
}

/**
 * Keeps at most `ceiling` commits. Omits the lowest tier first; inside Tier 1 `feat` before breaking,
 * then unscoped before scoped, then older before newer. `kept` keeps the input order.
 */
export function pruneCommits(commits: ParsedCommit[], ceiling = 100): PruneResult {
  const excess = Math.max(0, commits.length - ceiling);
  const omittedIndexes = new Set(
    commits.map((commit, index): Candidate => ({ commit, index })).sort(omitFirst).slice(0, excess).map(({ index }) => index),
  );
  return {
    kept: commits.filter((_, index) => !omittedIndexes.has(index)),
    omitted: commits.filter((_, index) => omittedIndexes.has(index)),
  };
}

const DEFAULT_LEVEL = 2;

/**
 * Renders the release body. `repository` (owner/name) turns short SHAs into commit links.
 * `options.level` sets the depth of the `Changes` title, default 2; sections sit one level deeper.
 * When `options.total` exceeds the rendered count, a footer states the counts and links the changelog:
 * the compare view when `lastTag` is set, otherwise the commit list at `headSha`.
 */
export function renderNotes(commits: ParsedCommit[], repository?: string, options: RenderOptions = {}): string {
  const level = options.level ?? DEFAULT_LEVEL;
  const title = `${'#'.repeat(level)} Changes`;
  if (commits.length === 0) return `${title}\n\n_No changes yet._\n`;
  const sections = renderSections(commits, repository, { level: level + 1 });
  return `${title}\n\n${sections}\n${renderFooter(commits.length, options, repository)}`;
}

/**
 * The commit-count footer, empty when every commit was rendered. `shown` is the rendered count and `options.total`
 * the full count. The changelog link goes to the compare view when `options.lastTag` is set. `label` names the
 * repository in a merged report.
 */
export function renderFooter(shown: number, options: RenderOptions, repository?: string, label?: string): string {
  const prefix = label ? `${label}: ` : '';
  return (options.total ?? 0) > shown ? `\n_${prefix}Showing ${shown} of ${options.total} commits._${changelogLink(repository, options)}\n` : '';
}

/**
 * Renders the section titles and their entries, without the `Changes` title or footer.
 * `level` is the depth of each section title, default 3. `label` prefixes each entry as `**label:**`.
 */
export function renderSections(commits: ParsedCommit[], repository?: string, { level = DEFAULT_LEVEL + 1, label }: SectionOptions = {}): string {
  return groupCommits(commits)
    .map(({ title, commits: entries }) => `${'#'.repeat(level)} ${title}\n\n${entries.map((commit) => renderEntry(commit, repository, label)).join('\n')}`)
    .join('\n\n');
}

/** One release note bullet: optional label, scope, description, and a commit reference, linked when `repository` is set. */
export function renderEntry(commit: ParsedCommit, repository?: string, label?: string): string {
  const short = commit.sha.slice(0, 7);
  const reference = repository ? `[\`${short}\`](https://github.com/${repository}/commit/${commit.sha})` : `\`${short}\``;
  const prefix = label ? `**${label}:** ` : '';
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  return `- ${prefix}${scope}${commit.description} (${reference})`;
}

function changelogLink(repository: string | undefined, { lastTag, headSha }: RenderOptions): string {
  if (!repository) return '';
  const url = lastTag
    ? `https://github.com/${repository}/compare/${lastTag}...${headSha}`
    : `https://github.com/${repository}/commits/${headSha}`;
  return ` [Full changelog](${url})`;
}

/** Runs git in `cwd`. The working directory is a parameter, never process state, so several repositories can be read in one run. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Newest stable `vX.Y.Z` tag reachable from HEAD in `cwd`, or null when nothing was released yet. */
export function lastStableTag(cwd: string): TagVersion | null {
  const versions: TagVersion[] = git(cwd, 'tag', '--merged', 'HEAD', '--list', 'v*').split('\n').flatMap((tag) => {
    try {
      return [{ tag, version: stableVersion(tag) }];
    } catch {
      return [];
    }
  });
  versions.sort((a, b) => compareVersions(a.version, b.version));
  return versions.at(-1) ?? null;
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
 * Derives one repository's release: the last stable tag, the commits after it, the version, and the notes.
 * The action and the CLI both call this, so their output cannot diverge.
 */
export function resolveRelease({ cwd, versionOverride, repository }: ReleaseOptions): ResolvedRelease {
  const last = lastStableTag(cwd);
  const commits = readCommits(last?.tag, cwd);
  const headSha = git(cwd, 'rev-parse', 'HEAD').trim();
  const version = versionOverride ? stableVersion(`v${versionOverride}`) : last ? bumpVersion(last.version, commits) : '0.1.0';
  const { kept } = pruneCommits(commits);
  const lastTag = last?.tag ?? null;
  const notes = renderNotes(kept, repository, { total: commits.length, lastTag, headSha });
  return { version, lastTag, headSha, total: commits.length, commits, kept, notes };
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
