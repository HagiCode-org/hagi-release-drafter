import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  groupCommits, renderEntry, renderFooter, renderSections, resolveRelease, SECTION_TITLES,
} from '../release-notes.ts';
import type { ResolvedRelease } from '../release-notes.ts';
import { assertFullHistory, ensureCachedClone, identityOf, parseIdentityFlag, redact, UsageError } from './repo-input.ts';
import type { RepositoryInput } from './repo-input.ts';

// Report layer: resolves several repositories one after another and keeps one row per input, in input order.
// A failure in one repository is captured in its own row and does not change the others.

export interface RunOptions {
  /** The `--cache-dir` root for URL clones. */
  cacheDir?: string;
  /** Stop after the first failed row. */
  failFast?: boolean;
  /** The `--github-repository` identity, applied to every input. */
  githubRepository?: string;
  /** The `--version` override. Only valid for a single repository. */
  versionOverride?: string;
}

export interface OkRow {
  status: 'ok';
  input: string;
  name: string;
  /** The identity used for commit links, or null when there is none. */
  repository: string | null;
  release: ResolvedRelease;
}

export interface FailedRow {
  status: 'failed';
  input: string;
  name: string;
  error: string;
}

export type Row = OkRow | FailedRow;

/** Resolves each input in order and returns one row per processed input. Stops after the first failure with `failFast`. */
export function runRepositories(inputs: RepositoryInput[], options: RunOptions = {}): Row[] {
  assertNoDuplicates(inputs);
  if (options.versionOverride !== undefined && inputs.length > 1) {
    throw new UsageError('--version applies to one repository only. Give a single input, or let each version come from its own commits.');
  }
  if (options.githubRepository !== undefined) parseIdentityFlag(options.githubRepository);
  const rows: Row[] = [];
  for (const input of inputs) {
    const row = resolveRepository(input, options);
    rows.push(row);
    if (row.status === 'failed' && options.failFast) break;
  }
  return rows;
}

/**
 * The default layout: a summary table with one row per input, then one `###` block per input in input order.
 * Sections inside a block sit at `####`, one level below the single-repository `##` title plus one. A failed
 * input has an empty version and a block that states the reason.
 */
export function renderPerRepo(rows: Row[]): string {
  const blocks = rows.map((row) => (row.status === 'ok' ? okBlock(row) : `### ${row.name}\n\n**Failed:** ${row.error}\n`));
  return [renderSummary(rows), '', blocks.join('\n')].join('\n');
}

/**
 * The `merged` layout: the same summary table, then one `## Changes` title whose sections are shared by every
 * successful repository. Sections follow the single-repository display order. Each entry is labelled with its
 * repository, and entries keep the input order and then each repository's own commit order. Pruning happens per
 * repository before merging, so a pruned repository has its own footer.
 */
export function renderMerged(rows: Row[]): string {
  const ok = rows.filter((row): row is OkRow => row.status === 'ok');
  const failed = rows.filter((row): row is FailedRow => row.status === 'failed');
  const sections = SECTION_TITLES.flatMap((title) => {
    const entries = ok.flatMap(({ name, repository, release }) => (groupCommits(release.kept).find((group) => group.title === title)?.commits ?? [])
      .map((commit) => renderEntry(commit, repository ?? undefined, name)));
    return entries.length > 0 ? [`### ${title}\n\n${entries.join('\n')}`] : [];
  });
  const footers = ok.map(({ name, repository, release }) => renderFooter(release.kept.length, footerOptions(release), repository ?? undefined, name)).join('');
  const failures = failed.map((row) => `- **${row.name}:** ${row.error}`);
  return [
    renderSummary(rows),
    '',
    ...(failures.length > 0 ? ['**Failed:**', '', ...failures, ''] : []),
    '## Changes',
    '',
    sections.length > 0 ? sections.join('\n\n') : '_No changes yet._',
    footers,
  ].join('\n');
}

/** The summary table: one row per input in input order. Failed rows have an empty version and no commit count. */
export function renderSummary(rows: Row[]): string {
  const table = rows.map((row) => (row.status === 'ok'
    ? `| ${cell(row.name)} | ok | ${row.release.version} | ${row.release.lastTag ?? 'none'} | ${row.release.total} |`
    : `| ${cell(row.name)} | failed | | | |`));
  return [
    '| Repository | Status | Version | Last stable tag | Commits |',
    '| --- | --- | --- | --- | --- |',
    ...table,
  ].join('\n');
}

function footerOptions(release: ResolvedRelease): { total: number; lastTag: string | null; headSha: string } {
  return { total: release.total, lastTag: release.lastTag, headSha: release.headSha };
}

function okBlock(row: OkRow): string {
  const { release, repository, name } = row;
  if (release.kept.length === 0) return `### ${name}\n\n_No changes yet._\n`;
  const sections = renderSections(release.kept, repository ?? undefined, { level: 4 });
  const footer = renderFooter(release.kept.length, footerOptions(release), repository ?? undefined);
  return `### ${name}\n\n${sections}\n${footer}`;
}

/** Escapes a value for a Markdown table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * The JSON report. It always uses the per-repository shape, whatever the Markdown layout, so consumers parse one
 * structure. Rows keep input order. The output has no timestamps.
 */
export function toJson(rows: Row[]): string {
  const repositories = rows.map((row) => (row.status === 'ok'
    ? {
      input: row.input,
      name: row.name,
      status: 'ok',
      version: row.release.version,
      lastTag: row.release.lastTag,
      commitCount: row.release.total,
      notes: row.release.notes,
    }
    : {
      input: row.input,
      name: row.name,
      status: 'failed',
      error: row.error,
    }));
  return `${JSON.stringify({ repositories }, null, 2)}\n`;
}

/** Rejects two inputs that name the same repository: the same real path, or the same URL ignoring case. */
export function assertNoDuplicates(inputs: RepositoryInput[]): void {
  const seen = new Map<string, string>();
  for (const input of inputs) {
    const key = input.kind === 'url' ? input.url.toLowerCase() : realPathOf(input.path);
    const first = seen.get(key);
    if (first !== undefined) {
      throw new UsageError(`Duplicate repository input: ${input.input} names the same repository as ${first}.`);
    }
    seen.set(key, input.input);
  }
}

function resolveRepository(input: RepositoryInput, options: RunOptions): Row {
  const repository = identityOf(input, options.githubRepository);
  const name = repository ?? (input.kind === 'url' ? `${input.owner}/${input.name}` : basename(input.path));
  try {
    const cwd = input.kind === 'url' ? ensureCachedClone(input, { cacheDir: options.cacheDir }) : localCheckout(input.path);
    const release = resolveRelease({ cwd, versionOverride: options.versionOverride, repository: repository ?? undefined });
    return { status: 'ok', input: input.input, name, repository, release };
  } catch (error) {
    return { status: 'failed', input: input.input, name, error: reasonOf(error) };
  }
}

/** A local input must be an existing directory with full history; a shallow checkout would report 0.1.0 silently. */
function localCheckout(path: string): string {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error('The path is not an existing directory.');
  }
  assertFullHistory(path);
  return path;
}

function realPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** A short, redacted reason for a failed row: git's own stderr when there is one, otherwise the error message. */
function reasonOf(error: unknown): string {
  const stderr: unknown = (error as { stderr?: unknown }).stderr;
  const text = typeof stderr === 'string' ? stderr.trim() : Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : '';
  return redact(text || (error instanceof Error ? error.message : String(error))).slice(0, 500);
}
