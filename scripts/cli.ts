#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderMerged, renderPerRepo, renderSummary, runRepositories, toJson } from './lib/aggregate.ts';
import type { Row } from './lib/aggregate.ts';
import { parseReleaseTag } from './lib/release-tags.ts';
import { classifyInput, parseIdentityFlag, UsageError } from './lib/repo-input.ts';
import type { RepositoryInput } from './lib/repo-input.ts';

// CLI layer: argv, subcommands, exit codes, and output routing. It holds no release rules. Those live in
// release-notes.ts, which the action also runs. Exit codes: 0 success, 1 a repository failed, 2 usage error.

export const USAGE = `Usage: hagi-release-drafter <version|notes> [options] [repository...]

Previews the version and release notes that the hagi-release-drafter action would produce.
Reads git history only. It never publishes, never calls the GitHub API, and needs no token.

Subcommands:
  version                  Print the next stable version.
  notes                    Print the release notes body.

Repositories (default: the current directory when it is a git working tree):
  --repo <input>           A local git working tree, or an HTTPS github.com URL. Repeatable.
  [repository...]          The same inputs as positional arguments.

Options:
  --layout <name>          per-repo (default) or merged. Affects the Markdown report only.
  --format <name>          markdown (default) or json. JSON always uses the per-repository shape.
  --output <file>          Write the result to this file instead of stdout.
  --version <X.Y.Z>        Use this stable version instead of the derived one. One repository only.
  --github-repository <owner/name>
                           Identity for commit links, applied to every input. Overrides the origin remote.
  --start-tag <input>=<tag>
                           Start one repository's range at this release tag, such as v0.1.0-beta.97, instead of the
                           newest one. <input> must match a repository exactly as given. The tag must be reachable
                           from that repository's HEAD. Repeatable.
  --end-tag <input>=<tag>
                           End one repository's range at this release tag, such as v0.1.0-beta.95, instead of HEAD.
                           With --start-tag the range is start..end. Without it, the start is the newest release tag
                           below the end. The version is then the tag's X.Y.Z core, unless --version is given. Same
                           rules as --start-tag, and the tag must be reachable from that repository's HEAD. Repeatable.
  --cache-dir <dir>        Cache root for URL clones. Default: $XDG_CACHE_HOME/hagi-release-drafter,
                           then ~/.cache/hagi-release-drafter.
  --fail-fast              Stop after the first failed repository.
  -h, --help               Show this help.

Exit codes:
  0  every repository succeeded
  1  at least one repository failed; the reason is on stderr and in the report
  2  usage error; nothing was computed

Node.js 24 or later and git are required.
`;

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LAYOUTS = ['per-repo', 'merged'] as const;
const FORMATS = ['markdown', 'json'] as const;

/** True for Node.js 24 and later. The action and the package both target Node.js 24. */
export function isSupportedNode(version: string): boolean {
  const major = Number(version.split('.')[0]);
  return Number.isInteger(major) && major >= 24;
}

