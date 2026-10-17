// Pure Markdown rendering of the release body. No I/O.
import { groupCommits } from './commits.ts';
import type { ParsedCommit } from './commits.ts';

/**
 * Options for the release body. `total` is the full commit count before pruning, used by the footer.
 * `level` is the heading depth of the `Changes` title; section titles sit one level deeper. Default 2.
 */
export interface RenderOptions {
  total?: number;
  lastTag?: string | null;
  headSha?: string;
  /** The end tag of a bounded range. The changelog link ends at it instead of at `headSha`. */
  endRef?: string;
  level?: number;
}

/** Options for a block of sections. `level` is the depth of each section title; `label` prefixes each entry. */
export interface SectionOptions {
  level?: number;
  label?: string;
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

function changelogLink(repository: string | undefined, { lastTag, headSha, endRef }: RenderOptions): string {
  if (!repository) return '';
  const end = endRef ?? headSha;
  const url = lastTag
    ? `https://github.com/${repository}/compare/${lastTag}...${end}`
    : `https://github.com/${repository}/commits/${end}`;
  return ` [Full changelog](${url})`;
}
