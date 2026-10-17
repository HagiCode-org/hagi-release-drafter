// Pure commit semantics: parsing Conventional Commits, grouping into sections, the version bump, and pruning. No I/O.

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

interface SectionRule {
  title: SectionTitle;
  matches: (commit: ParsedCommit) => boolean;
}

interface Candidate {
  commit: ParsedCommit;
  index: number;
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