/** Runs the CLI with `argv` (without the node and script entries) and returns the exit code. Writes stdout and stderr itself. */
export function run(argv: readonly string[], cwd: string = process.cwd()): number {
  if (!isSupportedNode(process.versions.node)) {
    process.stderr.write(`hagi-release-drafter requires Node.js 24 or later. This is Node.js ${process.versions.node}.\n`);
    return 2;
  }
  try {
    return execute(argv, cwd);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`hagi-release-drafter: ${error.message}\nRun hagi-release-drafter --help for usage.\n`);
      return 2;
    }
    process.stderr.write(`hagi-release-drafter: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function execute(argv: readonly string[], cwd: string): number {
  const { values, positionals } = parse(argv);
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const [subcommand, ...rest] = positionals;
  if (subcommand === undefined) throw new UsageError('Missing subcommand. Use version or notes.');
  if (subcommand !== 'version' && subcommand !== 'notes') {
    throw new UsageError(`Unknown subcommand: ${subcommand}. Use version or notes.`);
  }
  const layout = values.layout ?? 'per-repo';
  if (!(LAYOUTS as readonly string[]).includes(layout)) throw new UsageError(`Unknown layout ${layout}. Use per-repo or merged.`);
  const format = values.format ?? 'markdown';
  if (!(FORMATS as readonly string[]).includes(format)) throw new UsageError(`Unknown format ${format}. Use markdown or json.`);
  if (values.version !== undefined && !STABLE.test(values.version)) {
    throw new UsageError(`--version must be a stable X.Y.Z, for example 2.0.0. Received: ${values.version}`);
  }
  if (values['github-repository'] !== undefined) parseIdentityFlag(values['github-repository']);

  // Check every input, pin, and end tag before any repository is processed, so a bad argument stops the run with exit code 2.
  const inputArgs = inputArguments(values.repo ?? [], rest, cwd);
  const startTags = parseStartTags(values['start-tag'] ?? [], inputArgs);
  const endTags = parseEndTags(values['end-tag'] ?? [], inputArgs);
  const inputs: RepositoryInput[] = inputArgs.map((input) => classifyInput(input, cwd));
  const rows = runRepositories(inputs, {
    cacheDir: values['cache-dir'],
    failFast: values['fail-fast'],
    githubRepository: values['github-repository'],
    versionOverride: values.version,
    startTags,
    endTags,
  });

  for (const row of rows) {
    if (row.status === 'failed') process.stderr.write(`hagi-release-drafter: ${row.name}: ${row.error}\n`);
  }
  const report = render(rows, { subcommand, format, layout });
  if (values.output !== undefined) {
    if (report !== '') writeFileSync(resolve(cwd, values.output), report);
  } else {
    process.stdout.write(report);
  }
  return rows.some((row) => row.status === 'failed') ? 1 : 0;
}

function parse(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        repo: { type: 'string', multiple: true },
        layout: { type: 'string' },
        format: { type: 'string' },
        output: { type: 'string' },
        version: { type: 'string' },
        'github-repository': { type: 'string' },
        'start-tag': { type: 'string', multiple: true },
        'end-tag': { type: 'string', multiple: true },
        'cache-dir': { type: 'string' },
        'fail-fast': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** The `--start-tag <input>=<tag>` pins, keyed by the input exactly as given. See `parseTagPins`. */
export function parseStartTags(pins: readonly string[], inputs: readonly string[]): Map<string, string> {
  return parseTagPins('--start-tag', pins, inputs);
}

/** The `--end-tag <input>=<tag>` bounds, keyed by the input exactly as given. They follow the same rules as the start pins. */
export function parseEndTags(bounds: readonly string[], inputs: readonly string[]): Map<string, string> {
  return parseTagPins('--end-tag', bounds, inputs);
}

/**
 * The `<flag> <input>=<tag>` values, keyed by the input exactly as given. The tag follows the last `=`, because a release
 * tag never contains one. Each rule is checked before any repository is read: the `=` separator, the release-tag grammar,
 * at most one value per input, and an input that was given. Every message names `flag`, so the two options cannot drift.
 */
function parseTagPins(flag: string, values: readonly string[], inputs: readonly string[]): Map<string, string> {
  const tags = new Map<string, string>();
  for (const value of values) {
    const separator = value.lastIndexOf('=');
    if (separator < 0) throw new UsageError(`${flag} must be <input>=<tag>, for example ./web=v0.1.0-beta.97. Received: ${value}`);
    const input = value.slice(0, separator);
    const tag = value.slice(separator + 1);
    if (parseReleaseTag(tag) === null) throw new UsageError(`${flag} ${input}=${tag}: ${tag} is not a release tag, for example v0.1.0-beta.97.`);
    if (tags.has(input)) throw new UsageError(`${flag} names ${input} more than once. Give one ${flag} per repository.`);
    if (!inputs.includes(input)) throw new UsageError(`${flag} ${input}=${tag}: ${input} is not a repository input. Pass it with --repo or as a positional argument, exactly as written.`);
    tags.set(input, tag);
  }
  return tags;
}

/** `--repo` values first, then positional inputs. With none, the current directory is the input when it is a git working tree. */
function inputArguments(repo: string[], positional: string[], cwd: string): string[] {
  const given = [...repo, ...positional];
  if (given.length > 0) return given;
  if (isGitWorkTree(cwd)) return ['.'];
  throw new UsageError('No repository given, and the current directory is not a git working tree. Pass a path or an HTTPS github.com URL.');
}

function isGitWorkTree(cwd: string): boolean {
  try {
    return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
  } catch {
    return false;
  }
}

/** The validated options that shape the report. `format` and `layout` were checked against their allowed values. */
interface RenderChoice {
  subcommand: 'version' | 'notes';
  format: string;
  layout: string;
}

/**
 * The report for stdout or `--output`. A single repository in the default output gives exactly the action's bytes:
 * `version` as the bare version and a newline, `notes` as the release body. A failed single repository has no result,
 * so the report is empty and the reason goes to stderr.
 */
function render(rows: Row[], { subcommand, format, layout }: RenderChoice): string {
  if (format === 'json') return toJson(rows);
  if (rows.length === 1) {
    const [row] = rows;
    if (row.status === 'failed') return '';
    if (subcommand === 'version') return `${row.release.version}\n`;
    return layout === 'merged' ? renderMerged(rows) : row.release.notes;
  }
  if (subcommand === 'version') return `${renderSummary(rows)}\n`;
  return layout === 'merged' ? renderMerged(rows) : renderPerRepo(rows);
}

/** True when this module is the file Node was asked to run, including when a bin symlink points at it. */
function isEntry(): boolean {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? '');
  } catch {
    return false;
  }
}

if (isEntry()) process.exitCode = run(process.argv.slice(2));
